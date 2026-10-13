import { lowerIndex } from '../util/search.ts';

function valueAtDistance(dist: Float64Array, alt: Float64Array, d: number): number {
  const i = lowerIndex(dist, d);
  if (i < 0) return alt[0];
  if (i >= dist.length - 1) return alt[dist.length - 1];
  // Skip forward over samples with equal distance (stopped) to the last one.
  const d0 = dist[i];
  const d1 = dist[i + 1];
  if (d1 <= d0) return alt[i];
  const f = (d - d0) / (d1 - d0);
  return alt[i] + f * (alt[i + 1] - alt[i]);
}

/**
 * Grade (%) computed over distance, not time: for each sample uses the filtered altitude
 * `windowM/2` metres behind and ahead. Stable when stopped (distance does not change).
 */
export function gradeOverDistance(dist: Float64Array, altFiltered: Float64Array, windowM = 40, maxAbs = 35): Float64Array {
  const n = dist.length;
  const out = new Float64Array(n).fill(NaN);
  if (n < 2) return out;
  const total = dist[n - 1] - dist[0];
  const half = windowM / 2;
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(altFiltered[i]) || Number.isNaN(dist[i])) continue;
    let a = dist[i] - half;
    let b = dist[i] + half;
    // At the ends, shift the window inside the available range.
    if (a < dist[0]) {
      b += dist[0] - a;
      a = dist[0];
    }
    if (b > dist[n - 1]) {
      a -= b - dist[n - 1];
      b = dist[n - 1];
      if (a < dist[0]) a = dist[0];
    }
    const span = b - a;
    if (span < Math.min(windowM / 2, total)) continue;
    if (span <= 0) continue;
    const g = ((valueAtDistance(dist, altFiltered, b) - valueAtDistance(dist, altFiltered, a)) / span) * 100;
    out[i] = Math.max(-maxAbs, Math.min(maxAbs, g));
  }
  return out;
}
