import { cumulativeLoss } from '../../metrics/elevation.ts';
import type { MetricKey, RideData, RideSample } from '../../telemetry/ride.ts';
import { formatDuration } from '../../util/timezone.ts';
import { drawText, font, measureTabular } from '../draw.ts';
import { POWER_ZONE_COLORS, POWER_ZONES } from '../panel/panel.ts';
import { drawIcon, withAlpha } from '../panel/paint.ts';
import { chartRange, gaugeRange, PANEL_METRIC_INFO, statsUpTo, windowSeries, type IconId } from '../panel/series.ts';
import { hrZone } from '../text/metrics.ts';
import type { Ctx2D, FrameState, OverlayContext, OverlayDefinition, OverlayId, OverlayStyle, PanelMetric } from '../types.ts';
import { convert, fmt } from '../units.ts';
import { tr, type CoreKey } from '../../i18n/index.ts';
import {
  BELOW_H,
  CX,
  CY,
  DIAL,
  dialPaint,
  drawBelowRow,
  drawDialArc,
  drawDialBase,
  drawZoneBar,
  fitSize,
  R_INNER,
  type BelowItem,
  type DialColors,
  type DialPaint,
} from './common.ts';

const lossCache = new WeakMap<RideData, Float64Array>();

/** Elevation loss so far (m), with the same hysteresis as the gain. */
export function elevationLossAt(ride: RideData, s: RideSample): number {
  let loss = lossCache.get(ride);
  if (!loss) lossCache.set(ride, (loss = cumulativeLoss(ride.altitude)));
  return loss[Math.max(0, Math.min(loss.length - 1, s.index))];
}

function beforeStart(ride: RideData, s: RideSample): boolean {
  return s.outside && s.t < ride.startTime;
}

type Inner = 'hrZone' | 'powerZone' | 'terrain' | 'terrainTinted';

interface DialSpec {
  id: OverlayId;
  name: CoreKey;
  requires: MetricKey;
  colors: DialColors;
  icon: IconId;
  /** Icon in a fixed colour instead of the arc gradient. */
  iconColor?: string;
  /** Chainring rim (BTT); false = plain ring (road). */
  toothed?: boolean;
  /** Widest expected value, for a font size that never changes. */
  template: (style: OverlayStyle) => string;
  value: (s: RideSample, style: OverlayStyle, ride: RideData) => string;
  unit: (style: OverlayStyle) => string;
  /** Unit right after the number (%, °C) instead of under it. */
  inlineUnit?: boolean;
  /** Arc fill (0..1 of the sweep) and where it starts. */
  arc: (s: RideSample, style: OverlayStyle, ride: RideData) => { f: number; origin: number };
  inner?: Inner;
  below?: (s: RideSample, style: OverlayStyle, ride: RideData) => BelowItem[];
}

/** Arc position of a panel metric inside its ride range (display units). */
function metricArc(m: PanelMetric) {
  const info = PANEL_METRIC_INFO[m];
  return (s: RideSample, style: OverlayStyle, ride: RideData) => {
    const r = gaugeRange(ride, info, style);
    const span = r.max - r.min || 1;
    const v = info.toDisplay(info.value(s), style);
    return { f: Number.isFinite(v) ? (v - r.min) / span : NaN, origin: info.symmetric ? (0 - r.min) / span : 0 };
  };
}

function avgMax(m: PanelMetric, decimals: number) {
  const info = PANEL_METRIC_INFO[m];
  return (s: RideSample, style: OverlayStyle, ride: RideData): BelowItem[] => {
    const st = beforeStart(ride, s) ? { avg: NaN, max: NaN } : statsUpTo(ride, info, s.index);
    return [
      { label: tr(style.language, 'dial.avg'), value: fmt(info.toDisplay(st.avg, style), decimals) },
      { label: tr(style.language, 'dial.max'), value: fmt(info.toDisplay(st.max, style), decimals) },
    ];
  };
}

