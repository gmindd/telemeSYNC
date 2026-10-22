import type { RideData, RideSample } from '../../telemetry/ride.ts';
import { drawText, font, labelSize, measureTabular } from '../draw.ts';
import { hrZone } from '../text/metrics.ts';
import type { Ctx2D, FrameState, OverlayContext, OverlayDefinition, OverlayId, OverlayStyle, PanelMetric, PanelOptions } from '../types.ts';
import { convert, fmt } from '../units.ts';
import { tr, type Lang } from '../../i18n/index.ts';
import { drawIcon, mixColor, polygon, withAlpha } from './paint.ts';
import {
  accelerationAt,
  chartRange,
  gaugeRange,
  PANEL_METRIC_INFO,
  PANEL_METRICS,
  panelOptions,
  statsUpTo,
  valueWindowAgo,
  windowLabel,
  windowSeries,
  windowSpan,
  type IconId,
  type PanelMetricInfo,
  type StatKind,
} from './series.ts';

// Layout at scale 1 (px). The panel is one wide gadget: header, gauge, stats and chart.
const W = 1000;
const H = 280;
const BODY_Y = 64;
const BODY_B = H - 4;
const GX = 122;
const GY = (BODY_Y + BODY_B) / 2;
const GR = 106;
const ARC_R = GR - 17;
const ARC_W = 13;
const SWEEP0 = Math.PI * 0.75;
const SWEEP = Math.PI * 1.5;
const STATS_X0 = GX + GR - 40;
const STATS_X1 = 450;
const STATS_CX = GX + GR + 12;
const CHART_X0 = 462;
const CHART_X1 = W - 4;

/** Coggan power zones as fractions of FTP (upper bounds of Z1..Z6). */
export const POWER_ZONES = [0.55, 0.75, 0.9, 1.05, 1.2, 1.5];
export const POWER_ZONE_COLORS = ['#2f80ed', '#14b8c4', '#6cc644', '#f5c400', '#ff9500', '#ff5a1f', '#e8202a'];
const BRAKE_COLOR = '#4fc3f7';

export const PANEL_IDS: Record<PanelMetric, OverlayId> = {
  speed: 'panelSpeed',
  altitude: 'panelAltitude',
  grade: 'panelGrade',
  heartRate: 'panelHeartRate',
  cadence: 'panelCadence',
  power: 'panelPower',
  temperature: 'panelTemperature',
};

/** Panel metric of an overlay id, or undefined for other overlays. */
export function panelMetricOf(id: OverlayId): PanelMetric | undefined {
  return PANEL_METRICS.find((m) => PANEL_IDS[m] === id);
}

interface Paint {
  from: string;
  to: string;
  bg: string;
  border: string;
  label: string;
  /** Style for text inside panels: no outline/shadow when the background is dark enough. */
  ts: OverlayStyle;
  hasBg: boolean;
}

function paintOf(style: OverlayStyle): Paint {
  const op = Math.max(0, Math.min(1, style.panelOpacity ?? 0.8));
  const hasBg = op > 0.02;
  return {
    from: style.gradientFrom,
    to: style.gradientTo,
    bg: `rgba(10,15,22,${op})`,
    border: `rgba(255,255,255,${hasBg ? 0.12 : 0})`,
    label: 'rgba(255,255,255,0.68)',
    ts: op >= 0.35 ? { ...style, outlineWidth: 0, shadow: false } : style,
    hasBg,
  };
}

function fillShape(ctx: Ctx2D, p: Paint) {
  if (!p.hasBg) return;
  ctx.fillStyle = p.bg;
  ctx.fill();
  ctx.strokeStyle = p.border;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function hGradient(ctx: Ctx2D, x0: number, x1: number, a: string, b: string) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  return g;
}

function vGradient(ctx: Ctx2D, yBottom: number, yTop: number, a: string, b: string) {
  const g = ctx.createLinearGradient(0, yBottom, 0, yTop);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  return g;
}

function signed(v: number, decimals: number): string {
  if (!Number.isFinite(v)) return '—';
  const s = fmt(v, decimals);
  return v > 0 && s.replace(/[0,]/g, '') !== '' ? `+${s}` : s;
}

// ---------------------------------------------------------------------------

