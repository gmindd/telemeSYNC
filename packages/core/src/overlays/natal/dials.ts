import type { MetricKey, RideData, RideSample } from '../../telemetry/ride.ts';
import { formatDuration } from '../../util/timezone.ts';
import { tr, type CoreKey } from '../../i18n/index.ts';
import { ARC_R, ARC_W, CX, CY, DIAL, angleAt, dialPaint, drawDialArc, drawDialBase, fitSize, R_INNER, type DialColors, type DialPaint } from '../dial/common.ts';
import { beforeStart, metricArc } from '../dial/dials.ts';
import { drawText, font, measureTabular } from '../draw.ts';
import { drawIcon, mixColor, withAlpha } from '../panel/paint.ts';
import type { IconId } from '../panel/series.ts';
import { hrZone } from '../text/metrics.ts';
import type { Ctx2D, FrameState, OverlayContext, OverlayDefinition, OverlayId, OverlayStyle } from '../types.ts';
import { convert, fmt } from '../units.ts';
import { antler, bow, candyCane, candyRing, holly, lightsOnArc, logRing, ribbon, santaHat, snowOnArc, woodRing, wreathRing } from './deco.ts';
import { natalNames, type Variant } from './names.ts';

// Round Christmas dials: the dial of the "Mostradores" (value arc, icon, number, unit) in a festive rim
// (neon ring, candy cane, wood, tree log or pine wreath) with decorations around it. The dial keeps its
// 300 px layout; the canvas has a margin around it for snow, hats, antlers and the zone ribbon.
export const N_W = DIAL + 40;
export const N_H = DIAL + 64;
/** Where the 300 px dial sits in the canvas. */
export const OX = 20;
export const OY = 34;

export type NatalIcon = IconId | 'pin';
type Rim = 'glow' | 'candy' | 'wood' | 'log' | 'wreath';

interface NatalDialSpec {
  id: OverlayId;
  name: CoreKey;
  slug: string;
  variant?: Variant;
  requires: MetricKey;
  colors: DialColors;
  icon: NatalIcon;
  iconColor?: string;
  rim: Rim;
  template: (style: OverlayStyle) => string;
  value: (s: RideSample, style: OverlayStyle, ride: RideData) => string;
  unit: (style: OverlayStyle) => string;
  inlineUnit?: boolean;
  arc: (s: RideSample, style: OverlayStyle, ride: RideData) => { f: number; origin: number };
  /** Heart-rate zone on a red ribbon under the dial. */
  zoneRibbon?: boolean;
  /** Decorations behind the rim (antlers) and in front of it (snow, hat, holly…); t = time for the lights. */
  behind?: (ctx: Ctx2D, t: number) => void;
  front?: (ctx: Ctx2D, t: number) => void;
}

/** Map pin icon. */
function pin(ctx: Ctx2D, cx: number, cy: number, s: number, paint: unknown) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.12, s * 0.34, Math.PI * 0.85, Math.PI * 2.15);
  ctx.lineTo(cx, cy + s * 0.5);
  ctx.closePath();
  ctx.fillStyle = paint;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.12, s * 0.13, 0, Math.PI * 2);
  ctx.fillStyle = '#0d1116';
  ctx.fill();
  ctx.restore();
}

export function natalIcon(ctx: Ctx2D, icon: NatalIcon, cx: number, cy: number, s: number, paint: unknown) {
  if (icon === 'pin') pin(ctx, cx, cy, s, paint);
  else drawIcon(ctx, icon, cx, cy, s, paint);
}