const SPECS: DialSpec[] = [
  {
    id: 'dialHeartRate',
    name: 'metric.heartRate',
    requires: 'heartRate',
    colors: { from: '#c4122f', to: '#ff3b4f' },
    icon: 'heart',
    iconColor: '#ff2d4b',
    template: () => '188',
    value: (s) => fmt(s.heartRate, 0),
    unit: () => 'bpm',
    arc: metricArc('heartRate'),
    inner: 'hrZone',
  },
  {
    id: 'dialCadence',
    name: 'metric.cadence',
    requires: 'cadence',
    colors: { from: '#6d28d9', to: '#c084fc' },
    icon: 'cadence',
    template: () => '188',
    value: (s) => fmt(s.cadence, 0),
    unit: () => 'rpm',
    arc: metricArc('cadence'),
  },
  {
    id: 'dialSpeed',
    name: 'metric.speed',
    requires: 'speed',
    colors: { from: '#1d4ed8', to: '#22d3ee' },
    icon: 'gauge',
    template: () => '88,8',
    value: (s, st) => fmt(convert.speed(s.speed, st.units), 1),
    unit: (st) => convert.speedUnit(st.units),
    arc: metricArc('speed'),
    below: avgMax('speed', 1),
  },
  {
    id: 'dialGrade',
    name: 'metric.grade',
    requires: 'grade',
    colors: { from: '#ff5a00', to: '#ffb020' },
    icon: 'mountain',
    template: () => '-88,8',
    value: (s) => fmt(s.grade, 1),
    unit: () => '%',
    inlineUnit: true,
    arc: metricArc('grade'),
    inner: 'terrainTinted',
  },
  {
    id: 'dialAltitude',
    name: 'metric.altitude',
    requires: 'altitude',
    colors: { from: '#ff7a00', to: '#ffd166' },
    icon: 'mountain',
    iconColor: '#ffffff',
    template: (st) => (st.units.system === 'metric' ? '8888' : '88888'),
    value: (s, st) => fmt(convert.elevation(s.altitude, st.units), 0),
    unit: (st) => convert.elevationUnit(st.units),
    arc: metricArc('altitude'),
    inner: 'terrain',
    below: (s, st, ride) => {
      const before = beforeStart(ride, s);
      const u = ` ${convert.elevationUnit(st.units)}`;
      const gain = before ? NaN : convert.elevation(s.elevationGain, st.units);
      const loss = before ? NaN : convert.elevation(elevationLossAt(ride, s), st.units);
      return [
        { icon: 'up', iconColor: '#4ade80', value: `${fmt(gain, 0)}${u}` },
        { icon: 'down', iconColor: '#4fc3f7', value: `${fmt(loss, 0)}${u}` },
      ];
    },
  },
  {
    id: 'dialPower',
    name: 'metric.power',
    requires: 'power',
    colors: { from: '#16a34a', to: '#facc15' },
    icon: 'bolt',
    template: () => '1888',
    value: (s) => fmt(s.power, 0),
    unit: () => 'W',
    arc: metricArc('power'),
    inner: 'powerZone',
    below: avgMax('power', 0),
  },
  {
    id: 'dialDistance',
    name: 'metric.distance',
    requires: 'distance',
    colors: { from: '#0891b2', to: '#38bdf8' },
    icon: 'link',
    template: () => '188,8',
    value: (s, st) => fmt(convert.distance(s.distance, st.units), 1),
    unit: (st) => convert.distanceUnit(st.units),
    arc: (s, _st, ride) => ({ f: s.distance / Math.max(1, ride.totals.distanceM), origin: 0 }),
    below: (_s, st, ride) => [{ label: tr(st.language, 'dial.total'), value: `${fmt(convert.distance(ride.totals.distanceM, st.units), 1)} ${convert.distanceUnit(st.units)}` }],
  },
  {
    id: 'dialTime',
    name: 'metric.elapsedTime',
    requires: 'elapsedTime',
    colors: { from: '#64748b', to: '#e2e8f0' },
    icon: 'clock',
    template: () => '8:88:88',
    value: (s, _st, ride) => (beforeStart(ride, s) ? formatDuration(0) : formatDuration(s.elapsedMs)),
    unit: () => 'h:m:s',
    arc: (s, _st, ride) => ({ f: s.elapsedMs / Math.max(1, ride.totals.durationMs), origin: 0 }),
    below: (_s, st, ride) => [{ label: tr(st.language, 'dial.total'), value: formatDuration(ride.totals.durationMs) }],
  },
  {
    id: 'dialTemperature',
    name: 'metric.temperature',
    requires: 'temperature',
    colors: { from: '#ff8a00', to: '#ffd23f' },
    icon: 'sun',
    iconColor: '#ffc93c',
    toothed: false,
    template: () => '-88',
    value: (s, st) => fmt(convert.temperature(s.temperature, st.units), 0),
    unit: (st) => convert.temperatureUnit(st.units),
    inlineUnit: true,
    arc: metricArc('temperature'),
  },
];

