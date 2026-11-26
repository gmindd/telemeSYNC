import { fillGapsLinear, medianFilter, movingAverageByTime } from './smoothing.ts';

/** A stretch of the ride and the climb (or descent) the device measured over it, in metres. */
export interface DeviceTotal {
  startMs: number;
  endMs: number;
  total: number;
}

/** Removes barometric/GPS noise: median (spikes) followed by a moving average. */
export function filterAltitude(t: Float64Array, alt: Float64Array, opts: { medianRadius?: number; averageMs?: number } = {}): Float64Array {
  const filled = fillGapsLinear(t, alt);
  const med = medianFilter(filled, opts.medianRadius ?? 3);
  return movingAverageByTime(t, med, opts.averageMs ?? 10_000);
}

/** Cumulative elevation gain with hysteresis so that noise below `threshold` metres is ignored. */
export function cumulativeGain(alt: Float64Array, threshold = 2.5): Float64Array {
  const n = alt.length;
  const out = new Float64Array(n);
  let gain = 0;
  let ref = NaN;
  for (let i = 0; i < n; i++) {
    const a = alt[i];
    if (!Number.isNaN(a)) {
      if (Number.isNaN(ref)) ref = a;
      else if (a - ref >= threshold) {
        gain += a - ref;
        ref = a;
      } else if (ref - a >= threshold) {
        ref = a;
      }
    }
    out[i] = gain;
  }
  return out;
}

/** Cumulative elevation loss (positive metres), same hysteresis as `cumulativeGain`. */
export function cumulativeLoss(alt: Float64Array, threshold = 2.5): Float64Array {
  const n = alt.length;
  const out = new Float64Array(n);
  let loss = 0;
  let ref = NaN;
  for (let i = 0; i < n; i++) {
    const a = alt[i];
    if (!Number.isNaN(a)) {
      if (Number.isNaN(ref)) ref = a;
      else if (ref - a >= threshold) {
        loss += ref - a;
        ref = a;
      } else if (a - ref >= threshold) {
        ref = a;
      }
    }
    out[i] = loss;
  }
  return out;
}

/**
 * Elevation gain and loss so far at each sample (m), from the altitude as recorded: only isolated spikes are taken out
 * (a 3-point median) and changes smaller than the altitude's noise ignored (0.75 m for a barometer, see changeThreshold). The altitude shown on screen is smoothed more (filterAltitude),
 * but counting the climb on that smoothed line leaves out a lot of short ups and downs: on real rides it came out
 * 20–30 % under what the bike computer said. This count stays within a few percent of it; files that carry the
 * device's own totals are then matched to them exactly (matchDeviceTotals).
 */
export function elevationChange(t: Float64Array, altRaw: Float64Array): { gain: Float64Array; loss: Float64Array } {
  const alt = medianFilter(fillGapsLinear(t, altRaw), 1);
  const th = changeThreshold(alt);
  return { gain: cumulativeGain(alt, th), loss: cumulativeLoss(alt, th) };
}

/**
 * Smallest change counted, from how noisy the altitude is: 0.75 m for a barometric altimeter (smooth, in 0.2 m
 * steps), up to 3 m for a jumpy GPS altitude, so its noise is not counted as climbing. Noise is read from the
 * second difference (terrain bends slowly from one second to the next, noise does not): 1.5 × its 90th percentile.
 */
export function changeThreshold(alt: Float64Array): number {
  const d2: number[] = [];
  for (let i = 1; i < alt.length - 1; i++) {
    const v = Math.abs(alt[i + 1] - 2 * alt[i] + alt[i - 1]);
    if (Number.isFinite(v)) d2.push(v);
  }
  if (!d2.length) return 0.75;
  d2.sort((a, b) => a - b);
  return Math.max(0.75, Math.min(3, 1.5 * d2[Math.floor(d2.length * 0.9)]));
}

/**
 * Scales a cumulative curve (gain or loss) so that it adds up to the device's own figures: stretch by stretch where
 * the device gave them (its laps), then as a whole (the session total). The shape stays (where it climbs and how
 * much, relative to the rest); only the amounts change. A figure far from what the altitude shows (under half or over
 * twice) is not trusted and left out. Returns a new array.
 */
export function matchDeviceTotals(t: Float64Array, cum: Float64Array, stretches: DeviceTotal[], total?: number): Float64Array {
  const n = cum.length;
  const out = Float64Array.from(cum);
  if (!n) return out;
  const plausible = (want: number, have: number) => Number.isFinite(want) && want >= 0 && (have > 0 ? want / have >= 0.5 && want / have <= 2 : want === 0);
  // Increments per sample, scaled per stretch.
  const inc = new Float64Array(n);
  for (let i = 1; i < n; i++) inc[i] = Math.max(0, cum[i] - cum[i - 1]);
  for (const s of stretches) {
    let have = 0;
    for (let i = 1; i < n; i++) if (t[i] > s.startMs && t[i] <= s.endMs) have += inc[i];
    if (!plausible(s.total, have) || have <= 0) continue;
    const k = s.total / have;
    for (let i = 1; i < n; i++) if (t[i] > s.startMs && t[i] <= s.endMs) inc[i] *= k;
  }
  let acc = 0;
  for (let i = 0; i < n; i++) out[i] = acc += inc[i];
  if (total !== undefined && plausible(total, out[n - 1]) && out[n - 1] > 0) {
    const k = total / out[n - 1];
    for (let i = 0; i < n; i++) out[i] *= k;
  }
  return out;
}
