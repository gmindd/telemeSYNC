import type { RideData, RideSample } from '../../telemetry/ride.ts';
import { lowerIndex } from '../../util/search.ts';
import type { OverlayStyle, PanelMetric, PanelOptions } from '../types.ts';
import { convert } from '../units.ts';

export type StatKind = 'max' | 'min' | 'avg' | 'delta' | 'accel' | 'zone' | 'gain';
export type IconId =
  | 'gauge' | 'bolt' | 'thermo' | 'heart' | 'cadence' | 'mountain' | 'grade' | 'up' | 'down' | 'trend' | 'zone' | 'accel'
  | 'clock' | 'link' | 'sun';

export interface PanelMetricInfo {
  id: PanelMetric;
  /** Portuguese name (UI, header). */
  label: string;
  /** Name used in "gráfico de …" (lower case). */
  chartName: string;
  subtitle: string;
  icon: IconId;
  decimals: number;
  chart: 'line' | 'bars';
  /** Smallest vertical span of the chart, display units. */
  minSpan: number;
  /** Rounding step of the gauge range, display units. */
  step: number;
  /** Gauge starts at 0 instead of the ride minimum. */
  zeroBased: boolean;
  /** Gauge is symmetric around 0 and fills from the centre (grade). */
  symmetric?: boolean;
  stats: [StatKind, StatKind, StatKind];
  /** Samples left out of the average (stopped / not pedalling), SI units. */
  skipInAvg?: (v: number) => boolean;
  array: (r: RideData) => Float64Array;
  value: (s: RideSample) => number;
  toDisplay: (v: number, st: OverlayStyle) => number;
  unit: (st: OverlayStyle) => string;
}

const id = (v: number) => v;

export const PANEL_METRIC_INFO: Record<PanelMetric, PanelMetricInfo> = {
  speed: {
    id: 'speed',
    label: 'Velocidade',
    chartName: 'velocidade',
    subtitle: 'Atual, máxima, média e aceleração',
    icon: 'gauge',
    decimals: 1,
    chart: 'line',
    minSpan: 10,
    step: 10,
    zeroBased: true,
    stats: ['max', 'avg', 'accel'],
    skipInAvg: (v) => v < 0.5,
    array: (r) => r.speed,
    value: (s) => s.speed,
    toDisplay: (v, st) => convert.speed(v, st.units),
    unit: (st) => convert.speedUnit(st.units),
  },
  power: {
    id: 'power',
    label: 'Potência',
    chartName: 'potência',
    subtitle: 'Esforço atual, pico, média e zona',
    icon: 'bolt',
    decimals: 0,
    chart: 'bars',
    minSpan: 100,
    step: 50,
    zeroBased: true,
    stats: ['max', 'avg', 'zone'],
    array: (r) => r.power,
    value: (s) => s.power,
    toDisplay: id,
    unit: () => 'W',
  },
  heartRate: {
    id: 'heartRate',
    label: 'Freq. cardíaca',
    chartName: 'freq. cardíaca',
    subtitle: 'Atual, máxima, média e zona',
    icon: 'heart',
    decimals: 0,
    chart: 'line',
    minSpan: 20,
    step: 10,
    zeroBased: false,
    stats: ['max', 'avg', 'zone'],
    array: (r) => r.heartRate,
    value: (s) => s.heartRate,
    toDisplay: id,
    unit: () => 'bpm',
  },
  cadence: {
    id: 'cadence',
    label: 'Cadência',
    chartName: 'cadência',
    subtitle: 'Atual, máxima, média e variação',
    icon: 'cadence',
    decimals: 0,
    chart: 'line',
    minSpan: 20,
    step: 10,
    zeroBased: true,
    stats: ['max', 'avg', 'delta'],
    skipInAvg: (v) => !(v > 0),
    array: (r) => r.cadence,
    value: (s) => s.cadence,
    toDisplay: id,
    unit: () => 'rpm',
  },
  temperature: {
    id: 'temperature',
    label: 'Temperatura',
    chartName: 'temperatura',
    subtitle: 'Atual, mínima, máxima e variação',
    icon: 'thermo',
    decimals: 0,
    chart: 'line',
    minSpan: 4,
    step: 5,
    zeroBased: false,
    stats: ['min', 'max', 'delta'],
    array: (r) => r.temperature,
    value: (s) => s.temperature,
    toDisplay: (v, st) => convert.temperature(v, st.units),
    unit: (st) => convert.temperatureUnit(st.units),
  },
  altitude: {
    id: 'altitude',
    label: 'Altitude',
    chartName: 'altimetria',
    subtitle: 'Atual, máxima, mínima e D+',
    icon: 'mountain',
    decimals: 0,
    chart: 'line',
    minSpan: 20,
    step: 50,
    zeroBased: false,
    stats: ['max', 'min', 'gain'],
    array: (r) => r.altitude,
    value: (s) => s.altitude,
    toDisplay: (v, st) => convert.elevation(v, st.units),
    unit: (st) => convert.elevationUnit(st.units),
  },
  grade: {
    id: 'grade',
    label: 'Inclinação',
    chartName: 'inclinação',
    subtitle: 'Atual, máxima, mínima e D+',
    icon: 'grade',
    decimals: 0,
    chart: 'line',
    minSpan: 6,
    step: 5,
    zeroBased: false,
    symmetric: true,
    stats: ['max', 'min', 'gain'],
    array: (r) => r.grade,
    value: (s) => s.grade,
    toDisplay: id,
    unit: () => '%',
  },
};

