import type { RideData } from '../telemetry/ride.ts';
import { lowerIndex } from '../util/search.ts';
import type { Units } from '../overlays/units.ts';

// Running and trail figures: pace from the distance (steadier than GPS speed), splits per km / mile,
// grade adjusted pace and vertical speed. All work on the ride's own clock (UTC ms).

/** Distance from the start at instant t (m), interpolated; clamped to the ride. */
export function distanceAt(ride: RideData, t: number): number {
  const n = ride.t.length;
  const i = lowerIndex(ride.t, t);
  if (i < 0) return ride.distance[0] ?? 0;
  if (i >= n - 1) return ride.distance[n - 1];
  const f = (t - ride.t[i]) / Math.max(1, ride.t[i + 1] - ride.t[i]);
  return ride.distance[i] + (ride.distance[i + 1] - ride.distance[i]) * f;
}

function valueAt(ride: RideData, arr: Float64Array, t: number): number {
  const n = ride.t.length;
  const i = lowerIndex(ride.t, t);
  if (i < 0) return arr[0];
  if (i >= n - 1) return arr[n - 1];
  const a = arr[i];
  const b = arr[i + 1];
  if (Number.isNaN(a)) return b;
  if (Number.isNaN(b)) return a;
  return a + (b - a) * ((t - ride.t[i]) / Math.max(1, ride.t[i + 1] - ride.t[i]));
}

/** Start of the stretch without pauses that contains t, looking back at most `windowMs`. */
function windowStart(ride: RideData, t: number, windowMs: number): number {
  let from = Math.max(ride.startTime, t - windowMs);
  let i = lowerIndex(ride.t, t);
  if (i < 0) return t;
  // A pause inside the window: only the part after it counts.
  while (i > 0 && ride.t[i] > from) {
    if (ride.t[i] - ride.t[i - 1] > ride.gapThresholdMs) {
      from = ride.t[i];
      break;
    }
    i--;
  }
  return from;
}

/** Below this speed the runner is standing: no pace (m/s). */
export const STOPPED_MS = 0.6;

/**
 * Speed over the last `windowMs` from the distance (m/s), as running watches show current pace.
 * NaN outside the ride, inside a pause, or when standing.
 */
export function runSpeedAt(ride: RideData, t: number, windowMs = 10_000): number {
  if (t < ride.startTime || t > ride.endTime) return NaN;
  const i = lowerIndex(ride.t, t);
  if (i >= 0 && i < ride.t.length - 1 && ride.t[i + 1] - ride.t[i] > ride.gapThresholdMs) return NaN;
  const from = windowStart(ride, t, windowMs);
  const dt = (t - from) / 1000;
  if (dt < 2) return NaN;
  const v = (distanceAt(ride, t) - distanceAt(ride, from)) / dt;
  return v >= STOPPED_MS ? v : NaN;
}

/** Metres in one pace unit: a km or a mile. */
export const paceUnitM = (u: Units) => (u.system === 'metric' ? 1000 : 1609.344);
export const paceUnit = (u: Units) => (u.system === 'metric' ? '/km' : '/mi');

