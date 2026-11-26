import type { RideData, RideSample } from '../../telemetry/ride.ts';
import { tr } from '../../i18n/index.ts';
import { fitSize } from '../dial/common.ts';
import { drawText } from '../draw.ts';
import { POWER_ZONE_COLORS, POWER_ZONES } from '../panel/panel.ts';
import { mixColor, withAlpha } from '../panel/paint.ts';
import { metricColor, NO_VALUE } from './colors.ts';
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
  type PanelMetricInfo,
  type StatKind,
} from '../panel/series.ts';
import { hrZone } from '../text/metrics.ts';
import type { Ctx2D, FrameState, OverlayContext, OverlayDefinition, OverlayId, OverlayStyle, PanelMetric, PanelOptions } from '../types.ts';
import { convert, fmt } from '../units.ts';
import { GLASS, SHADOW_PAD, glassArc, glassPaint, glassRect, glowDot, hairline, hueLight, spaced, valueWithUnit, zonePills, zoneText, type GlassPaint, type Hue } from './material.ts';
import { glassNames } from './names.ts';

// Glass dashboard panel: one frosted card with the current value in a thin ring, three ride-so-far
// numbers (max, average, zone…) in a quiet column and a fine line chart of the last minutes or kilometres.
const W = 780;
const H = 240;
const M = 12;
const GX = 128;
const GY = H / 2;
const GR = 84;
const DIV1 = 238;
const STATS_X0 = 258;
const STATS_X1 = 476;
const DIV2 = 496;
const CHART_X0 = 552;
const CHART_X1 = W - M - 22;
const TOP = 44;
const BOTTOM = H - 40;
const A0 = Math.PI * 0.75;
const SWEEP = Math.PI * 1.5;

export const GLASS_PANEL_HUE: Record<PanelMetric, Hue> = {
  speed: GLASS.ice,
  power: GLASS.amber,
  heartRate: GLASS.rose,
  cadence: GLASS.lilac,
  altitude: GLASS.pearl,
  grade: GLASS.mint,
  temperature: GLASS.lilac,
};

export const GLASS_PANEL_IDS: Record<PanelMetric, OverlayId> = {
  speed: 'glassPanelSpeed',
  altitude: 'glassPanelAltitude',
  grade: 'glassPanelGrade',
  heartRate: 'glassPanelHeartRate',
  cadence: 'glassPanelCadence',
  power: 'glassPanelPower',
  temperature: 'glassPanelTemperature',
};

function signed(v: number, decimals: number): string {
  if (!Number.isFinite(v)) return '—';
  const s = fmt(v, decimals);
  return v > 0 && s.replace(/[0,.]/g, '') !== '' ? `+${s}` : s;
}

interface GlassStat {
  label: string;
  value: string;
  unit?: string;
  color?: string;
  /** Zone pills under the row. */
  zones?: { colors: string[]; current: number };
}

function stats(ride: RideData, info: PanelMetricInfo, opts: PanelOptions, s: RideSample, style: OverlayStyle): GlassStat[] {
  const before = s.outside && s.t < ride.startTime;
  const st = before ? { max: NaN, min: NaN, avg: NaN } : statsUpTo(ride, info, s.index);
  const unit = info.unit(style);
  const val = (v: number) => fmt(info.toDisplay(v, style), info.decimals);
  const lang = style.language;
  return info.stats.map((kind: StatKind): GlassStat => {
    switch (kind) {
      case 'max':
        return { label: tr(lang, info.id === 'power' ? 'stat.peak' : 'stat.max'), value: val(st.max), unit };
      case 'min':
        return { label: tr(lang, 'stat.min'), value: val(st.min), unit };
      case 'avg':
        return { label: tr(lang, 'stat.avg'), value: val(st.avg), unit };
      case 'gain': {
        const g = before ? NaN : convert.elevation(s.elevationGain, style.units);
        return { label: tr(lang, 'stat.gain'), value: fmt(g, 0), unit: convert.elevationUnit(style.units) };
      }
      case 'delta': {
        const ago = valueWindowAgo(ride, info, opts, style, s);
        const d = before ? NaN : info.toDisplay(info.value(s), style) - info.toDisplay(ago, style);
        return { label: tr(lang, 'stat.delta', { span: windowSpan(opts, style).toLowerCase() }), value: signed(d, info.decimals), unit };
      }
      case 'accel': {
        const a = before ? NaN : accelerationAt(ride, s);
        return { label: tr(lang, 'stat.accel'), value: signed(a, 1), unit: 'm/s²' };
      }
      case 'zone': {
        const v = info.value(s);
        const isPower = info.id === 'power';
        const bounds = isPower ? POWER_ZONES.map((k) => k * style.ftp) : style.hrZones;
        const colors = isPower ? POWER_ZONE_COLORS : style.hrZoneColors;
        const z = before || !Number.isFinite(v) ? -1 : Math.min(colors.length - 1, hrZone(v, bounds));
        return { label: tr(lang, 'stat.zone'), value: z >= 0 ? `Z${z + 1}` : '—', color: z >= 0 ? zoneText(colors[z]) : undefined, zones: { colors, current: z } };
      }
    }
  });
}