function drawHeader(ctx: Ctx2D, info: PanelMetricInfo, subtitle: string, p: Paint, lang: Lang) {
  const title = tr(lang, `metric.${info.id}`).toLocaleUpperCase(lang);
  ctx.font = font(p.ts, 22, 800);
  const tw = ctx.measureText(title).width;
  ctx.font = font(p.ts, 14, 400);
  const sw = ctx.measureText(subtitle).width;
  const right = Math.min(STATS_X1 + 120, 72 + Math.max(tw, sw) + 20);
  polygon(ctx, [[34, 8], [right, 8], [right + 22, 54], [34, 54]]);
  fillShape(ctx, p);

  // Icon badge.
  ctx.beginPath();
  ctx.arc(34, 31, 26, 0, Math.PI * 2);
  if (p.hasBg) {
    ctx.fillStyle = 'rgba(6,9,14,0.92)';
    ctx.fill();
  }
  ctx.strokeStyle = hGradient(ctx, 8, 60, p.from, p.to);
  ctx.lineWidth = 2.5;
  ctx.stroke();
  drawIcon(ctx, info.icon, 34, 31, 30, vGradient(ctx, 46, 16, p.from, p.to));

  drawText(ctx, title, 72, 29, p.ts, { size: 22, weight: 800, tabular: false });
  drawText(ctx, subtitle, 72, 48, p.ts, { size: 14, weight: 400, tabular: false, color: p.label });
}

// ---------------------------------------------------------------------------

function angleAt(f: number) {
  return SWEEP0 + SWEEP * f;
}

function valueTemplate(range: { min: number; max: number }, decimals: number): string {
  const digits = Math.max(1, String(Math.floor(Math.max(Math.abs(range.min), Math.abs(range.max)))).length);
  return `${range.min < 0 ? '-' : ''}${'8'.repeat(digits)}${decimals ? `,${'8'.repeat(decimals)}` : ''}`;
}

