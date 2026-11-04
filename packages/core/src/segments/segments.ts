import { cumulativeLoss } from '../metrics/elevation.ts';
import { sampleAt, type RideData } from '../telemetry/ride.ts';
import { lowerIndex } from '../util/search.ts';

/**
 * A stretch of the ride marked by the user: a PR attempt ("segment") or one lap of a race ("lap").
 * Times are UTC ms on the ride's clock, like the telemetry.
 */
export interface Segment {
  id: string;
  name: string;
  kind: 'segment' | 'lap';
  startMs: number;
  endMs: number;
}

/** Figures of a segment, or of its part already ridden at a given instant. */
export interface SegmentStats {
  /** Time from the start of the segment (to its end, or to the instant asked). */
  elapsedMs: number;
  /** True once the instant asked is at or after the end. */
  done: boolean;
  distanceM: number;
  gainM: number;
  lossM: number;
  /** Distance / time (stops included, as a stopwatch). NaN without distance. */
  avgSpeed: number;
  maxSpeed: number;
  avgHeartRate: number;
  maxHeartRate: number;
  /** Mean power, zeros (coasting) included. */
  avgPower: number;
  maxPower: number;
  /** Mean cadence while pedalling (zeros left out). */
  avgCadence: number;
  avgTemperature: number;
  /** Net climb over the distance, percent. */
  avgGrade: number;
}

const lossCache = new WeakMap<RideData, Float64Array>();

function lossArray(ride: RideData): Float64Array {
  let l = lossCache.get(ride);
  if (!l) lossCache.set(ride, (l = cumulativeLoss(ride.altitude)));
  return l;
}

/** Cumulative loss at an instant, interpolated between samples. */
function lossAt(ride: RideData, t: number): number {
  const l = lossArray(ride);
  const i = lowerIndex(ride.t, t);
  if (i < 0) return l[0] ?? 0;
  if (i >= ride.t.length - 1) return l[ride.t.length - 1];
  const f = (t - ride.t[i]) / Math.max(1, ride.t[i + 1] - ride.t[i]);
  return l[i] + (l[i + 1] - l[i]) * f;
}

interface Acc {
  sum: number;
  n: number;
  max: number;
}

const acc = (): Acc => ({ sum: 0, n: 0, max: NaN });

function add(a: Acc, v: number, skipZero = false) {
  if (Number.isNaN(v) || (skipZero && !(v > 0))) return;
  a.sum += v;
  a.n++;
  if (!(v <= a.max)) a.max = v;
}

const mean = (a: Acc) => (a.n ? a.sum / a.n : NaN);

const doneCache = new WeakMap<RideData, Map<string, SegmentStats>>();

/**
 * Stats of `seg` up to instant `t` (Infinity = the whole segment). Null before the segment starts.
 * Finished segments are cached per ride, so the laps table costs nothing per frame.
 */
