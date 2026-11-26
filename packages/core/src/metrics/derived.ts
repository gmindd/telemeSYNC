import type { RideData, RideSample } from '../telemetry/ride.ts';
import { lowerIndex } from '../util/search.ts';
import { haversine } from '../util/geo.ts';
import type { Units } from '../overlays/units.ts';

// Metrics derived from the ride for the sport-specific gadgets: pace and steps for running, vertical speed,
// slope in degrees and ski runs, and the way back to the start for the compass. Arrays are computed once per
// ride and cached.

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

// ---------------------------------------------------------------------------------------------
// Pace and steps.

/** Seconds per km (metric) or per mile (imperial) at a speed (m/s); NaN when stopped (< 0.5 m/s). */
export function paceSeconds(speed: number, u: Units): number {
  if (!(speed >= 0.5)) return NaN;
  return (u.system === 'metric' ? 1000 : 1609.344) / speed;
}

/** Pace as m'ss" (e.g. 4'52"); "—" when stopped. Over an hour per unit shows h:mm'ss". */
export function formatPace(speed: number, u: Units): string {
  const s = paceSeconds(speed, u);
  if (!Number.isFinite(s) || s > 5999) return '—';
  const total = Math.round(s);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}'${String(sec).padStart(2, '0')}"`;
}

export const paceUnit = (u: Units) => (u.system === 'metric' ? '/km' : '/mi');

/** Running and walking cadence is recorded per leg (strides/min): steps per minute are twice that. */
export function stepsPerMin(cadence: number): number {
  return Number.isFinite(cadence) ? cadence * 2 : NaN;
}

/** Slope in degrees from a grade in percent. */
export function slopeDegrees(gradePct: number): number {
  return Number.isFinite(gradePct) ? toDeg(Math.atan(gradePct / 100)) : NaN;
}

// ---------------------------------------------------------------------------------------------
// Vertical speed.

const VS_HALF_MS = 15_000;
const vsCache = new WeakMap<RideData, Float64Array>();

/** Climbing (+) or descending (−) rate in m/h over ±15 s of filtered altitude; NaN without altitude. */
export function verticalSpeedArray(ride: RideData): Float64Array {
  let out = vsCache.get(ride);
  if (out) return out;
  const n = ride.t.length;
  out = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, lowerIndex(ride.t, ride.t[i] - VS_HALF_MS));
    let b = lowerIndex(ride.t, ride.t[i] + VS_HALF_MS);
    b = Math.min(n - 1, Math.max(i, b));
    const dt = (ride.t[b] - ride.t[a]) / 3600_000;
    const da = ride.altitude[b] - ride.altitude[a];
    if (dt > 0 && Number.isFinite(da)) out[i] = da / dt;
  }
  vsCache.set(ride, out);
  return out;
}

/** Vertical speed (m/h) at a sample, interpolated; NaN outside the ride. */
export function verticalSpeedAt(ride: RideData, s: RideSample): number {
  if (s.outside) return NaN;
  const a = verticalSpeedArray(ride);
  const i = s.index;
  const j = Math.min(a.length - 1, i + 1);
  const f = s.fractionalIndex - i;
  return Number.isFinite(a[j]) ? a[i] + (a[j] - a[i]) * f : a[i];
}

// ---------------------------------------------------------------------------------------------
// Ski runs.

/** A descent counts as a run once it has dropped this much; climbing this much again (lift) ends it. */
const RUN_THRESHOLD_M = 30;

export interface SkiRuns {
  /** Runs started so far, per sample. */
  count: Int32Array;
  /** Vertical drop of the current (or last) run so far, m. */
  drop: Float64Array;
  /** Vertical drop of all runs so far, m. */
  total: Float64Array;
}

const runsCache = new WeakMap<RideData, SkiRuns>();

/**
 * Runs found by hysteresis on the altitude: falling RUN_THRESHOLD_M below the last high point starts a run,
 * rising RUN_THRESHOLD_M above the last low point (a lift, a climb) ends it. Small bumps inside a run do not
 * split it.
 */
export function skiRuns(ride: RideData): SkiRuns {
  let r = runsCache.get(ride);
  if (r) return r;
  const n = ride.t.length;
  const count = new Int32Array(n);
  const drop = new Float64Array(n);
  const total = new Float64Array(n);
  let state: 'up' | 'down' = 'up';
  let high = NaN;
  let low = NaN;
  let runs = 0;
  let runTop = NaN;
  let lastDrop = 0;
  let doneTotal = 0;
  for (let i = 0; i < n; i++) {
    const a = ride.altitude[i];
    if (Number.isFinite(a)) {
      if (state === 'up') {
        if (!(a <= high)) high = a;
        if (high - a >= RUN_THRESHOLD_M) {
          state = 'down';
          runs++;
          runTop = high;
          low = a;
        }
      } else {
        if (!(a >= low)) low = a;
        if (a - low >= RUN_THRESHOLD_M) {
          state = 'up';
          doneTotal += runTop - low;
          lastDrop = runTop - low;
          high = a;
        }
      }
    }
    const cur = state === 'down' ? runTop - (Number.isFinite(low) ? low : runTop) : 0;
    count[i] = runs;
    drop[i] = state === 'down' ? cur : lastDrop;
    total[i] = doneTotal + cur;
  }
  r = { count, drop, total };
  runsCache.set(ride, r);
  return r;
}

// ---------------------------------------------------------------------------------------------
// Back to the start.

/** Initial bearing from one point to another, degrees clockwise from north (0..360). */
export function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const startCache = new WeakMap<RideData, { lat: number; lon: number } | null>();

function startOf(ride: RideData): { lat: number; lon: number } | null {
  let s = startCache.get(ride);
  if (s !== undefined) return s;
  s = null;
  for (let i = 0; i < ride.t.length; i++) {
    if (Number.isFinite(ride.lat[i]) && Number.isFinite(ride.lon[i])) {
      s = { lat: ride.lat[i], lon: ride.lon[i] };
      break;
    }
  }
  startCache.set(ride, s);
  return s;
}

/** Direction (degrees from north) and distance (m) from the rider back to the start; null without positions. */
export function toStart(ride: RideData, s: RideSample): { bearing: number; distance: number } | null {
  const st = startOf(ride);
  if (!st || !Number.isFinite(s.lat) || !Number.isFinite(s.lon)) return null;
  return { bearing: bearing(s.lat, s.lon, st.lat, st.lon), distance: haversine(s.lat, s.lon, st.lat, st.lon) };
}

/** Cardinal abbreviation of a heading in degrees (N, NE, E…). */
export function cardinal(deg: number): string {
  if (!Number.isFinite(deg)) return '';
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return names[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}
