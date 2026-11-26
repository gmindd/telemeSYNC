import type { MetricKey, RideData, RideSample } from '../../telemetry/ride.ts';
import { tr, type CoreKey, type Lang } from '../../i18n/index.ts';
import { formatDuration, formatTime } from '../../util/timezone.ts';
import { lowerIndex } from '../../util/search.ts';
import { formatPace, paceUnit, stepsPerMin, verticalSpeedAt } from '../../metrics/derived.ts';
import { beforeStart } from '../dial/dials.ts';
import { drawText, font, measureTabular } from '../draw.ts';
import { mixColor } from '../panel/paint.ts';
import { PANEL_METRIC_INFO, statsUpTo } from '../panel/series.ts';
import { hrZone } from '../text/metrics.ts';
import { sportOf, type Ctx2D, type FrameState, type OverlayContext, type OverlayStyle, type WatchField, type WatchMetric, type WatchMode, type WatchOptions } from '../types.ts';
import { convert, fmt } from '../units.ts';

// GPS sports watch (Minimal Pro extra): an original running-watch design, not any brand's. Round metal case with
// five buttons, a black screen with the heart-rate zone gauge, and 3 or 4 data fields; each field shows a metric
// now (instantaneous), as the average since the start, as the average of the current lap, or as the maximum.

const ORANGE = '#ff5a1f';
const WHITE = '#ffffff';
const GREY = 'rgba(255,255,255,0.58)';
const LINE = 'rgba(255,255,255,0.28)';

/** Metrics a field can show, the modes that make sense for each, and what the ride needs to have. */
export const WATCH_METRICS: { metric: WatchMetric; modes: WatchMode[]; requires: MetricKey }[] = [
  { metric: 'pace', modes: ['now', 'avg', 'lap', 'max'], requires: 'pace' },
  { metric: 'speed', modes: ['now', 'avg', 'lap', 'max'], requires: 'speed' },
  { metric: 'heartRate', modes: ['now', 'avg', 'lap', 'max'], requires: 'heartRate' },
  { metric: 'hrZone', modes: ['now'], requires: 'heartRate' },
  { metric: 'distance', modes: ['now', 'lap'], requires: 'distance' },
  { metric: 'time', modes: ['now', 'lap'], requires: 'elapsedTime' },
  { metric: 'cadence', modes: ['now', 'avg', 'lap', 'max'], requires: 'cadence' },
  { metric: 'power', modes: ['now', 'avg', 'lap', 'max'], requires: 'power' },
  { metric: 'altitude', modes: ['now', 'max'], requires: 'altitude' },
  { metric: 'ascent', modes: ['now', 'lap'], requires: 'elevationGain' },
  { metric: 'grade', modes: ['now', 'max'], requires: 'grade' },
  { metric: 'verticalSpeed', modes: ['now', 'avg', 'lap'], requires: 'verticalSpeed' },
  { metric: 'temperature', modes: ['now', 'avg', 'max'], requires: 'temperature' },
  { metric: 'clock', modes: ['now'], requires: 'localTime' },
  { metric: 'lap', modes: ['now'], requires: 'elapsedTime' },
];

/** The classic running screen: timer, pace, heart rate, distance. */
export const DEFAULT_WATCH: WatchOptions = {
  fields: [
    { metric: 'time', mode: 'now' },
    { metric: 'pace', mode: 'now' },
    { metric: 'heartRate', mode: 'now' },
    { metric: 'distance', mode: 'now' },
  ],
  hrGauge: true,
};

export const watchMetricName = (m: WatchMetric, lang: Lang | undefined) => tr(lang, `watch.n.${m}` as CoreKey);
export const watchModeName = (m: WatchMode, lang: Lang | undefined) => tr(lang, `watch.mode.${m}` as CoreKey);

/** The style's watch options, cleaned: 3 or 4 known fields with a mode that suits each; else the default screen. */
export function watchOptions(style: Pick<OverlayStyle, 'watch'>): WatchOptions {
  const w = style.watch;
  if (!w || !Array.isArray(w.fields)) return DEFAULT_WATCH;
  const fields = w.fields
    .map((f): WatchField | null => {
      const spec = WATCH_METRICS.find((m) => m.metric === f?.metric);
      if (!spec) return null;
      return { metric: spec.metric, mode: spec.modes.includes(f.mode) ? f.mode : 'now' };
    })
    .filter((f): f is WatchField => !!f)
    .slice(0, 4);
  if (fields.length < 3) return DEFAULT_WATCH;
  return { fields, hrGauge: w.hrGauge !== false };
}