export const PANEL_METRICS = Object.keys(PANEL_METRIC_INFO) as PanelMetric[];

/** Panel options with defaults; a chart metric missing from the ride falls back to the panel's own metric. */
export function panelOptions(metric: PanelMetric, style: OverlayStyle, ride?: RideData): PanelOptions {
  const o = style.panels?.[metric];
  let chart = o?.chart ?? metric;
  if (!PANEL_METRIC_INFO[chart] || (ride && !ride.available.has(chart))) chart = metric;
  return { chart, window: o?.window === 'distance' ? 'distance' : 'time' };
}

/** Window length: ms (time) or metres (distance). */
export function windowLength(opts: PanelOptions, style: OverlayStyle): number {
  if (opts.window === 'distance') return Math.max(0.1, style.chartDistance) * (style.units.system === 'metric' ? 1000 : 1609.344);
  return Math.max(0.1, style.chartMinutes) * 60_000;
}

function trimNumber(v: number): string {
  return String(Math.round(v * 10) / 10).replace('.', ',');
}

export function windowLabel(opts: PanelOptions, style: OverlayStyle): string {
  if (opts.window === 'distance') return `ÚLTIMOS ${trimNumber(style.chartDistance)} ${style.units.system === 'metric' ? 'KM' : 'MI'}`;
  return `ÚLTIMOS ${trimNumber(style.chartMinutes)} MIN`;
}

/** Linear interpolation of `arr` against a monotonic `axis` (time or distance). */
export function interpolateOn(axis: Float64Array, arr: Float64Array, x: number): number {
  const i = lowerIndex(axis, x);
  if (i < 0) return NaN;
  if (i >= axis.length - 1) return arr[axis.length - 1];
  const span = axis[i + 1] - axis[i];
  const a = arr[i];
  const b = arr[i + 1];
  if (!(span > 0) || Number.isNaN(b)) return a;
  if (Number.isNaN(a)) return b;
  return a + ((b - a) * (x - axis[i])) / span;
}

// ---------------------------------------------------------------------------
// Ride-so-far statistics (prefix arrays, computed once per ride and metric).

interface Prefix {
  max: Float64Array;
  min: Float64Array;
  /** Time-weighted sum and weight for the average. */
  sum: Float64Array;
  w: Float64Array;
}

const prefixCache = new WeakMap<RideData, Map<PanelMetric, Prefix>>();

function prefixOf(ride: RideData, info: PanelMetricInfo): Prefix {
  let byRide = prefixCache.get(ride);
  if (!byRide) prefixCache.set(ride, (byRide = new Map()));
  let p = byRide.get(info.id);
  if (p) return p;
  const arr = info.array(ride);
  const n = arr.length;
  p = { max: new Float64Array(n), min: new Float64Array(n), sum: new Float64Array(n), w: new Float64Array(n) };
  let mx = -Infinity;
  let mn = Infinity;
  let sum = 0;
  let w = 0;
  for (let i = 0; i < n; i++) {
    const v = arr[i];
    if (!Number.isNaN(v)) {
      if (v > mx) mx = v;
      if (v < mn) mn = v;
      if (i > 0) {
        const dt = ride.t[i] - ride.t[i - 1];
        if (dt <= ride.gapThresholdMs && !info.skipInAvg?.(v)) {
          sum += v * dt;
          w += dt;
        }
      }
    }
    p.max[i] = mx === -Infinity ? NaN : mx;
    p.min[i] = mn === Infinity ? NaN : mn;
    p.sum[i] = sum;
    p.w[i] = w;
  }
  byRide.set(info.id, p);
  return p;
}

/** Max / min / average from the ride start up to sample `index` (SI units). */
export function statsUpTo(ride: RideData, info: PanelMetricInfo, index: number): { max: number; min: number; avg: number } {
  const p = prefixOf(ride, info);
  const i = Math.max(0, Math.min(p.max.length - 1, index));
  return { max: p.max[i], min: p.min[i], avg: p.w[i] > 0 ? p.sum[i] / p.w[i] : NaN };
}

// ---------------------------------------------------------------------------
// Gauge range (display units), robust to spikes: 0.5 / 99.5 percentiles rounded to `step`.

const rangeCache = new WeakMap<RideData, Map<string, { min: number; max: number }>>();