function drawStats(ctx: Ctx2D, rows: GlassStat[], p: GlassPaint) {
  const rowH = (BOTTOM - TOP + 16) / rows.length;
  rows.forEach((r, i) => {
    const y = TOP - 8 + i * rowH;
    if (i > 0) hairline(ctx, STATS_X0, y, STATS_X1, y, 0.12);
    const base = r.zones ? y + rowH * 0.5 : y + rowH * 0.62;
    // Value first (right-aligned), so the label can shrink into what is left.
    const vw = valueWithUnit(ctx, r.value, r.unit ?? '', STATS_X1, base + 6, p, { size: 26, unitSize: 13, align: 'right', color: r.color });
    spaced(ctx, r.label, STATS_X0, base, p.ts, { size: 11, weight: 600, color: p.label, maxW: STATS_X1 - STATS_X0 - vw - 14 });
    if (r.zones) zonePills(ctx, STATS_X0, y + rowH - 14, STATS_X1 - STATS_X0, 5, r.zones.colors, r.zones.current);
  });
}

function drawGauge(ctx: Ctx2D, info: PanelMetricInfo, ride: RideData, frame: FrameState, style: OverlayStyle, p: GlassPaint, hue: Hue) {
  const range = gaugeRange(ride, info, style);
  const span = range.max - range.min || 1;
  const smooth = info.toDisplay(info.value(frame.sample), style);
  const text = info.toDisplay(info.value(frame.textSample), style);
  const f = (smooth - range.min) / span;
  const origin = info.symmetric ? (0 - range.min) / span : 0;
  const tip = Number.isFinite(f) ? f : NaN;
  glassArc(ctx, GX, GY, GR, 5, A0, SWEEP, hue, origin, Number.isFinite(tip) ? tip : origin, tip);
  if (style.showLabel) spaced(ctx, tr(style.language, `metric.${info.id}`), GX, GY - 30, p.ts, { size: 11, weight: 600, align: 'center', maxW: 118 });
  const tpl = fmt(range.max, info.decimals).replace(/\d/g, '8') + (range.min < 0 ? '-' : '');
  const size = fitSize(ctx, p.ts, tpl, 112, 52, 400);
  drawText(ctx, fmt(text, info.decimals), GX, GY + 16, p.ts, { size, weight: 400, align: 'center' });
  if (style.showUnit) drawText(ctx, info.unit(style), GX, GY + 42, p.ts, { size: 15, weight: 400, align: 'center', tabular: false, color: p.label });
}

