import type { RideData } from '../telemetry/ride.ts';
import { gradeOverDistance } from './grade.ts';

// Ski / snowboard: the day split into runs (descents) and lifts (climbs) from the altitude.

export interface SnowRun {
  /** 1-based number of the run. */
  n: number;
  startMs: number;
  endMs: number;
  /** Altitude lost from the top to the bottom (m). */
  dropM: number;
}

export interface RunOptions {
  /** A turn from climbing to descending (or back) counts once the altitude moved this much (m). */
  hysteresisM?: number;
  /** Descents smaller than this are not runs (m). */
  minDropM?: number;
  /** Descents slower than this on average are walks, not runs (m/s). */
  minAvgSpeed?: number;
}

const runCache = new WeakMap<RideData, SnowRun[]>();

/**
 * Runs of a ski day: from each top to the next bottom, when the drop and the speed say it is a run
 * (a lift or a walk back up separates them). Cached per ride with the default options.
 */
export function detectRuns(ride: RideData, opts: RunOptions = {}): SnowRun[] {
  const cacheable = Object.keys(opts).length === 0;
  if (cacheable) {
    const hit = runCache.get(ride);
    if (hit) return hit;
  }
  const H = opts.hysteresisM ?? 25;
  const minDrop = opts.minDropM ?? 40;
  const minSpeed = opts.minAvgSpeed ?? 2;
  const alt = ride.altitude;
  const n = ride.t.length;
  const out: SnowRun[] = [];
  if (!ride.available.has('altitude') || n < 3) return out;

  // Turning points with hysteresis: [index, 'top' | 'bottom'].
  const turns: { i: number; kind: 'top' | 'bottom' }[] = [];
  let dir: 'up' | 'down' | null = null;
  let hi = 0;
  let lo = 0;
  for (let i = 0; i < n; i++) {
    const a = alt[i];
    if (Number.isNaN(a)) continue;
    if (Number.isNaN(alt[hi]) || a > alt[hi]) hi = i;
    if (Number.isNaN(alt[lo]) || a < alt[lo]) lo = i;
    if (dir !== 'down' && alt[hi] - a >= H) {
      turns.push({ i: hi, kind: 'top' });
      dir = 'down';
      lo = i;
    } else if (dir !== 'up' && a - alt[lo] >= H) {
      turns.push({ i: lo, kind: 'bottom' });
      dir = 'up';
      hi = i;
    }
  }
  // The day ends going down: the last bottom is the lowest point since the last top.
  if (dir === 'down') turns.push({ i: lo, kind: 'bottom' });

  for (let k = 0; k + 1 < turns.length; k++) {
    const top = turns[k];
    const bottom = turns[k + 1];
    if (top.kind !== 'top' || bottom.kind !== 'bottom') continue;
    const dropM = alt[top.i] - alt[bottom.i];
    const ms = ride.t[bottom.i] - ride.t[top.i];
    const dist = ride.distance[bottom.i] - ride.distance[top.i];
    const avg = ms > 0 ? dist / (ms / 1000) : 0;
    if (dropM < minDrop || (ride.available.has('distance') && avg < minSpeed)) continue;
    out.push({ n: out.length + 1, startMs: ride.t[top.i], endMs: ride.t[bottom.i], dropM });
  }
  if (cacheable) runCache.set(ride, out);
  return out;
}

/** The run at instant t, or the lift / pause between runs ('lift'), before the first ('before') or after the last ('after'). */
export function runAt(runs: SnowRun[], t: number): { run?: SnowRun; phase: 'run' | 'lift' | 'before' | 'after'; next?: SnowRun; last?: SnowRun } {
  const run = runs.find((r) => t >= r.startMs && t < r.endMs);
  if (run) return { run, phase: 'run' };
  const last = [...runs].reverse().find((r) => r.endMs <= t);
  const next = runs.find((r) => r.startMs > t);
  if (!last) return { phase: 'before', next };
  if (!next) return { phase: 'after', last };
  return { phase: 'lift', last, next };
}

/** Slope of a grade (percent) in degrees. */
export const slopeDegrees = (gradePct: number) => (Number.isFinite(gradePct) ? (Math.atan(gradePct / 100) * 180) / Math.PI : NaN);

const gradeCache = new WeakMap<RideData, Float64Array>();

/**
 * Grade for slopes (percent): the ride's grade is held to ±35 % (right for roads and trails), ski
 * slopes go well past that, so this one goes up to ±120 % (50°) over a longer 60 m window.
 */
export function slopeGrade(ride: RideData): Float64Array {
  let g = gradeCache.get(ride);
  if (!g) gradeCache.set(ride, (g = gradeOverDistance(ride.distance, ride.altitude, 60, 120)));
  return g;
}

/** Slope at a sample (percent, interpolated by fractional index). */
export function slopeAt(ride: RideData, fractionalIndex: number): number {
  const g = slopeGrade(ride);
  const i = Math.max(0, Math.min(g.length - 1, Math.floor(fractionalIndex)));
  const j = Math.min(g.length - 1, i + 1);
  const f = fractionalIndex - i;
  return Number.isNaN(g[i]) ? g[j] : Number.isNaN(g[j]) ? g[i] : g[i] + (g[j] - g[i]) * f;
}