export function gaugeRange(ride: RideData, info: PanelMetricInfo, style: OverlayStyle): { min: number; max: number } {
  const key = `${info.id}|${style.units.system}|${style.units.temperature}`;
  let byRide = rangeCache.get(ride);
  if (!byRide) rangeCache.set(ride, (byRide = new Map()));
  const hit = byRide.get(key);
  if (hit) return hit;
  const arr = info.array(ride);
  const vals: number[] = [];
  for (let i = 0; i < arr.length; i++) if (!Number.isNaN(arr[i])) vals.push(info.toDisplay(arr[i], style));
  vals.sort((a, b) => a - b);
  const q = (f: number) => (vals.length ? vals[Math.min(vals.length - 1, Math.max(0, Math.round(f * (vals.length - 1))))] : NaN);
  const step = info.step;
  let lo = q(0.005);
  let hi = q(0.995);
  if (!Number.isFinite(lo)) {
    lo = 0;
    hi = step * 2;
  }
  let r: { min: number; max: number };
  if (info.symmetric) {
    const a = Math.max(step * 2, Math.ceil(Math.max(Math.abs(lo), Math.abs(hi)) / step) * step);
    r = { min: -a, max: a };
  } else {
    // Zero-based metrics never go below 0 (smoothing can produce tiny negative speeds).
    const min = info.zeroBased ? 0 : Math.floor(lo / step) * step;
    let max = Math.ceil(hi / step) * step;
    if (max - min < step * 2) max = min + step * 2;
    r = { min, max };
  }
  byRide.set(key, r);
  return r;
}

// ---------------------------------------------------------------------------
// Chart window.

export interface WindowSeries {
  /** Normalised x (0 = window start, 1 = now) and display values; NaN y = break. */
  xs: number[];
  ys: number[];
  /** Point i starts a new line segment (after a gap). */
  breaks: boolean[];
  /** Value at the exact current instant (display units). */
  current: number;
  /** Window start and length on the axis (ms or m), for bins aligned to the ride. */
  start: number;
  len: number;
}

/**
 * Samples of `info` inside the chart window ending at the current frame:
 * time window → x by time; distance window → x by ride distance (stops collapse).
 */
export function windowSeries(ride: RideData, info: PanelMetricInfo, opts: PanelOptions, style: OverlayStyle, sample: RideSample): WindowSeries {
  const len = windowLength(opts, style);
  const out: WindowSeries = { xs: [], ys: [], breaks: [], current: NaN, start: 0, len };
  if (sample.outside && sample.t < ride.startTime) return out;
  const arr = info.array(ride);
  const byDist = opts.window === 'distance';
  const axis = byDist ? ride.distance : ride.t;
  const end = byDist ? sample.distance : sample.t;
  if (!Number.isFinite(end)) return out;
  const start = end - len;
  out.start = start;
  const i0 = Math.max(0, lowerIndex(axis, start));
  const i1 = Math.min(sample.index, ride.t.length - 1);
  let brk = true;
  for (let i = i0; i <= i1; i++) {
    if (i > i0 && ride.t[i] - ride.t[i - 1] > ride.gapThresholdMs) brk = true;
    const v = arr[i];
    if (Number.isNaN(v)) {
      brk = true;
      continue;
    }
    out.xs.push((axis[i] - start) / len);
    out.ys.push(info.toDisplay(v, style));
    out.breaks.push(brk);
    brk = false;
  }
  const cur = info.value(sample);
  if (Number.isFinite(cur) && !sample.outside) {
    out.current = info.toDisplay(cur, style);
    if (!sample.inGap) {
      out.xs.push(1);
      out.ys.push(out.current);
      out.breaks.push(brk);
    }
  }
  return out;
}

/** Value of the panel metric one window ago (for the "variação" stat), SI units. */
export function valueWindowAgo(ride: RideData, info: PanelMetricInfo, opts: PanelOptions, style: OverlayStyle, sample: RideSample): number {
  const len = windowLength(opts, style);
  if (opts.window === 'distance') return interpolateOn(ride.distance, info.array(ride), Math.max(0, sample.distance - len));
  return interpolateOn(ride.t, info.array(ride), Math.max(ride.startTime, sample.t - len));
}

/** Acceleration (m/s²) over the last 2 s. */
export function accelerationAt(ride: RideData, sample: RideSample): number {
  if (sample.inGap || sample.outside) return NaN;
  const v0 = interpolateOn(ride.t, ride.speed, sample.t - 2000);
  return (sample.speed - v0) / 2;
}

/** Nice axis step (1, 2, 5 × 10^n) near `x`. */
export function niceStep(x: number): number {
  if (!(x > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(x));
  const n = x / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** Vertical range of the chart: window min/max padded to `minSpan` and snapped to a nice step (so it rarely moves). */
export function chartRange(ys: number[], info: PanelMetricInfo, floorZero: boolean): { lo: number; hi: number } {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of ys) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!Number.isFinite(lo)) return { lo: 0, hi: info.minSpan };
  if (floorZero) lo = Math.min(0, lo);
  if (hi - lo < info.minSpan) {
    const c = (hi + lo) / 2;
    lo = c - info.minSpan / 2;
    hi = c + info.minSpan / 2;
    if (floorZero && lo < 0) {
      hi -= lo;
      lo = 0;
    }
  }
  const step = niceStep((hi - lo) / 4);
  return { lo: Math.floor(lo / step) * step, hi: Math.ceil(hi / step) * step };
}