function drawGauge(ctx: Ctx2D, info: PanelMetricInfo, range: { min: number; max: number }, smooth: number, text: number, style: OverlayStyle, p: Paint) {
  ctx.beginPath();
  ctx.arc(GX, GY, GR, 0, Math.PI * 2);
  if (p.hasBg) {
    ctx.fillStyle = p.bg;
    ctx.fill();
    ctx.strokeStyle = p.border;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // Thin decorative ring in the gradient.
  ctx.beginPath();
  ctx.arc(GX, GY, GR - 4, SWEEP0 - 0.08, SWEEP0 + SWEEP + 0.08);
  ctx.strokeStyle = hGradient(ctx, GX - GR, GX + GR, withAlpha(p.from, 0.55), withAlpha(p.to, 0.55));
  ctx.lineWidth = 2;
  ctx.stroke();

  // Track: dark segments.
  ctx.lineCap = 'butt';
  const N = 40;
  ctx.strokeStyle = 'rgba(255,255,255,0.11)';
  ctx.lineWidth = ARC_W;
  for (let k = 0; k < N; k++) {
    const a = angleAt(k / N);
    ctx.beginPath();
    ctx.arc(GX, GY, ARC_R, a, a + (SWEEP / N) * 0.7);
    ctx.stroke();
  }

  // Filled part: from the origin (min, or 0 for symmetric gauges) to the value, coloured along the arc.
  const span = range.max - range.min;
  const origin = info.symmetric ? (0 - range.min) / span : 0;
  if (Number.isFinite(smooth)) {
    const f = Math.max(0, Math.min(1, (smooth - range.min) / span));
    const fa = Math.min(origin, f);
    const fb = Math.max(origin, f);
    if (fb - fa > 0.002) {
      // Glow under the arc (one path, so the blur does not stack).
      ctx.beginPath();
      ctx.arc(GX, GY, ARC_R, angleAt(fa), angleAt(fb));
      ctx.shadowColor = withAlpha(mixColor(p.from, p.to, fb), 0.75);
      ctx.shadowBlur = 16;
      ctx.strokeStyle = mixColor(p.from, p.to, (fa + fb) / 2);
      ctx.stroke();
      ctx.shadowColor = 'rgba(0,0,0,0)';
      ctx.shadowBlur = 0;
      const step = 1.5 / 270;
      for (let s = fa; s < fb; s += step) {
        const e = Math.min(fb, s + step);
        ctx.beginPath();
        ctx.arc(GX, GY, ARC_R, angleAt(s), Math.min(angleAt(fb), angleAt(e) + 0.006));
        ctx.strokeStyle = mixColor(p.from, p.to, (s + e) / 2);
        ctx.stroke();
      }
    }
    // Tip marker.
    const a = angleAt(f);
    const x = GX + Math.cos(a) * ARC_R;
    const y = GY + Math.sin(a) * ARC_R;
    ctx.beginPath();
    ctx.arc(x, y, ARC_W / 2 + 2, 0, Math.PI * 2);
    ctx.shadowColor = withAlpha(p.to, 0.9);
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.shadowBlur = 0;
  }

  // Ticks.
  ctx.lineCap = 'round';
  const rT = ARC_R - ARC_W / 2 - 6;
  for (let k = 0; k <= 30; k++) {
    const a = angleAt(k / 30);
    const major = k % 5 === 0;
    const len = major ? 9 : 4;
    ctx.beginPath();
    ctx.moveTo(GX + Math.cos(a) * rT, GY + Math.sin(a) * rT);
    ctx.lineTo(GX + Math.cos(a) * (rT - len), GY + Math.sin(a) * (rT - len));
    ctx.strokeStyle = `rgba(255,255,255,${major ? 0.55 : 0.28})`;
    ctx.lineWidth = major ? 2 : 1.2;
    ctx.stroke();
  }

  // Range labels between the arc ends.
  drawText(ctx, fmt(range.min, 0), GX - 36, GY + 76, p.ts, { size: 13, weight: 600, align: 'center', color: p.label });
  drawText(ctx, fmt(range.max, 0), GX + 36, GY + 76, p.ts, { size: 13, weight: 600, align: 'center', color: p.label });

  // Value, sized so the widest expected value fits inside the ticks.
  const tpl = valueTemplate(range, info.decimals);
  ctx.font = font(p.ts, 50, 800);
  const size = Math.min(50, (50 * 124) / Math.max(1, measureTabular(ctx, tpl)));
  drawText(ctx, fmt(text, info.decimals), GX, GY + 12, p.ts, { size, weight: 800, align: 'center' });
  drawText(ctx, info.unit(style), GX, GY + 42, p.ts, { size: 18, weight: 600, align: 'center', tabular: false, color: 'rgba(255,255,255,0.85)' });
}

// ---------------------------------------------------------------------------

interface StatRow {
  label: string;
  icon: IconId;
  value?: string;
  unit?: string;
  /** Short value shown at the right of the label (zone / acceleration rows). */
  side?: { text: string; color?: string };
  bar?: (x: number, y: number, w: number, h: number) => void;
}

function zoneBar(ctx: Ctx2D, x: number, y: number, w: number, h: number, colors: string[], current: number) {
  const n = colors.length;
  const gap = 3;
  const sw = (w - gap * (n - 1)) / n;
  for (let k = 0; k < n; k++) {
    const xk = x + k * (sw + gap);
    polygon(ctx, [[xk + 2, y], [xk + sw, y], [xk + sw - 2, y + h], [xk, y + h]]);
    ctx.globalAlpha = k === current ? 1 : 0.3;
    ctx.fillStyle = colors[k];
    ctx.fill();
    ctx.globalAlpha = 1;
    if (k === current) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
}

/** Ten segments around the centre: acceleration fills to the right (gradient), braking to the left. */
function accelBar(ctx: Ctx2D, x: number, y: number, w: number, h: number, a: number, p: Paint) {
  const n = 10;
  const gap = 3;
  const sw = (w - gap * (n - 1)) / n;
  const fill = Number.isFinite(a) ? Math.round(Math.min(1, Math.abs(a) / 1.5) * 5) : 0;
  for (let k = 0; k < n; k++) {
    const xk = x + k * (sw + gap);
    polygon(ctx, [[xk + 2, y], [xk + sw, y], [xk + sw - 2, y + h], [xk, y + h]]);
    const right = k - 5;
    const left = 4 - k;
    if (a > 0 && right >= 0 && right < fill) ctx.fillStyle = mixColor(p.from, p.to, right / 4);
    else if (a < 0 && left >= 0 && left < fill) ctx.fillStyle = BRAKE_COLOR;
    else ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
  }
}

function statRows(ctx: Ctx2D, ride: RideData, info: PanelMetricInfo, opts: PanelOptions, s: RideSample, style: OverlayStyle, p: Paint): StatRow[] {
  const before = s.outside && s.t < ride.startTime;
  const st = before ? { max: NaN, min: NaN, avg: NaN } : statsUpTo(ride, info, s.index);
  const unit = info.unit(style);
  const val = (v: number) => fmt(info.toDisplay(v, style), info.decimals);
  return info.stats.map((kind: StatKind): StatRow => {
    switch (kind) {
      case 'max':
        return { label: tr(style.language, info.id === 'power' ? 'stat.peak' : 'stat.max'), icon: info.id === 'power' ? 'bolt' : 'up', value: val(st.max), unit };
      case 'min':
        return { label: tr(style.language, 'stat.min'), icon: 'down', value: val(st.min), unit };
      case 'avg':
        return { label: tr(style.language, 'stat.avg'), icon: 'gauge', value: val(st.avg), unit };
      case 'gain': {
        const g = before ? NaN : convert.elevation(s.elevationGain, style.units);
        return { label: tr(style.language, 'stat.gain'), icon: 'mountain', value: fmt(g, 0), unit: convert.elevationUnit(style.units) };
      }
      case 'delta': {
        const now = info.value(s);
        const ago = valueWindowAgo(ride, info, opts, style, s);
        const d = before ? NaN : info.toDisplay(now, style) - info.toDisplay(ago, style);
        return { label: tr(style.language, 'stat.delta', { span: windowSpan(opts, style).toLowerCase() }), icon: 'trend', value: signed(d, info.decimals), unit };
      }
      case 'accel': {
        const a = before ? NaN : accelerationAt(ride, s);
        return {
          label: tr(style.language, 'stat.accel'),
          icon: 'accel',
          side: { text: Number.isFinite(a) ? `${signed(a, 1)} m/s²` : '—' },
          bar: (x, y, w, h) => accelBar(ctx, x, y, w, h, a, p),
        };
      }
      case 'zone': {
        const v = info.value(s);
        const isPower = info.id === 'power';
        const bounds = isPower ? POWER_ZONES.map((k) => k * style.ftp) : style.hrZones;
        const colors = isPower ? POWER_ZONE_COLORS : style.hrZoneColors;
        const z = before || !Number.isFinite(v) ? -1 : Math.min(colors.length - 1, hrZone(v, bounds));
        return {
          label: tr(style.language, 'stat.zone'),
          icon: 'zone',
          side: { text: z >= 0 ? `Z${z + 1}` : '—', color: z >= 0 ? colors[z] : undefined },
          bar: (x, y, w, h) => zoneBar(ctx, x, y, w, h, colors, z),
        };
      }
    }
  });
}

function drawStats(ctx: Ctx2D, rows: StatRow[], p: Paint) {
  const y0 = BODY_Y + 10;
  const y1 = BODY_B - 10;
  polygon(ctx, [[STATS_X0, y0], [STATS_X1 - 20, y0], [STATS_X1, y0 + 20], [STATS_X1, y1 - 20], [STATS_X1 - 20, y1], [STATS_X0, y1]]);
  fillShape(ctx, p);
  // Gradient accent on the right edge.
  ctx.beginPath();
  ctx.moveTo(STATS_X1 - 20, y0);
  ctx.lineTo(STATS_X1, y0 + 20);
  ctx.lineTo(STATS_X1, y1 - 20);
  ctx.strokeStyle = vGradient(ctx, y1, y0, withAlpha(p.from, 0.7), withAlpha(p.to, 0.7));
  ctx.lineWidth = 2;
  ctx.stroke();

  const rowH = (y1 - y0) / rows.length;
  const iconPaint = vGradient(ctx, y1, y0, p.from, p.to);
  const tx = STATS_CX + 34;
  const right = STATS_X1 - 16;
  rows.forEach((r, i) => {
    const ry = y0 + i * rowH;
    if (i > 0) {
      ctx.beginPath();
      ctx.moveTo(STATS_CX, ry);
      ctx.lineTo(right, ry);
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    drawIcon(ctx, r.icon, STATS_CX + 12, ry + rowH / 2, 22, iconPaint);
    let sideW = 0;
    if (r.side) sideW = drawText(ctx, r.side.text, right, ry + 24, p.ts, { size: 13, weight: 800, align: 'right', color: r.side.color }) + 10;
    drawText(ctx, r.label, tx, ry + 24, p.ts, { size: labelSize(ctx, p.ts, r.label, 12, 700, right - tx - sideW), weight: 700, tabular: false, color: p.label });
    if (r.value !== undefined) {
      const w = drawText(ctx, r.value, tx, ry + rowH - 14, p.ts, { size: 24, weight: 800 });
      if (r.unit) drawText(ctx, r.unit, tx + w + 7, ry + rowH - 14, p.ts, { size: 14, weight: 600, tabular: false, color: p.label });
    }
    r.bar?.(tx, ry + rowH - 26, right - tx, 10);
  });
}

// ---------------------------------------------------------------------------

function drawChart(ctx: Ctx2D, ride: RideData, metric: PanelMetricInfo, chartInfo: PanelMetricInfo, opts: PanelOptions, frame: FrameState, style: OverlayStyle, p: Paint) {
  let title = windowLabel(opts, style);
  if (chartInfo.id !== metric.id) title += ` · ${tr(style.language, `chart.${chartInfo.id}`).toLocaleUpperCase(style.language)}`;
  ctx.font = font(p.ts, 14, 800);
  const tw = ctx.measureText(title).width;
  const tabW = tw + 44;
  const y0 = BODY_Y;
  const y1 = BODY_B;
  polygon(ctx, [
    [CHART_X0, y0 + 14], [CHART_X0 + 14, y0], [CHART_X0 + tabW, y0], [CHART_X0 + tabW + 12, y0 + 12],
    [CHART_X1 - 22, y0 + 12], [CHART_X1, y0 + 34], [CHART_X1, y1 - 22], [CHART_X1 - 22, y1],
    [CHART_X0 + 14, y1], [CHART_X0, y1 - 14],
  ]);
  fillShape(ctx, p);
  drawText(ctx, title, CHART_X0 + 22, y0 + 26, p.ts, { size: 14, weight: 800, tabular: false });
  ctx.beginPath();
  ctx.moveTo(CHART_X0 + 22, y0 + 35);
  ctx.lineTo(CHART_X0 + 22 + Math.min(tw, 110), y0 + 35);
  ctx.strokeStyle = hGradient(ctx, CHART_X0 + 22, CHART_X0 + 132, p.from, p.to);
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.stroke();

  const px = CHART_X0 + 18;
  const py = y0 + 46;
  const pw = CHART_X1 - 98 - px;
  const ph = y1 - 16 - py;
  ctx.beginPath();
  ctx.rect(px, py, pw, ph);
  if (p.hasBg) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const series = windowSeries(ride, chartInfo, opts, style, frame.sample);
  const bars = chartInfo.chart === 'bars';
  const { lo, hi } = chartRange(series.ys, chartInfo, bars || chartInfo.zeroBased);
  const X = (x: number) => px + x * pw;
  const Y = (v: number) => py + ph * (1 - (v - lo) / (hi - lo));
  const lineGrad = vGradient(ctx, py + ph, py, p.from, p.to);

  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, pw, ph);
  ctx.clip();
  // Grid.
  for (let k = 1; k < 4; k++) {
    ctx.beginPath();
    ctx.moveTo(px, py + (ph * k) / 4);
    ctx.lineTo(px + pw, py + (ph * k) / 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  if (lo < 0 && hi > 0) {
    ctx.beginPath();
    ctx.moveTo(px, Y(0));
    ctx.lineTo(px + pw, Y(0));
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.stroke();
  }

  if (bars) {
    // Bins aligned to the ride axis, so bars scroll without changing value.
    const bins = 90;
    const binLen = series.len / bins;
    const acc = new Map<number, { s: number; n: number }>();
    series.xs.forEach((x, i) => {
      const b = Math.floor((series.start + x * series.len) / binLen);
      const e = acc.get(b) ?? { s: 0, n: 0 };
      e.s += series.ys[i];
      e.n++;
      acc.set(b, e);
    });
    ctx.fillStyle = lineGrad;
    const bw = (binLen / series.len) * pw;
    for (const [b, e] of acc) {
      const v = e.s / e.n;
      const x = X((b * binLen - series.start) / series.len);
      const y = Y(v);
      ctx.fillRect(x + 0.75, y, Math.max(1, bw - 1.5), py + ph - y);
    }
  } else if (series.xs.length > 1) {
    // Area under each segment.
    const area = vGradient(ctx, py + ph, py, withAlpha(p.from, 0.04), withAlpha(p.to, 0.38));
    let segStart = 0;
    const flush = (endIdx: number) => {
      if (endIdx - segStart < 1) return;
      ctx.beginPath();
      ctx.moveTo(X(series.xs[segStart]), py + ph);
      for (let i = segStart; i <= endIdx; i++) ctx.lineTo(X(series.xs[i]), Y(series.ys[i]));
      ctx.lineTo(X(series.xs[endIdx]), py + ph);
      ctx.closePath();
      ctx.fillStyle = area;
      ctx.fill();
    };
    for (let i = 1; i < series.xs.length; i++) {
      if (series.breaks[i]) {
        flush(i - 1);
        segStart = i;
      }
    }
    flush(series.xs.length - 1);
    // Line.
    ctx.beginPath();
    let lastX = -Infinity;
    for (let i = 0; i < series.xs.length; i++) {
      const x = X(series.xs[i]);
      const y = Y(series.ys[i]);
      if (series.breaks[i]) ctx.moveTo(x, y);
      else if (x - lastX >= 0.6 || i === series.xs.length - 1) ctx.lineTo(x, y);
      else continue;
      lastX = x;
    }
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = withAlpha(p.to, 0.55);
    ctx.shadowBlur = 8;
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.shadowBlur = 0;
  }
  ctx.restore();

  // Current point.
  if (Number.isFinite(series.current) && !frame.sample.inGap) {
    const y = Math.max(py, Math.min(py + ph, Y(series.current)));
    ctx.beginPath();
    ctx.arc(X(1), y, 4.5, 0, Math.PI * 2);
    ctx.shadowColor = withAlpha(p.to, 0.9);
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.shadowBlur = 0;
  }

  // Scale: gradient bar with a marker, range and current value.
  const bx = CHART_X1 - 86;
  ctx.fillStyle = lineGrad;
  ctx.fillRect(bx, py, 5, ph);
  const textValue = chartInfo.value(frame.textSample);
  const cur = Number.isFinite(textValue) ? chartInfo.toDisplay(textValue, style) : NaN;
  if (Number.isFinite(cur)) {
    const y = Math.max(py, Math.min(py + ph, Y(cur)));
    polygon(ctx, [[bx + 7, y], [bx + 15, y - 6], [bx + 15, y + 6]]);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  const tx = CHART_X1 - 14;
  drawText(ctx, fmt(hi, 0), tx, py + 10, p.ts, { size: 12, weight: 600, align: 'right', color: p.label });
  drawText(ctx, fmt(lo, 0), tx, py + ph, p.ts, { size: 12, weight: 600, align: 'right', color: p.label });
  drawText(ctx, fmt(cur, chartInfo.decimals), tx, py + ph / 2 + 4, p.ts, { size: 20, weight: 800, align: 'right' });
  drawText(ctx, chartInfo.unit(style), tx, py + ph / 2 + 24, p.ts, { size: 13, weight: 600, align: 'right', tabular: false, color: p.label });
}

// ---------------------------------------------------------------------------

function makePanel(metric: PanelMetric): OverlayDefinition {
  const info = PANEL_METRIC_INFO[metric];
  return {
    id: PANEL_IDS[metric],
    label: tr('en', 'overlay.panel', { name: tr('en', `metric.${metric}`) }),
    requires: metric,
    textOnly: false,
    textRateOnly: (style) => style.panelRate === 'text',
    size: () => ({ width: W, height: H }),
    draw: (ctx: Ctx2D, fullFrame: FrameState, style: OverlayStyle, octx: OverlayContext) => {
      // "text" mode: gauge and chart move with the numbers, so every frame between updates is identical.
      const frame = style.panelRate === 'text' ? { t: fullFrame.textSample.t, sample: fullFrame.textSample, textSample: fullFrame.textSample } : fullFrame;
      const ride = octx.ride;
      const p = paintOf(style);
      const opts = panelOptions(metric, style, ride);
      const chartInfo = PANEL_METRIC_INFO[opts.chart];
      ctx.lineJoin = 'round';
      if (style.showLabel) {
        const lang = style.language;
        const subtitle = tr(lang, `panel.sub.${metric}`);
        const sub = chartInfo.id === metric ? subtitle : `${subtitle} · ${tr(lang, 'panel.chartOf', { name: tr(lang, `chart.${chartInfo.id}`) })}`;
        drawHeader(ctx, info, sub, p, lang);
      }
      drawChart(ctx, ride, info, chartInfo, opts, frame, style, p);
      drawStats(ctx, statRows(ctx, ride, info, opts, frame.textSample, style, p), p);
      const range = gaugeRange(ride, info, style);
      const smooth = info.value(frame.sample);
      const text = info.value(frame.textSample);
      drawGauge(ctx, info, range, info.toDisplay(smooth, style), info.toDisplay(text, style), style, p);
    },
  };
}

export const panelOverlays: OverlayDefinition[] = PANEL_METRICS.map(makePanel);