/** Pace "m:ss" (or "h:mm:ss") per km / mile for a speed in m/s; "—" when standing or slower than 60 min/unit. */
export function formatPace(speedMs: number, u: Units): string {
  if (!(speedMs >= STOPPED_MS)) return '—';
  const sec = Math.round(paceUnitM(u) / speedMs);
  if (sec >= 3600) return '—';
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** Time "m:ss" / "h:mm:ss" without tenths (race clock). */
export function formatClock(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  const s = Math.round(Math.abs(ms) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return (ms < 0 ? '−' : '') + (h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`);
}

/**
 * Metabolic cost of running on a grade (J/kg/m), Minetti et al. 2002; grade as a fraction, held to
 * ±45 % where the fit is valid.
 */
export function runningCost(grade: number): number {
  const i = Math.max(-0.45, Math.min(0.45, grade));
  return 155.4 * i ** 5 - 30.4 * i ** 4 - 43.3 * i ** 3 + 46.3 * i ** 2 + 19.5 * i + 3.6;
}

/** Grade adjusted speed: the flat-ground speed with the same effort (m/s). `gradePct` in percent. */
export function gradeAdjustedSpeed(speedMs: number, gradePct: number): number {
  if (!Number.isFinite(speedMs)) return NaN;
  const g = Number.isFinite(gradePct) ? gradePct / 100 : 0;
  return (speedMs * runningCost(g)) / runningCost(0);
}

/** Vertical speed over the last `windowMs` (m/h, negative going down). NaN without altitude. */
export function verticalSpeedAt(ride: RideData, t: number, windowMs = 60_000): number {
  if (!ride.available.has('altitude') || t < ride.startTime || t > ride.endTime) return NaN;
  const from = windowStart(ride, t, windowMs);
  const dt = (t - from) / 1000;
  if (dt < 10) return NaN;
  return ((valueAt(ride, ride.altitude, t) - valueAt(ride, ride.altitude, from)) / dt) * 3600;
}

export interface Split {
  /** 1-based number of the km / mile. */
  n: number;
  startMs: number;
  endMs: number;
  /** Metres covered (the unit, or less for the last, unfinished one). */
  distanceM: number;
}

const splitCache = new WeakMap<RideData, Map<number, Split[]>>();

/** First instant the distance reaches `d` at or after sample `from` (interpolated), or NaN. */
function timeAtDistance(ride: RideData, d: number, from: number): { t: number; i: number } {
  for (let i = Math.max(1, from); i < ride.t.length; i++) {
    if (ride.distance[i] >= d) {
      const d0 = ride.distance[i - 1];
      const f = ride.distance[i] > d0 ? (d - d0) / (ride.distance[i] - d0) : 0;
      return { t: ride.t[i - 1] + (ride.t[i] - ride.t[i - 1]) * f, i };
    }
  }
  return { t: NaN, i: ride.t.length };
}

/** Every full km / mile of the ride, plus the last part (cached per ride and unit). */
export function splits(ride: RideData, unitM: number): Split[] {
  let byUnit = splitCache.get(ride);
  if (!byUnit) splitCache.set(ride, (byUnit = new Map()));
  const hit = byUnit.get(unitM);
  if (hit) return hit;
  const out: Split[] = [];
  const total = ride.totals.distanceM;
  let start = ride.startTime;
  let idx = 0;
  for (let n = 1; n * unitM <= total; n++) {
    const at = timeAtDistance(ride, n * unitM, idx);
    if (!Number.isFinite(at.t)) break;
    out.push({ n, startMs: start, endMs: at.t, distanceM: unitM });
    start = at.t;
    idx = at.i;
  }
  const rest = total - out.length * unitM;
  if (rest > 1) out.push({ n: out.length + 1, startMs: start, endMs: ride.endTime, distanceM: rest });
  byUnit.set(unitM, out);
  return out;
}

/** The split being run at instant t (undefined before the start / after the end). */
export function splitAt(list: Split[], t: number): Split | undefined {
  return list.find((s) => t >= s.startMs && t < s.endMs);
}

// ---------------------------------------------------------------------------------------- PR ghost

/** The runner's personal record to race against: distance, time and where the race starts. */
export interface Ghost {
  distanceM: number;
  timeMs: number;
  /** Start of the race on the ride's clock; null = the start of the activity. */
  startMs: number | null;
}

export interface GhostState {
  /** Before the start: elapsed is negative. */
  elapsedMs: number;
  started: boolean;
  /** Metres run since the start / covered by the ghost (PR pace), both capped at the distance. */
  myM: number;
  ghostM: number;
  /** Time behind the PR (ms; negative = ahead): elapsed − the PR's time at the distance run. */
  deltaMs: number;
  /** When the runner reached the distance (ms from the start), or NaN. */
  finishMs: number;
  finished: boolean;
  /** Finish time at the average pace so far, or NaN early on. */
  projectedMs: number;
}

const finishCache = new WeakMap<RideData, Map<string, number>>();

/** Race against the PR at instant t. */
export function ghostAt(ride: RideData, g: Ghost, t: number): GhostState {
  const start = g.startMs ?? ride.startTime;
  const elapsedMs = t - start;
  const d0 = distanceAt(ride, start);
  const key = `${start}:${g.distanceM}`;
  let cache = finishCache.get(ride);
  if (!cache) finishCache.set(ride, (cache = new Map()));
  let finishAt = cache.get(key);
  if (finishAt === undefined) {
    finishAt = timeAtDistance(ride, d0 + g.distanceM, Math.max(1, lowerIndex(ride.t, start))).t;
    cache.set(key, finishAt);
  }
  const finishMs = finishAt - start;
  const finished = Number.isFinite(finishAt) && t >= finishAt;
  const started = elapsedMs >= 0;
  const run = started ? Math.max(0, distanceAt(ride, Math.min(t, finished ? finishAt : t)) - d0) : 0;
  const myM = Math.min(g.distanceM, run);
  const ghostM = started ? Math.min(g.distanceM, (elapsedMs / g.timeMs) * g.distanceM) : 0;
  const deltaMs = finished ? finishMs - g.timeMs : started ? elapsedMs - (myM / g.distanceM) * g.timeMs : 0;
  const projectedMs = finished ? finishMs : started && myM > Math.min(200, g.distanceM * 0.05) ? (elapsedMs * g.distanceM) / myM : NaN;
  return { elapsedMs, started, myM, ghostM, deltaMs, finishMs: Number.isFinite(finishMs) ? finishMs : NaN, finished, projectedMs };
}
