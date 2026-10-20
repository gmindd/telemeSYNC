import { haversine } from '../util/geo.ts';
import { lowerIndex } from '../util/search.ts';
import { cumulativeGain, filterAltitude } from '../metrics/elevation.ts';
import { gradeOverDistance } from '../metrics/grade.ts';
import { movingAverageByTime } from '../metrics/smoothing.ts';
import type { ChannelKey, RawSample, RawTelemetry } from './types.ts';

export type MetricKey =
  | 'speed'
  | 'altitude'
  | 'grade'
  | 'heartRate'
  | 'cadence'
  | 'power'
  | 'temperature'
  | 'distance'
  | 'elevationGain'
  | 'elapsedTime'
  | 'localTime'
  | 'map'
  | 'elevationProfile';

export interface RideOptions {
  /** Samples further apart than this are treated as a gap (pause / signal loss). */
  gapThresholdMs?: number;
  /** Speed smoothing window. */
  speedWindowMs?: number;
  /** Distance window used for grade. */
  gradeWindowM?: number;
  /** Absolute grade limit (%). */
  gradeMaxAbs?: number;
  /** Elevation gain hysteresis (m). */
  gainThresholdM?: number;
  /** How long a sensor reading is kept when the next records have no value (ms). */
  sensorHoldMs?: number;
}

/**
 * Fills missing values with the last reading, for at most `maxHoldMs` after it and never across a
 * gap longer than `gapMs` (a pause or a lost signal shows no data instead of an old value).
 */
export function holdLast(t: Float64Array, arr: Float64Array, maxHoldMs: number, gapMs: number): Float64Array {
  const out = new Float64Array(arr.length);
  let lastV = NaN;
  let lastT = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    if (i > 0 && t[i] - t[i - 1] > gapMs) lastV = NaN;
    const v = arr[i];
    if (!Number.isNaN(v)) {
      lastV = v;
      lastT = t[i];
      out[i] = v;
    } else out[i] = !Number.isNaN(lastV) && t[i] - lastT <= maxHoldMs ? lastV : NaN;
  }
  return out;
}

/** Normalised, derived telemetry for a whole ride. All arrays share the same index. */
export interface RideData {
  source: RawTelemetry['source'];
  name?: string;
  device?: string;
  localOffsetMs?: number;
  startTime: number;
  endTime: number;
  gapThresholdMs: number;
  t: Float64Array;
  lat: Float64Array;
  lon: Float64Array;
  altitudeRaw: Float64Array;
  altitude: Float64Array;
  /** m/s, smoothed. */
  speed: Float64Array;
  /** Cumulative metres from ride start. */
  distance: Float64Array;
  elevationGain: Float64Array;
  /** Percent. */
  grade: Float64Array;
  heartRate: Float64Array;
  cadence: Float64Array;
  power: Float64Array;
  temperature: Float64Array;
  /** Which raw channels exist in the file. */
  channels: Set<ChannelKey>;
  /** Which metrics/overlays can be shown for this ride. */
  available: Set<MetricKey>;
  totals: {
    durationMs: number;
    distanceM: number;
    elevationGainM: number;
    maxSpeed: number;
    avgMovingSpeed: number;
  };
}

function column(raw: RawTelemetry, key: keyof RawTelemetry['samples'][number]): Float64Array {
  const out = new Float64Array(raw.samples.length);
  raw.samples.forEach((s, i) => {
    const v = s[key];
    out[i] = typeof v === 'number' ? v : NaN;
  });
  return out;
}

function hasAny(a: Float64Array, minCount = 2): boolean {
  let c = 0;
  for (let i = 0; i < a.length; i++) if (!Number.isNaN(a[i]) && ++c >= minCount) return true;
  return false;
}