// ---------------------------------------------------------------------------------------------
// Laps: the device's (lap button / auto-lap in the file), else every kilometre (mile in imperial).

const lapsCache = new WeakMap<RideData, Map<string, Int32Array>>();

/** Sample index where each lap starts (the first is 0). */
export function lapStarts(ride: RideData, imperial: boolean): Int32Array {
  let byRide = lapsCache.get(ride);
  if (!byRide) lapsCache.set(ride, (byRide = new Map()));
  const key = imperial ? 'mi' : 'km';
  const hit = byRide.get(key);
  if (hit) return hit;
  const n = ride.t.length;
  const starts = new Set<number>([0]);
  if (ride.laps && ride.laps.length >= 2) {
    for (const l of ride.laps) starts.add(Math.max(0, Math.min(n - 1, lowerIndex(ride.t, l.startMs))));
  } else {
    const step = imperial ? 1609.344 : 1000;
    let next = step;
    for (let i = 0; i < n; i++) {
      if (ride.distance[i] >= next) {
        starts.add(i);
        while (ride.distance[i] >= next) next += step;
      }
    }
  }
  const out = Int32Array.from([...starts].sort((a, b) => a - b));
  byRide.set(key, out);
  return out;
}

function currentLap(ride: RideData, s: RideSample, imperial: boolean): { n: number; start: number } {
  const starts = lapStarts(ride, imperial);
  let k = 0;
  while (k + 1 < starts.length && starts[k + 1] <= s.index) k++;
  return { n: k + 1, start: starts[k] };
}

/** Average (of finite values, optionally skipping some) and maximum of `arr` over samples a..b. */
function rangeStats(arr: Float64Array, a: number, b: number, skip?: (v: number) => boolean): { avg: number; max: number } {
  let sum = 0;
  let cnt = 0;
  let max = -Infinity;
  for (let i = Math.max(0, a); i <= b; i++) {
    const v = arr[i];
    if (!Number.isFinite(v) || skip?.(v)) continue;
    sum += v;
    cnt++;
    if (v > max) max = v;
  }
  return { avg: cnt ? sum / cnt : NaN, max: Number.isFinite(max) ? max : NaN };
}

/** Distance (m) and moving time (s, speed ≥ 0.5 m/s) over samples a..b. */
function moving(ride: RideData, a: number, b: number): { distance: number; seconds: number } {
  let sec = 0;
  for (let i = Math.max(1, a + 1); i <= b; i++) {
    const dt = ride.t[i] - ride.t[i - 1];
    if (dt <= ride.gapThresholdMs && ride.speed[i] >= 0.5) sec += dt / 1000;
  }
  return { distance: ride.distance[b] - ride.distance[Math.max(0, a)], seconds: sec };
}

// ---------------------------------------------------------------------------------------------
// Field values.

interface FieldValue {
  label: string;
  value: string;
  unit: string;
  color?: string;
}

function labelOf(f: WatchField, lang: Lang | undefined): string {
  const m = tr(lang, `watch.m.${f.metric}` as CoreKey);
  if (f.mode === 'avg') return `${tr(lang, 'dial.avg')} ${m}`;
  if (f.mode === 'lap') return `${tr(lang, 'kit.lap')} ${m}`;
  if (f.mode === 'max') return `${tr(lang, 'dial.max')} ${m}`;
  return m;
}

