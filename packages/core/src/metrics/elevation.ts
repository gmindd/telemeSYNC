import { fillGapsLinear, medianFilter, movingAverageByTime } from './smoothing.ts';

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