function drawChart(ctx: Ctx2D, ride: RideData, metric: PanelMetricInfo, chartInfo: PanelMetricInfo, opts: PanelOptions, frame: FrameState, style: OverlayStyle, p: GlassPaint) {
  const hue = GLASS_PANEL_HUE[chartInfo.id];
  let title = windowLabel(opts, style);
  if (chartInfo.id !== metric.id) title += ` · ${tr(style.language, `chart.${chartInfo.id}`)}`;
  spaced(ctx, title, DIV2 + 20, TOP - 4, p.ts, { size: 11, weight: 600, color: p.label, maxW: CHART_X1 - DIV2 - 20 });
  const series = windowSeries(ride, chartInfo, opts, style, frame.sample);
  const { lo, hi } = chartRange(series.ys, chartInfo, chartInfo.chart === 'bars' || chartInfo.zeroBased);
  const y0 = TOP + 14;
  const y1 = BOTTOM + 10;
  const X = (f: number) => CHART_X0 + f * (CHART_X1 - CHART_X0);
  const Y = (v: number) => y1 - ((v - lo) / (hi - lo || 1)) * (y1 - y0);
  // Hairline grid with small labels on the left.
  for (let k = 0; k <= 2; k++) {
    const v = lo + ((hi - lo) * k) / 2;
    const y = Y(v);
    hairline(ctx, CHART_X0, y, CHART_X1, y, k === 0 ? 0.2 : 0.09);
    drawText(ctx, fmt(v, chartInfo.decimals > 0 && hi - lo < 10 ? 1 : 0), CHART_X0 - 10, y + 4, p.ts, { size: 11, weight: 400, align: 'right', color: p.faint });
  }
  if (series.xs.length < 2) return;
  // Area under the line, fading to clear.
  ctx.save();
  ctx.beginPath();
  ctx.rect(CHART_X0, y0 - 10, CHART_X1 - CHART_X0 + 8, y1 - y0 + 10);
  ctx.clip();
  const runs: [number, number][] = [];
  let start = 0;
  for (let i = 1; i <= series.xs.length; i++) {
    if (i === series.xs.length || series.breaks[i]) {
      if (i - start >= 2) runs.push([start, i - 1]);
      start = i;
    }
  }
  const fill = ctx.createLinearGradient(0, y0, 0, y1);
  fill.addColorStop(0, withAlpha(hueLight(hue), 0.34));
  fill.addColorStop(1, withAlpha(hue.from, 0));
  for (const [a, b] of runs) {
    ctx.beginPath();
    ctx.moveTo(X(series.xs[a]), y1);
    for (let i = a; i <= b; i++) ctx.lineTo(X(series.xs[i]), Y(Math.max(lo, Math.min(hi, series.ys[i]))));
    ctx.lineTo(X(series.xs[b]), y1);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }
  const line = ctx.createLinearGradient(CHART_X0, 0, CHART_X1, 0);
  line.addColorStop(0, withAlpha(hue.to, 0.55));
  line.addColorStop(1, hue.to);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const [a, b] of runs) {
    ctx.beginPath();
    for (let i = a; i <= b; i++) {
      const x = X(series.xs[i]);
      const y = Y(Math.max(lo, Math.min(hi, series.ys[i])));
      if (i === a) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.shadowColor = withAlpha(hue.from, 0.85);
    ctx.shadowBlur = 10;
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.shadowBlur = 0;
  }
  ctx.restore();
  if (Number.isFinite(series.current)) glowDot(ctx, X(1), Y(Math.max(lo, Math.min(hi, series.current))), 4.5, hue);
}

function makePanel(metric: PanelMetric): OverlayDefinition {
  const info = PANEL_METRIC_INFO[metric];
  const names = glassNames(`metric.${metric}`, metric, { panel: true });
  return {
    id: GLASS_PANEL_IDS[metric],
    label: names.labelFor('en'),
    ...names,
    theme: 'glass',
    requires: metric,
    textOnly: false,
    textRateOnly: (style) => style.panelRate === 'text',
    size: () => ({ width: W + SHADOW_PAD * 2, height: H + SHADOW_PAD * 2 }),
    draw: (ctx: Ctx2D, fullFrame: FrameState, style: OverlayStyle, octx: OverlayContext) => {
      const frame = style.panelRate === 'text' ? { t: fullFrame.textSample.t, sample: fullFrame.textSample, textSample: fullFrame.textSample } : fullFrame;
      const ride = octx.ride;
      const p = glassPaint(style);
      const opts = panelOptions(metric, style, ride);
      const chartInfo = PANEL_METRIC_INFO[opts.chart];
      // Ring and glass glow in the colour of the current value (continuous, like the dials).
      const before = frame.sample.outside && frame.sample.t < ride.startTime;
      const c = before ? NO_VALUE : metricColor(metric, frame.sample, style);
      const hue = { from: c, to: mixColor(c, '#ffffff', 0.45) };
      ctx.save();
      ctx.translate(SHADOW_PAD, SHADOW_PAD);
      ctx.lineJoin = 'round';
      glassRect(ctx, M, M, W - M * 2, H - M * 2, 30, p, hue);
      hairline(ctx, DIV1, TOP - 8, DIV1, BOTTOM + 8, 0.14);
      hairline(ctx, DIV2, TOP - 8, DIV2, BOTTOM + 8, 0.14);
      drawGauge(ctx, info, ride, frame, style, p, hue);
      drawStats(ctx, stats(ride, info, opts, frame.textSample, style), p);
      drawChart(ctx, ride, info, chartInfo, opts, frame, style, p);
      ctx.restore();
    },
  };
}

export const glassPanels: OverlayDefinition[] = PANEL_METRICS.map(makePanel);

/** Panel metric of a glass panel id, or undefined. */
export function glassPanelMetricOf(id: OverlayId): PanelMetric | undefined {
  return PANEL_METRICS.find((m) => GLASS_PANEL_IDS[m] === id);
}