export function fieldValue(f: WatchField, s: RideSample, style: OverlayStyle, ride: RideData): FieldValue {
  const lang = style.language;
  const label = labelOf(f, lang);
  const before = beforeStart(ride, s);
  const u = style.units;
  const imperial = u.system === 'imperial';
  const i = Math.max(0, Math.min(ride.t.length - 1, s.index));
  const lap = currentLap(ride, s, imperial);
  const stats = (m: 'speed' | 'heartRate' | 'cadence' | 'power' | 'temperature') => (before ? { avg: NaN, max: NaN } : statsUpTo(ride, PANEL_METRIC_INFO[m], i));
  const lapStats = (arr: Float64Array, skip?: (v: number) => boolean) => (before ? { avg: NaN, max: NaN } : rangeStats(arr, lap.start, i, skip));
  const pick = (now: number, all: { avg: number; max: number }, lapS: { avg: number; max: number }) =>
    f.mode === 'avg' ? all.avg : f.mode === 'max' ? all.max : f.mode === 'lap' ? lapS.avg : now;
  const running = sportOf(style, ride) === 'running';
  switch (f.metric) {
    case 'pace':
    case 'speed': {
      let v: number;
      if (f.mode === 'lap') {
        const mv = before ? { distance: NaN, seconds: 0 } : moving(ride, lap.start, i);
        v = mv.seconds > 0 ? mv.distance / mv.seconds : NaN;
      } else v = pick(s.speed, stats('speed'), { avg: NaN, max: NaN });
      return f.metric === 'pace'
        ? { label, value: formatPace(v, u), unit: paceUnit(u) }
        : { label, value: fmt(convert.speed(v, u), 1), unit: convert.speedUnit(u) };
    }
    case 'heartRate':
      return { label, value: fmt(pick(s.heartRate, stats('heartRate'), lapStats(ride.heartRate)), 0), unit: 'bpm' };
    case 'hrZone': {
      const z = before || !Number.isFinite(s.heartRate) ? -1 : Math.min(style.hrZoneColors.length - 1, hrZone(s.heartRate, style.hrZones));
      return { label, value: z >= 0 ? `Z${z + 1}` : '—', unit: '', color: z >= 0 ? mixColor(style.hrZoneColors[z], WHITE, 0.25) : undefined };
    }
    case 'distance': {
      const d = before ? 0 : f.mode === 'lap' ? s.distance - ride.distance[lap.start] : s.distance;
      return { label, value: fmt(convert.distance(d, u), 2), unit: convert.distanceUnit(u) };
    }
    case 'time':
      return { label, value: formatDuration(before ? 0 : f.mode === 'lap' ? s.t - ride.t[lap.start] : s.elapsedMs), unit: '' };
    case 'cadence': {
      // Running cadence is recorded per leg: steps per minute are twice that.
      const v = pick(s.cadence, stats('cadence'), lapStats(ride.cadence, (c) => c <= 0));
      return { label, value: fmt(running ? stepsPerMin(v, ride) : v, 0), unit: running ? 'spm' : 'rpm' };
    }
    case 'power':
      return { label, value: fmt(pick(s.power, stats('power'), lapStats(ride.power, (p) => p <= 0)), 0), unit: 'W' };
    case 'altitude': {
      const v = f.mode === 'max' ? (before ? NaN : rangeStats(ride.altitude, 0, i).max) : s.altitude;
      return { label, value: fmt(convert.elevation(v, u), 0), unit: convert.elevationUnit(u) };
    }
    case 'ascent': {
      const v = before ? 0 : f.mode === 'lap' ? s.elevationGain - ride.elevationGain[lap.start] : s.elevationGain;
      return { label, value: fmt(convert.elevation(v, u), 0), unit: convert.elevationUnit(u) };
    }
    case 'grade': {
      const v = f.mode === 'max' ? (before ? NaN : rangeStats(ride.grade, 0, i).max) : s.grade;
      return { label, value: fmt(v, 1), unit: '%' };
    }
    case 'verticalSpeed': {
      // Average = climbing rate: ascent per hour (since the start, or in the lap).
      let v: number;
      if (f.mode === 'now') v = verticalSpeedAt(ride, s);
      else {
        const a = f.mode === 'lap' ? lap.start : 0;
        const hours = (s.t - ride.t[a]) / 3600_000;
        v = before || hours <= 0 ? NaN : (s.elevationGain - ride.elevationGain[a]) / hours;
      }
      return { label, value: `${v > 0 ? '+' : ''}${fmt(convert.elevation(v, u), 0)}`, unit: `${convert.elevationUnit(u)}/h` };
    }
    case 'temperature':
      return { label, value: fmt(convert.temperature(pick(s.temperature, stats('temperature'), { avg: NaN, max: NaN }), u), 0), unit: convert.temperatureUnit(u) };
    case 'clock':
      return { label, value: formatTime(s.t, style.timeZone, false), unit: '' };
    case 'lap':
      return { label, value: String(before ? 1 : lap.n), unit: '' };
  }
}

// ---------------------------------------------------------------------------------------------
// Drawing.

export const WATCH_W = 480;
export const WATCH_H = 580;
const CX = WATCH_W / 2;
const CY = WATCH_H / 2;
const R_CASE = 204;
const R_SCREEN = 170;

function metal(ctx: Ctx2D, x0: number, y0: number, x1: number, y1: number) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#9aa1aa');
  g.addColorStop(0.3, '#4a4f56');
  g.addColorStop(0.55, '#b7bdc5');
  g.addColorStop(0.8, '#3b3f45');
  g.addColorStop(1, '#7d838b');
  return g;
}