/** Recent elevation (last 1.5 km) as a silhouette in the bottom of the disc. */
function drawTerrain(ctx: Ctx2D, ride: RideData, s: RideSample, style: OverlayStyle, colors: DialColors, tinted: boolean) {
  const info = PANEL_METRIC_INFO.altitude;
  const series = windowSeries(ride, info, { chart: 'altitude', window: 'distance' }, { ...style, chartDistance: 1.5 }, s);
  if (series.xs.length < 2) return;
  const { lo, hi } = chartRange(series.ys, info, false);
  const top = CY + (tinted ? 46 : 60);
  const bottom = CY + R_INNER - 6;
  const x0 = CX - R_INNER;
  const w = R_INNER * 2;
  const Y = (v: number) => bottom - ((v - lo) / (hi - lo || 1)) * (bottom - top);
  ctx.save();
  ctx.beginPath();
  ctx.arc(CX, CY, R_INNER - 1, 0, Math.PI * 2);
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(x0 + series.xs[0] * w, CY + R_INNER);
  for (let i = 0; i < series.xs.length; i++) ctx.lineTo(x0 + series.xs[i] * w, Y(series.ys[i]));
  ctx.lineTo(x0 + series.xs[series.xs.length - 1] * w, CY + R_INNER);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, top, 0, CY + R_INNER);
  if (tinted) {
    g.addColorStop(0, withAlpha(colors.to, 0.85));
    g.addColorStop(1, withAlpha(colors.from, 0.15));
  } else {
    g.addColorStop(0, 'rgba(150,160,175,0.55)');
    g.addColorStop(1, 'rgba(60,68,80,0.15)');
  }
  ctx.fillStyle = g;
  ctx.fill();
  // Ridge line.
  ctx.beginPath();
  for (let i = 0; i < series.xs.length; i++) {
    const x = x0 + series.xs[i] * w;
    if (i === 0) ctx.moveTo(x, Y(series.ys[i]));
    else ctx.lineTo(x, Y(series.ys[i]));
  }
  ctx.strokeStyle = tinted ? colors.to : withAlpha(colors.to, 0.9);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawValue(ctx: Ctx2D, spec: DialSpec, s: RideSample, style: OverlayStyle, ride: RideData, p: DialPaint, compact: boolean) {
  const text = spec.value(s, style, ride);
  const unit = style.showUnit ? spec.unit(style) : '';
  const baseline = compact ? CY + 8 : CY + 16;
  if (spec.inlineUnit) {
    const tpl = spec.template(style);
    // Leave room for the unit, drawn at about half the size.
    const size = fitSize(ctx, p.ts, tpl, 172 - unit.length * 16, 66);
    ctx.font = font(p.ts, size, 800);
    const vw = measureTabular(ctx, text);
    ctx.font = font(p.ts, size * 0.48, 700);
    const uw = unit ? ctx.measureText(unit).width + 3 : 0;
    const x = CX - (vw + uw) / 2;
    drawText(ctx, text, x, baseline, p.ts, { size, weight: 800 });
    if (unit) drawText(ctx, unit, x + vw + 3, baseline, p.ts, { size: size * 0.48, weight: 700, tabular: false });
    return;
  }
  const size = fitSize(ctx, p.ts, spec.template(style), 168, 66);
  drawText(ctx, text, CX, baseline, p.ts, { size, weight: 800, align: 'center' });
  if (unit) drawText(ctx, unit, CX, baseline + 33, p.ts, { size: 19, weight: 600, align: 'center', tabular: false, color: 'rgba(255,255,255,0.85)' });
}