/** Track of the value arc and the dark disc, inside any rim. */
function trackAndDisc(ctx: Ctx2D, p: DialPaint) {
  ctx.beginPath();
  ctx.arc(CX, CY, ARC_R + ARC_W / 2 + 4, 0, Math.PI * 2);
  ctx.fillStyle = '#0d1116';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(CX, CY, ARC_R, angleAt(0), angleAt(1));
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = ARC_W;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(CX, CY, R_INNER, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(CX, CY - 30, 10, CX, CY, R_INNER);
  g.addColorStop(0, withAlpha('#1b2430', 0.98));
  g.addColorStop(1, p.disc);
  ctx.fillStyle = g;
  ctx.fill();
}

function drawRim(ctx: Ctx2D, rim: Rim, colors: DialColors, p: DialPaint) {
  switch (rim) {
    case 'glow': {
      drawDialBase(ctx, colors, p, false);
      // Neon ring all around, in the dial's colours.
      ctx.beginPath();
      ctx.arc(CX, CY, 140, 0, Math.PI * 2);
      const g = ctx.createLinearGradient(CX, CY - 140, CX, CY + 140);
      g.addColorStop(0, colors.to);
      g.addColorStop(1, colors.from);
      ctx.strokeStyle = g;
      ctx.lineWidth = 7;
      ctx.shadowColor = withAlpha(colors.to, 0.9);
      ctx.shadowBlur = 18;
      ctx.stroke();
      ctx.shadowColor = 'rgba(0,0,0,0)';
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(CX, CY, 140, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      return;
    }
    case 'candy':
      candyRing(ctx, CX, CY, 139, 18);
      break;
    case 'wood':
      woodRing(ctx, CX, CY, 128, 148);
      break;
    case 'log':
      logRing(ctx, CX, CY, 128, 150);
      break;
    case 'wreath':
      wreathRing(ctx, CX, CY, 139, 24);
      break;
  }
  trackAndDisc(ctx, p);
}

function drawValue(ctx: Ctx2D, spec: NatalDialSpec, s: RideSample, style: OverlayStyle, ride: RideData, p: DialPaint, compact: boolean) {
  const text = spec.value(s, style, ride);
  const unit = style.showUnit ? spec.unit(style) : '';
  const baseline = compact ? CY + 8 : CY + 16;
  if (spec.inlineUnit) {
    const size = fitSize(ctx, p.ts, spec.template(style), 172 - unit.length * 16, 66);
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

const TOP = -Math.PI / 2;

const SPECS: NatalDialSpec[] = [
  {
    id: 'natalHeartRate',
    name: 'metric.heartRate',
    slug: 'heartRate',
    requires: 'heartRate',
    colors: { from: '#b0102b', to: '#ff3b4f' },
    icon: 'heart',
    iconColor: '#ff2d4b',
    rim: 'glow',
    template: () => '188',
    value: (s) => fmt(s.heartRate, 0),
    unit: () => 'bpm',
    arc: metricArc('heartRate'),
    zoneRibbon: true,
    front: (ctx) => santaHat(ctx, CX + 74, CY - 112, 86, 0.5),
  },
  {
    id: 'natalHeartRateReindeer',
    name: 'metric.heartRate',
    slug: 'heartRate',
    variant: 'reindeer',
    requires: 'heartRate',
    colors: { from: '#b0102b', to: '#ff3b4f' },
    icon: 'heart',
    iconColor: '#ff2d4b',
    rim: 'wood',
    template: () => '188',
    value: (s) => fmt(s.heartRate, 0),
    unit: () => 'bpm',
    arc: metricArc('heartRate'),
    zoneRibbon: true,
    behind: (ctx) => {
      antler(ctx, CX - 58, CY - 104, 78, -1);
      antler(ctx, CX + 58, CY - 104, 78, 1);
    },
    front: (ctx) => holly(ctx, CX, CY - 138, 30),
  },
  {
    id: 'natalCadence',
    name: 'metric.cadence',
    slug: 'cadence',
    requires: 'cadence',
    colors: { from: '#15803d', to: '#4ade80' },
    icon: 'cadence',
    iconColor: '#4ade80',
    rim: 'glow',
    template: () => '188',
    value: (s) => fmt(s.cadence, 0),
    unit: () => 'rpm',
    arc: metricArc('cadence'),
    front: (ctx) => {
      candyCane(ctx, CX + 104, CY + 132, 122, 12, -0.32);
      holly(ctx, CX + 96, CY + 112, 36, 0.4);
    },
  },
  {
    id: 'natalSpeed',
    name: 'metric.speed',
    slug: 'speed',
    requires: 'speed',
    colors: { from: '#1d4ed8', to: '#22d3ee' },
    icon: 'gauge',
    rim: 'glow',
    template: () => '88,8',
    value: (s, st) => fmt(convert.speed(s.speed, st.units), 1),
    unit: (st) => convert.speedUnit(st.units),
    arc: metricArc('speed'),
    front: (ctx) => snowOnArc(ctx, CX, CY, 141, TOP - 1.05, TOP + 1.05, 20, 3),
  },
  {
    id: 'natalSpeedLog',
    name: 'metric.speed',
    slug: 'speed',
    variant: 'log',
    requires: 'speed',
    colors: { from: '#f59e0b', to: '#fde047' },
    icon: 'gauge',
    rim: 'log',
    template: () => '88,8',
    value: (s, st) => fmt(convert.speed(s.speed, st.units), 1),
    unit: (st) => convert.speedUnit(st.units),
    arc: metricArc('speed'),
    front: (ctx) => {
      snowOnArc(ctx, CX, CY, 147, TOP - 0.95, TOP + 0.95, 22, 5);
      holly(ctx, CX - 104, CY + 104, 30, -0.8);
    },
  },
  {
    id: 'natalAltitude',
    name: 'metric.altitude',
    slug: 'altitude',
    requires: 'altitude',
    colors: { from: '#ff7a00', to: '#ffd166' },
    icon: 'mountain',
    iconColor: '#ffd166',
    rim: 'glow',
    template: (st) => (st.units.system === 'metric' ? '8888' : '88888'),
    value: (s, st) => fmt(convert.elevation(s.altitude, st.units), 0),
    unit: (st) => convert.elevationUnit(st.units),
    arc: metricArc('altitude'),
    front: (ctx) => snowOnArc(ctx, CX, CY, 141, TOP - 1.15, TOP + 0.9, 18, 8),
  },
  {
    id: 'natalPower',
    name: 'metric.power',
    slug: 'power',
    requires: 'power',
    colors: { from: '#7c3aed', to: '#e879f9' },
    icon: 'bolt',
    iconColor: '#facc15',
    rim: 'glow',
    template: () => '1888',
    value: (s) => fmt(s.power, 0),
    unit: () => 'W',
    arc: metricArc('power'),
    front: (ctx, t) => {
      snowOnArc(ctx, CX, CY, 141, TOP - 0.85, TOP + 0.85, 17, 13);
      lightsOnArc(ctx, CX, CY, 146, Math.PI * 0.18, Math.PI * 0.82, 9, t);
    },
  },
  {
    id: 'natalPowerWreath',
    name: 'metric.power',
    slug: 'power',
    variant: 'wreath',
    requires: 'power',
    colors: { from: '#16a34a', to: '#facc15' },
    icon: 'bolt',
    iconColor: '#facc15',
    rim: 'wreath',
    template: () => '1888',
    value: (s) => fmt(s.power, 0),
    unit: () => 'W',
    arc: metricArc('power'),
    front: (ctx) => bow(ctx, CX, CY - 140, 74),
  },
  {
    id: 'natalDistance',
    name: 'metric.distance',
    slug: 'distance',
    requires: 'distance',
    colors: { from: '#15803d', to: '#86efac' },
    icon: 'pin',
    iconColor: '#4ade80',
    rim: 'glow',
    template: () => '188,8',
    value: (s, st) => fmt(convert.distance(s.distance, st.units), 1),
    unit: (st) => convert.distanceUnit(st.units),
    arc: (s, _st, ride) => ({ f: s.distance / Math.max(1, ride.totals.distanceM), origin: 0 }),
    front: (ctx, t) => {
      lightsOnArc(ctx, CX, CY, 146, Math.PI * 1.15, Math.PI * 1.85, 9, t);
      holly(ctx, CX + 100, CY + 104, 30, 0.8);
    },
  },
  {
    id: 'natalTime',
    name: 'metric.elapsedTime',
    slug: 'elapsedTime',
    requires: 'elapsedTime',
    colors: { from: '#c4141f', to: '#ffffff' },
    icon: 'clock',
    iconColor: '#ffffff',
    rim: 'candy',
    template: () => '8:88:88',
    value: (s, _st, ride) => (beforeStart(ride, s) ? formatDuration(0) : formatDuration(s.elapsedMs)),
    unit: () => 'h:m:s',
    arc: (s, _st, ride) => ({ f: s.elapsedMs / Math.max(1, ride.totals.durationMs), origin: 0 }),
    front: (ctx) => santaHat(ctx, CX + 74, CY - 112, 86, 0.5),
  },
  {
    id: 'natalTemperature',
    name: 'metric.temperature',
    slug: 'temperature',
    requires: 'temperature',
    colors: { from: '#ff8a00', to: '#ff3b3b' },
    icon: 'thermo',
    iconColor: '#ff4b4b',
    rim: 'wreath',
    template: () => '-88',
    value: (s, st) => fmt(convert.temperature(s.temperature, st.units), 0),
    unit: (st) => convert.temperatureUnit(st.units),
    inlineUnit: true,
    arc: metricArc('temperature'),
    front: (ctx) => bow(ctx, CX, CY + 132, 64),
  },
];

function makeDial(spec: NatalDialSpec): OverlayDefinition {
  return {
    id: spec.id,
    label: natalNames(spec.name, spec.slug, spec.variant).labelFor('en'),
    ...natalNames(spec.name, spec.slug, spec.variant),
    theme: 'natal',
    requires: spec.requires,
    textOnly: false,
    textRateOnly: (style) => style.panelRate === 'text',
    size: () => ({ width: N_W, height: N_H }),
    draw: (ctx: Ctx2D, fullFrame: FrameState, style: OverlayStyle, octx: OverlayContext) => {
      const frame = style.panelRate === 'text' ? { ...fullFrame, sample: fullFrame.textSample } : fullFrame;
      const ride = octx.ride;
      const p = dialPaint(style);
      const t = frame.textSample.t;
      ctx.save();
      ctx.translate(OX, OY);
      ctx.lineJoin = 'round';
      spec.behind?.(ctx, t);
      drawRim(ctx, spec.rim, spec.colors, p);
      const arc = spec.arc(frame.sample, style, ride);
      const tip = beforeStart(ride, frame.sample) ? NaN : arc.f;
      drawDialArc(ctx, spec.colors, arc.origin, Number.isFinite(tip) ? tip : arc.origin, tip);
      const ts = frame.textSample;
      natalIcon(ctx, spec.icon, CX, CY - 58, 32, spec.iconColor ?? mixColor(spec.colors.from, spec.colors.to, 0.5));
      drawValue(ctx, spec, ts, style, ride, p, false);
      spec.front?.(ctx, t);
      if (spec.zoneRibbon) {
        const z = beforeStart(ride, ts) || !Number.isFinite(ts.heartRate) ? -1 : Math.min(style.hrZoneColors.length - 1, hrZone(ts.heartRate, style.hrZones));
        ribbon(ctx, CX, CY + 138, 118, 30);
        const text = z >= 0 ? tr(style.language, 'dial.zone', { n: z + 1 }) : '—';
        drawText(ctx, text, CX, CY + 145, p.ts, { size: 19, weight: 800, align: 'center', tabular: false });
      }
      ctx.restore();
    },
  };
}

export const natalDials: OverlayDefinition[] = SPECS.map(makeDial);