/** Silicone strap stubs, the case with five buttons, the bezel and the black screen. */
function watchBody(ctx: Ctx2D, style: OverlayStyle) {
  // Straps.
  for (const [y, h] of [
    [0, 110],
    [WATCH_H - 110, 110],
  ] as const) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(CX - 96, y + (y === 0 ? 0 : h));
    ctx.lineTo(CX - 104, y + (y === 0 ? h : 0));
    ctx.lineTo(CX + 104, y + (y === 0 ? h : 0));
    ctx.lineTo(CX + 96, y + (y === 0 ? 0 : h));
    ctx.closePath();
    const g = ctx.createLinearGradient(CX - 104, 0, CX + 104, 0);
    g.addColorStop(0, '#141518');
    g.addColorStop(0.5, '#25272c');
    g.addColorStop(1, '#141518');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    if (y > 0) {
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.ellipse(CX, WATCH_H - 26 - k * 26, 5, 7, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#0a0a0c';
        ctx.fill();
      }
    }
  }
  // Buttons: three on the left, two on the right (the top right one is START, ringed in orange).
  const buttons: [number, boolean][] = [
    [Math.PI * 0.83, false],
    [Math.PI * 1.0, false],
    [Math.PI * 1.17, false],
    [-Math.PI * 0.17, true],
    [Math.PI * 0.17, false],
  ];
  for (const [a, start] of buttons) {
    ctx.save();
    ctx.translate(CX + Math.cos(a) * (R_CASE - 4), CY + Math.sin(a) * (R_CASE - 4));
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(16, -15);
    ctx.arc(16, 0, 15, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(0, 18);
    ctx.closePath();
    ctx.fillStyle = metal(ctx, 0, -18, 30, 18);
    ctx.fill();
    if (start) {
      ctx.strokeStyle = ORANGE;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();
  }
  // Case with a soft shadow.
  ctx.save();
  ctx.beginPath();
  ctx.arc(CX, CY, R_CASE, 0, Math.PI * 2);
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = metal(ctx, CX - R_CASE, CY - R_CASE, CX + R_CASE, CY + R_CASE);
  ctx.fill();
  ctx.restore();
  // Bezel with minute marks.
  ctx.beginPath();
  ctx.arc(CX, CY, R_CASE - 12, 0, Math.PI * 2);
  ctx.fillStyle = '#121316';
  ctx.fill();
  for (let k = 0; k < 60; k++) {
    const t = (k / 60) * Math.PI * 2 - Math.PI / 2;
    const major = k % 5 === 0;
    const r0 = R_CASE - (major ? 30 : 24);
    ctx.beginPath();
    ctx.moveTo(CX + Math.cos(t) * r0, CY + Math.sin(t) * r0);
    ctx.lineTo(CX + Math.cos(t) * (R_CASE - 17), CY + Math.sin(t) * (R_CASE - 17));
    ctx.strokeStyle = major ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.3)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.stroke();
  }
  // Screen.
  ctx.beginPath();
  ctx.arc(CX, CY, R_SCREEN, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(4,4,6,${Math.max(0.9, style.panelOpacity ?? 0.8)})`;
  ctx.fill();
  // Faint glass reflection.
  ctx.save();
  ctx.beginPath();
  ctx.arc(CX, CY, R_SCREEN, 0, Math.PI * 2);
  ctx.clip();
  const gl = ctx.createLinearGradient(CX - R_SCREEN, CY - R_SCREEN, CX + R_SCREEN * 0.2, CY);
  gl.addColorStop(0, 'rgba(255,255,255,0.07)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gl;
  ctx.fillRect(CX - R_SCREEN, CY - R_SCREEN, R_SCREEN * 2, R_SCREEN);
  ctx.restore();
}

/** Heart-rate gauge: the zone colours along the top of the screen, a white marker at the current heart rate. */
function hrGauge(ctx: Ctx2D, s: RideSample, style: OverlayStyle, before: boolean) {
  const colors = style.hrZoneColors;
  const n = colors.length;
  const a0 = -Math.PI * 0.82;
  const a1 = -Math.PI * 0.18;
  const r = R_SCREEN - 10;
  const seg = (a1 - a0) / n;
  ctx.lineCap = 'butt';
  for (let k = 0; k < n; k++) {
    ctx.beginPath();
    ctx.arc(CX, CY, r, a0 + seg * k + 0.012, a0 + seg * (k + 1) - 0.012);
    ctx.strokeStyle = colors[k];
    ctx.lineWidth = 9;
    ctx.stroke();
  }
  const hr = s.heartRate;
  if (before || !Number.isFinite(hr)) return;
  // Position inside the zone: zone k spans [bound k-1, bound k]; the last zone up to bound + 30 bpm.
  const b = style.hrZones;
  const z = Math.min(n - 1, hrZone(hr, b));
  const lo = z === 0 ? b[0] - 40 : b[z - 1];
  const hi = z < b.length ? b[z] : b[b.length - 1] + 30;
  const f = (z + Math.max(0, Math.min(1, (hr - lo) / (hi - lo || 1)))) / n;
  const t = a0 + (a1 - a0) * f;
  ctx.save();
  ctx.translate(CX + Math.cos(t) * (r - 14), CY + Math.sin(t) * (r - 14));
  ctx.rotate(t + Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(-7, 4);
  ctx.lineTo(7, 4);
  ctx.closePath();
  ctx.fillStyle = WHITE;
  ctx.fill();
  ctx.restore();
}

/** Font size (≤ max) at which `text` fits `maxW`. */
function fit(ctx: Ctx2D, style: OverlayStyle, text: string, maxW: number, max: number): number {
  ctx.font = font(style, max, 800);
  return Math.min(max, (max * maxW) / Math.max(1, measureTabular(ctx, text)));
}

/** One field: small grey label, big white value (unit small after it), centred in its box. */
function field(ctx: Ctx2D, v: FieldValue, cx: number, top: number, w: number, h: number, big: boolean, ts: OverlayStyle) {
  const labelSize = big ? 15 : 14;
  const labelH = ts.showLabel ? labelSize + 8 : 0;
  if (ts.showLabel) drawText(ctx, v.label, cx, top + labelSize + 4, ts, { size: labelSize, weight: 700, align: 'center', tabular: false, color: GREY });
  ctx.font = font(ts, 16, 700);
  const unit = ts.showUnit ? v.unit : '';
  const uw = unit ? ctx.measureText(unit).width + 4 : 0;
  // The value never grows taller than the space under the label (cap height ≈ 0.72 × size).
  const size = Math.min(fit(ctx, ts, v.value, w - 16 - uw, big ? 66 : 46), (h - labelH - 8) / 0.72);
  ctx.font = font(ts, size, 800);
  const vw = measureTabular(ctx, v.value);
  const x = cx - (vw + uw) / 2;
  const base = top + labelH + (h - labelH + size * 0.72) / 2;
  drawText(ctx, v.value, x, base, ts, { size, weight: 800, color: v.color ?? WHITE });
  if (unit) drawText(ctx, unit, x + vw + 4, base, ts, { size: 16, weight: 700, tabular: false, color: GREY });
}

export function drawGpsWatch(ctx: Ctx2D, frame: FrameState, style: OverlayStyle, octx: OverlayContext) {
  const ride = octx.ride;
  const s = frame.textSample;
  const ts: OverlayStyle = { ...style, outlineWidth: 0, shadow: false };
  const opts = watchOptions(style);
  const before = beforeStart(ride, s);
  watchBody(ctx, style);
  ctx.save();
  ctx.beginPath();
  ctx.arc(CX, CY, R_SCREEN, 0, Math.PI * 2);
  ctx.clip();
  if (opts.hrGauge && ride.available.has('heartRate')) hrGauge(ctx, s, style, before);
  // Time of day at the top, like a watch's status line.
  drawText(ctx, formatTime(s.t, style.timeZone, false), CX, CY - R_SCREEN + 42, ts, { size: 15, weight: 700, align: 'center', color: GREY });
  const vals = opts.fields.map((f) => fieldValue(f, s, style, ride));
  // Rows: top field / middle (one big field, or two side by side) / bottom field.
  const yTop = CY - R_SCREEN + 50;
  const y1 = CY - 44;
  const y2 = CY + 64;
  const yBot = CY + R_SCREEN - 18;
  const chord = (y: number) => Math.sqrt(Math.max(0, R_SCREEN * R_SCREEN - (y - CY) ** 2)) - 8;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.5;
  for (const y of [y1, y2]) {
    ctx.beginPath();
    ctx.moveTo(CX - chord(y), y);
    ctx.lineTo(CX + chord(y), y);
    ctx.stroke();
  }
  field(ctx, vals[0], CX, yTop, chord(y1) * 2 - 30, y1 - yTop, false, ts);
  if (vals.length === 4) {
    ctx.beginPath();
    ctx.moveTo(CX, y1);
    ctx.lineTo(CX, y2);
    ctx.stroke();
    const w = chord(y1);
    field(ctx, vals[1], CX - w / 2, y1, w - 6, y2 - y1, true, ts);
    field(ctx, vals[2], CX + w / 2, y1, w - 6, y2 - y1, true, ts);
  } else {
    field(ctx, vals[1], CX, y1, chord(y1) * 2 - 20, y2 - y1, true, ts);
  }
  field(ctx, vals[vals.length - 1], CX, y2, chord(y2 + 50) * 2 - 20, yBot - y2, false, ts);
  ctx.restore();
}
