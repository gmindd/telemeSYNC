/** Centered moving average over a time window (ms). NaN values are ignored. */
export function movingAverageByTime(t: Float64Array, v: Float64Array, windowMs: number): Float64Array {
  const n = v.length;
  const out = new Float64Array(n).fill(NaN);
  const half = windowMs / 2;
  let lo = 0;
  let hi = 0;
  let sum = 0;
  let cnt = 0;
  for (let i = 0; i < n; i++) {
    while (hi < n && t[hi] <= t[i] + half) {
      if (!Number.isNaN(v[hi])) {
        sum += v[hi];
        cnt++;
      }
      hi++;
    }
    while (t[lo] < t[i] - half) {
      if (!Number.isNaN(v[lo])) {
        sum -= v[lo];
        cnt--;
      }
      lo++;
    }
    out[i] = cnt > 0 && !Number.isNaN(v[i]) ? sum / cnt : NaN;
  }
  return out;
}

/** Centered median filter over `radius` samples on each side. NaN values are ignored. */
export function medianFilter(v: Float64Array, radius: number): Float64Array {
  const n = v.length;
  const out = new Float64Array(n);
  const buf: number[] = [];
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(v[i])) {
      out[i] = NaN;
      continue;
    }
    buf.length = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(n - 1, i + radius); j++) {
      if (!Number.isNaN(v[j])) buf.push(v[j]);
    }
    buf.sort((a, b) => a - b);
    const m = buf.length >> 1;
    out[i] = buf.length % 2 ? buf[m] : (buf[m - 1] + buf[m]) / 2;
  }
  return out;
}

/** Fills NaN gaps by linear interpolation between valid neighbours (edges are held). */
export function fillGapsLinear(t: Float64Array, v: Float64Array): Float64Array {
  const out = Float64Array.from(v);
  const n = v.length;
  let prev = -1;
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(out[i])) continue;
    if (prev === -1) {
      for (let j = 0; j < i; j++) out[j] = out[i];
    } else if (i - prev > 1) {
      for (let j = prev + 1; j < i; j++) {
        const f = (t[j] - t[prev]) / (t[i] - t[prev]);
        out[j] = out[prev] + f * (out[i] - out[prev]);
      }
    }
    prev = i;
  }
  if (prev >= 0) for (let j = prev + 1; j < n; j++) out[j] = out[prev];
  return out;
}