function makeDial(spec: DialSpec): OverlayDefinition {
  const height = spec.below ? DIAL + BELOW_H : DIAL;
  return {
    id: spec.id,
    label: tr('en', 'overlay.dial', { name: tr('en', spec.name) }),
    requires: spec.requires,
    textOnly: false,
    textRateOnly: (style) => style.panelRate === 'text',
    size: () => ({ width: DIAL, height }),
    draw: (ctx: Ctx2D, fullFrame: FrameState, style: OverlayStyle, octx: OverlayContext) => {
      const frame = style.panelRate === 'text' ? { ...fullFrame, sample: fullFrame.textSample } : fullFrame;
      const ride = octx.ride;
      const p = dialPaint(style);
      drawDialBase(ctx, spec.colors, p, spec.toothed ?? true);
      const arc = spec.arc(frame.sample, style, ride);
      const tip = beforeStart(ride, frame.sample) ? NaN : arc.f;
      drawDialArc(ctx, spec.colors, arc.origin, Number.isFinite(tip) ? tip : arc.origin, tip);

      const ts = frame.textSample;
      if (spec.inner === 'terrain' || spec.inner === 'terrainTinted') drawTerrain(ctx, ride, frame.sample, style, spec.colors, spec.inner === 'terrainTinted');
      const iconPaint = spec.iconColor ?? (() => {
        const g = ctx.createLinearGradient(0, CY - 40, 0, CY - 80);
        g.addColorStop(0, spec.colors.from);
        g.addColorStop(1, spec.colors.to);
        return g;
      })();
      const compact = spec.inner === 'hrZone' || spec.inner === 'powerZone';
      drawIcon(ctx, spec.icon, CX, compact ? CY - 62 : CY - 58, 32, iconPaint);
      drawValue(ctx, spec, ts, style, ride, p, compact);

      if (spec.inner === 'hrZone') {
        const z = beforeStart(ride, ts) || !Number.isFinite(ts.heartRate) ? -1 : Math.min(style.hrZoneColors.length - 1, hrZone(ts.heartRate, style.hrZones));
        drawZoneBar(ctx, CY + 58, 112, style.hrZoneColors, z);
        if (z >= 0) drawText(ctx, tr(style.language, 'dial.zone', { n: z + 1 }), CX, CY + 88, p.ts, { size: 16, weight: 700, align: 'center', tabular: false, color: style.hrZoneColors[z] });
      } else if (spec.inner === 'powerZone') {
        const bounds = POWER_ZONES.map((k) => k * style.ftp);
        const z = beforeStart(ride, ts) || !Number.isFinite(ts.power) ? -1 : Math.min(POWER_ZONE_COLORS.length - 1, hrZone(ts.power, bounds));
        drawZoneBar(ctx, CY + 58, 126, POWER_ZONE_COLORS, z);
        if (z >= 0) drawText(ctx, tr(style.language, 'dial.zone', { n: z + 1 }), CX, CY + 88, p.ts, { size: 16, weight: 700, align: 'center', tabular: false, color: POWER_ZONE_COLORS[z] });
      }
      if (spec.below) drawBelowRow(ctx, spec.below(ts, style, ride), p);
    },
  };
}

export const dialOverlays: OverlayDefinition[] = SPECS.map(makeDial);