export function buildRide(raw: RawTelemetry, opts: RideOptions = {}): RideData {
  const gapThresholdMs = opts.gapThresholdMs ?? 10_000;
  // Sort, and merge records that share a timestamp (some watches write GPS and heart rate as
  // separate records of the same second): a field missing in one is taken from the other.
  const sorted = [...raw.samples].sort((a, b) => a.t - b.t);
  const dedup: RawSample[] = [];
  for (const s of sorted) {
    const last = dedup[dedup.length - 1];
    if (last && last.t === s.t) {
      for (const k of Object.keys(s) as (keyof RawSample)[]) {
        if (last[k] === undefined && s[k] !== undefined) (last as unknown as Record<string, number>)[k] = s[k] as number;
      }
    } else dedup.push({ ...s });
  }
  if (dedup.length < 2) throw new Error('A telemetria tem pontos insuficientes.');
  const r: RawTelemetry = { ...raw, samples: dedup };
  const n = dedup.length;

  const t = column(r, 't');
  const lat = column(r, 'lat');
  const lon = column(r, 'lon');
  const altitudeRaw = column(r, 'altitude');
  const speedRaw = column(r, 'speed');
  const distRaw = column(r, 'distance');
  const heartRateRaw = column(r, 'heartRate');
  const cadenceRaw = column(r, 'cadence');
  const powerRaw = column(r, 'power');
  const temperatureRaw = column(r, 'temperature');

  const channels = new Set<ChannelKey>();
  const hasPos = hasAny(lat);
  if (hasPos) channels.add('position');
  if (hasAny(altitudeRaw)) channels.add('altitude');
  if (hasAny(speedRaw)) channels.add('speed');
  if (hasAny(distRaw)) channels.add('distance');
  if (hasAny(heartRateRaw)) channels.add('heartRate');
  if (hasAny(cadenceRaw)) channels.add('cadence');
  if (hasAny(powerRaw)) channels.add('power');
  if (hasAny(temperatureRaw)) channels.add('temperature');

  // Sensors that do not write a value in every record (watches often measure heart rate every few
  // seconds): the last reading stays until the next one, for up to 30 s and never across a pause.
  const hold = (a: Float64Array) => holdLast(t, a, opts.sensorHoldMs ?? 30_000, gapThresholdMs);
  const heartRate = hold(heartRateRaw);
  const cadence = hold(cadenceRaw);
  const power = hold(powerRaw);
  const temperature = hold(temperatureRaw);

  // Distance: device distance if present (monotonic), else integrated haversine.
  const distance = new Float64Array(n);
  if (channels.has('distance')) {
    let last = NaN;
    let base = NaN;
    for (let i = 0; i < n; i++) {
      if (!Number.isNaN(distRaw[i])) {
        if (Number.isNaN(base)) base = distRaw[i];
        last = Math.max(Number.isNaN(last) ? 0 : last, distRaw[i] - base);
      }
      distance[i] = Number.isNaN(last) ? 0 : last;
    }
  } else if (hasPos) {
    let acc = 0;
    let pi = -1;
    for (let i = 0; i < n; i++) {
      if (!Number.isNaN(lat[i])) {
        if (pi >= 0) acc += haversine(lat[pi], lon[pi], lat[i], lon[i]);
        pi = i;
      }
      distance[i] = acc;
    }
  }

  // Speed: device speed if present, else Δdistance/Δt. Smoothed.
  const speedInst = new Float64Array(n);
  if (channels.has('speed')) {
    speedInst.set(speedRaw);
  } else if (channels.has('distance') || hasPos) {
    speedInst[0] = 0;
    for (let i = 1; i < n; i++) {
      const dt = (t[i] - t[i - 1]) / 1000;
      speedInst[i] = dt > 0 && t[i] - t[i - 1] <= gapThresholdMs ? (distance[i] - distance[i - 1]) / dt : 0;
    }
  } else speedInst.fill(NaN);
  const speed = movingAverageByTime(t, speedInst, opts.speedWindowMs ?? 3000);

  const hasAlt = channels.has('altitude');
  const altitude = hasAlt ? filterAltitude(t, altitudeRaw) : new Float64Array(n).fill(NaN);
  const elevationGain = hasAlt ? cumulativeGain(altitude, opts.gainThresholdM ?? 2.5) : new Float64Array(n);
  const hasDist = channels.has('distance') || hasPos;
  const grade = hasAlt && hasDist
    ? gradeOverDistance(distance, altitude, opts.gradeWindowM ?? 40, opts.gradeMaxAbs ?? 35)
    : new Float64Array(n).fill(NaN);

  const available = new Set<MetricKey>(['elapsedTime', 'localTime']);
  if (hasAny(speed)) available.add('speed');
  if (hasAlt) available.add('altitude').add('elevationGain').add('elevationProfile');
  if (hasAlt && hasDist) available.add('grade');
  if (hasDist) available.add('distance');
  if (hasPos) available.add('map');
  for (const k of ['heartRate', 'cadence', 'power', 'temperature'] as const) if (channels.has(k)) available.add(k);

  let maxSpeed = 0;
  let movingMs = 0;
  for (let i = 0; i < n; i++) {
    if (speed[i] > maxSpeed) maxSpeed = speed[i];
    if (i > 0 && t[i] - t[i - 1] <= gapThresholdMs && speed[i] > 0.5) movingMs += t[i] - t[i - 1];
  }

  return {
    source: raw.source,
    name: raw.name,
    device: raw.device,
    localOffsetMs: raw.localOffsetMs,
    startTime: t[0],
    endTime: t[n - 1],
    gapThresholdMs,
    t,
    lat,
    lon,
    altitudeRaw,
    altitude,
    speed,
    distance,
    elevationGain,
    grade,
    heartRate,
    cadence,
    power,
    temperature,
    channels,
    available,
    totals: {
      durationMs: t[n - 1] - t[0],
      distanceM: distance[n - 1],
      elevationGainM: elevationGain[n - 1],
      maxSpeed,
      avgMovingSpeed: movingMs > 0 ? distance[n - 1] / (movingMs / 1000) : 0,
    },
  };
}