export function segmentStats(ride: RideData, seg: Pick<Segment, 'startMs' | 'endMs'>, t = Infinity): SegmentStats | null {
  const a = seg.startMs;
  const end = Math.max(a, seg.endMs);
  if (!(t > a)) return null;
  const done = t >= end;
  const key = `${a}:${end}`;
  if (done) {
    const hit = doneCache.get(ride)?.get(key);
    if (hit) return hit;
  }
  const b = Math.min(end, t);
  const s0 = sampleAt(ride, a);
  const s1 = sampleAt(ride, b);
  const distanceM = Math.max(0, s1.distance - s0.distance);
  const hasDist = ride.available.has('distance');
  const elapsedMs = b - a;

  const speed = acc();
  const hr = acc();
  const power = acc();
  const cad = acc();
  const temp = acc();
  const i0 = Math.max(0, lowerIndex(ride.t, a) + 1);
  for (let i = i0; i < ride.t.length && ride.t[i] <= b; i++) {
    add(speed, ride.speed[i]);
    add(hr, ride.heartRate[i]);
    add(power, ride.power[i]);
    add(cad, ride.cadence[i], true);
    add(temp, ride.temperature[i]);
  }
  const hasAlt = ride.available.has('altitude');
  const stats: SegmentStats = {
    elapsedMs,
    done,
    distanceM: hasDist ? distanceM : NaN,
    gainM: hasAlt ? Math.max(0, s1.elevationGain - s0.elevationGain) : NaN,
    lossM: hasAlt ? Math.max(0, lossAt(ride, b) - lossAt(ride, a)) : NaN,
    avgSpeed: hasDist && elapsedMs > 0 ? distanceM / (elapsedMs / 1000) : NaN,
    maxSpeed: speed.max,
    avgHeartRate: mean(hr),
    maxHeartRate: hr.max,
    avgPower: mean(power),
    maxPower: power.max,
    avgCadence: mean(cad),
    avgTemperature: mean(temp),
    avgGrade: hasAlt && distanceM > 20 ? ((s1.altitude - s0.altitude) / distanceM) * 100 : NaN,
  };
  if (done) {
    let m = doneCache.get(ride);
    if (!m) doneCache.set(ride, (m = new Map()));
    m.set(key, stats);
  }
  return stats;
}

/** Segments in time order. */
export function sortedSegments(segments: readonly Segment[] | undefined): Segment[] {
  return [...(segments ?? [])].sort((x, y) => x.startMs - y.startMs || x.endMs - y.endMs);
}

/**
 * The segment to show at instant t. A segment just finished shows its result for `resultMs`, even when
 * the next lap has already started at the line; then the segment being ridden (the latest started);
 * with none, the last result stays up to `holdMs` after its end. Undefined otherwise.
 */
export function segmentAt(
  segments: readonly Segment[] | undefined,
  t: number,
  resultMs = 8_000,
  holdMs = 15_000,
): { seg: Segment; index: number; running: boolean } | undefined {
  const list = sortedSegments(segments);
  const finished = (within: number) => {
    let found: { seg: Segment; index: number; running: boolean } | undefined;
    list.forEach((seg, index) => {
      if (t >= seg.endMs && t < seg.endMs + within && (!found || seg.endMs > found.seg.endMs)) found = { seg, index, running: false };
    });
    return found;
  };
  const justDone = finished(resultMs);
  if (justDone) return justDone;
  let running: { seg: Segment; index: number; running: boolean } | undefined;
  list.forEach((seg, index) => {
    if (t >= seg.startMs && t < seg.endMs) running = { seg, index, running: true };
  });
  return running ?? finished(holdMs);
}

/** Best (shortest) finished segment of the same kind before instant t, excluding `exceptId`. */
export function bestBefore(ride: RideData, segments: readonly Segment[] | undefined, kind: Segment['kind'], t: number, exceptId?: string): { seg: Segment; ms: number } | undefined {
  let best: { seg: Segment; ms: number } | undefined;
  for (const seg of segments ?? []) {
    if (seg.kind !== kind || seg.id === exceptId || seg.endMs > t) continue;
    const ms = seg.endMs - seg.startMs;
    if (!best || ms < best.ms) best = { seg, ms };
  }
  return best;
}

/** Segment time with tenths: "42.3", "4:05.2", "1:02:03.4" (decimal point or comma). */
export function formatLapTime(ms: number, decimal = '.'): string {
  if (!Number.isFinite(ms)) return '—';
  const neg = ms < 0;
  const tenths = Math.floor(Math.abs(ms) / 100);
  const s = Math.floor(tenths / 10);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const t = tenths % 10;
  const pad = (v: number) => String(v).padStart(2, '0');
  const body = h ? `${h}:${pad(m)}:${pad(ss)}${decimal}${t}` : m ? `${m}:${pad(ss)}${decimal}${t}` : `${ss}${decimal}${t}`;
  return (neg ? '−' : '') + body;
}

let segCounter = 0;
export function newSegmentId(): string {
  return `seg${Date.now().toString(36)}${++segCounter}`;
}