/** Values of every metric at an instant. NaN = not available at that instant. */
export interface RideSample {
  t: number;
  /** True when `t` falls inside a gap > gapThreshold, or outside the ride. */
  inGap: boolean;
  /** True when `t` is before start / after end. */
  outside: boolean;
  /** Index of the last sample <= t (clamped to 0..n-1). */
  index: number;
  /** Fractional index (index + fraction to the next sample), for smooth markers. */
  fractionalIndex: number;
  lat: number;
  lon: number;
  speed: number;
  altitude: number;
  grade: number;
  distance: number;
  elevationGain: number;
  heartRate: number;
  cadence: number;
  power: number;
  temperature: number;
  elapsedMs: number;
}

export interface SampleOptions {
  /** What speed shows inside a gap: 0 or NaN (rendered as "—"). */
  gapSpeed?: 'zero' | 'dash';
}

function lerp(a: number, b: number, f: number): number {
  if (Number.isNaN(a)) return b;
  if (Number.isNaN(b)) return a;
  return a + (b - a) * f;
}

/** Linear interpolation of every channel at instant `t` (UTC ms). */
export function sampleAt(ride: RideData, time: number, opts: SampleOptions = {}): RideSample {
  const n = ride.t.length;
  const i = lowerIndex(ride.t, time);
  const outside = i < 0 || (i === n - 1 && time > ride.t[n - 1]);
  const i0 = Math.max(0, Math.min(n - 1, i));
  const i1 = Math.min(n - 1, i0 + 1);
  const span = ride.t[i1] - ride.t[i0];
  const inGap = outside || (span > ride.gapThresholdMs && i0 !== i1);
  const f = i < 0 ? 0 : i0 === i1 || span <= 0 ? 0 : Math.max(0, Math.min(1, (time - ride.t[i0]) / span));

  const ff = inGap ? 0 : f;
  const at = (arr: Float64Array) => lerp(arr[i0], arr[i1], ff);
  const gapSpeed = (opts.gapSpeed ?? 'zero') === 'zero' ? 0 : NaN;
  const instantaneousOrNaN = (arr: Float64Array) => (outside ? NaN : inGap ? arr[i0] : at(arr));

  return {
    t: time,
    inGap,
    outside,
    index: i0,
    fractionalIndex: i0 + ff,
    lat: at(ride.lat),
    lon: at(ride.lon),
    speed: inGap ? gapSpeed : at(ride.speed),
    altitude: at(ride.altitude),
    grade: inGap ? (outside ? NaN : ride.grade[i0]) : at(ride.grade),
    distance: at(ride.distance),
    elevationGain: at(ride.elevationGain),
    heartRate: inGap ? NaN : at(ride.heartRate),
    cadence: inGap ? (outside ? NaN : 0) : at(ride.cadence),
    power: inGap ? (outside ? NaN : 0) : at(ride.power),
    temperature: instantaneousOrNaN(ride.temperature),
    elapsedMs: Math.max(0, Math.min(time, ride.endTime) - ride.startTime),
  };
}
