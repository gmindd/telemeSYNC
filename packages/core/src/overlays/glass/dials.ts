import type { MetricKey, RideData, RideSample } from '../../telemetry/ride.ts';
import { formatDuration } from '../../util/timezone.ts';
import { tr, type CoreKey } from '../../i18n/index.ts';
import { beforeStart } from '../dial/dials.ts';
import { drawText, font, measureTabular } from '../draw.ts';
import { POWER_ZONE_COLORS, POWER_ZONES } from '../panel/panel.ts';
import { mixColor, withAlpha } from '../panel/paint.ts';
import { interpolateOn } from '../panel/series.ts';
import { hrZone } from '../text/metrics.ts';
import type { Ctx2D, FrameState, OverlayContext, OverlayDefinition, OverlayId, OverlayStyle } from '../types.ts';
import { convert, fmt, wkgText } from '../units.ts';
import {
  ALTITUDE_STOPS,
  CADENCE_STOPS,
  DISTANCE_STOPS,
  GRADE_STOPS,
  hrColor,
  NO_VALUE,
  powerColor,
  progressOf,
  ramp,
  SPEED_STOPS,
  TEMPERATURE_STOPS,
  TIME_STOPS,
} from './colors.ts';
import { lineIcon, type LineIcon } from './icons.ts';
import { glassPaint, spaced, type GlassPaint } from './material.ts';
import { glassNames } from './names.ts';

// Round glass dials: a clear glass sphere with a half-moon of light along its top in the colour of the
// value (the colour runs continuously with the value: grade from blue to red, heart rate in its zone…),
// the number with its unit in the middle, a thin outline icon under it and the name under the sphere.
// The altitude dial shows the elevation around the rider as mountains that scroll past as the ride goes on.
export const G = 320;
const H = 366;
const CX = G / 2;
const CY = 160;
const R = 136;

interface GlassDialSpec {
  id: OverlayId;
  name: CoreKey;
  slug: string;
  requires: MetricKey;
  icon?: LineIcon;
  template: (style: OverlayStyle) => string;
  value: (s: RideSample, style: OverlayStyle, ride: RideData) => string;
  unit: (style: OverlayStyle) => string;
  /** Colour of the light at this sample (continuous with the value). */
  color: (s: RideSample, style: OverlayStyle, ride: RideData) => string;
  /** Zone appended to the name ("HEART RATE · Z3"). */
  zone?: 'hr' | 'power';
  /** Mark at the top of the sphere (level, for the grade). */
  tick?: boolean;
  mountains?: boolean;
}

function signed(v: number, decimals: number): string {
  if (!Number.isFinite(v)) return '—';
  const s = fmt(v, decimals);
  return v > 0 && /[1-9]/.test(s) ? `+${s}` : s;
}

const SPECS: GlassDialSpec[] = [
  {
    id: 'glassHeartRate',
    name: 'metric.heartRate',
    slug: 'heartRate',
    requires: 'heartRate',
    icon: 'heart',
    template: () => '188',
    value: (s) => fmt(s.heartRate, 0),
    unit: () => 'bpm',
    color: (s, st) => hrColor(s.heartRate, st),
    zone: 'hr',
  },
  {
    id: 'glassCadence',
    name: 'metric.cadence',
    slug: 'cadence',
    requires: 'cadence',
    icon: 'cadence',
    template: () => '188',
    value: (s) => fmt(s.cadence, 0),
    unit: () => 'rpm',
    color: (s) => ramp(CADENCE_STOPS, s.cadence),
  },
  {
    id: 'glassSpeed',
    name: 'metric.speed',
    slug: 'speed',
    requires: 'speed',
    icon: 'gauge',
    template: () => '88,8',
    value: (s, st) => fmt(convert.speed(s.speed, st.units), 1),
    unit: (st) => convert.speedUnit(st.units),
    color: (s) => ramp(SPEED_STOPS, s.speed * 3.6),
  },
  {
    id: 'glassGrade',
    name: 'metric.grade',
    slug: 'grade',
    requires: 'grade',
    icon: 'grade',
    template: () => '+88,8',
    value: (s) => signed(s.grade, 1),
    unit: () => '%',
    color: (s) => ramp(GRADE_STOPS, s.grade),
    tick: true,
  },
  {
    id: 'glassAltitude',
    name: 'metric.altitude',
    slug: 'altitude',
    requires: 'altitude',
    template: (st) => (st.units.system === 'metric' ? '8888' : '88888'),
    value: (s, st) => fmt(convert.elevation(s.altitude, st.units), 0),
    unit: (st) => convert.elevationUnit(st.units),
    color: (s) => ramp(ALTITUDE_STOPS, s.altitude),
    mountains: true,
  },
  {
    id: 'glassPower',
    name: 'metric.power',
    slug: 'power',
    requires: 'power',
    icon: 'bolt',
    template: () => '1888',
    value: (s) => fmt(s.power, 0),
    unit: () => 'W',
    color: (s, st) => powerColor(s.power, st),
    zone: 'power',
  },
  {
    id: 'glassDistance',
    name: 'metric.distance',
    slug: 'distance',
    requires: 'distance',
    icon: 'route',
    template: () => '188,8',
    value: (s, st) => fmt(convert.distance(s.distance, st.units), 1),
    unit: (st) => convert.distanceUnit(st.units),
    color: (s, _st, ride) => ramp(DISTANCE_STOPS, progressOf('distance', s, ride)),
  },
  {
    id: 'glassTime',
    name: 'metric.elapsedTime',
    slug: 'elapsedTime',
    requires: 'elapsedTime',
    icon: 'stopwatch',
    template: () => '8:88:88',
    value: (s, _st, ride) => (beforeStart(ride, s) ? formatDuration(0) : formatDuration(s.elapsedMs)),
    unit: () => '',
    color: (s, _st, ride) => ramp(TIME_STOPS, progressOf('time', s, ride)),
  },
  {
    id: 'glassTemperature',
    name: 'metric.temperature',
    slug: 'temperature',
    requires: 'temperature',
    icon: 'thermo',
    template: () => '-88',
    value: (s, st) => fmt(convert.temperature(s.temperature, st.units), 0),
    unit: (st) => convert.temperatureUnit(st.units),
    color: (s) => ramp(TEMPERATURE_STOPS, s.temperature),
  },
];

const noShadow = (ctx: Ctx2D) => {
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
};

/** Region inside the sphere and outside the same circle moved down by `t`: a crescent along the top. */
function crescentPath(ctx: Ctx2D, cx: number, cy: number, r: number, t: number) {
  // The two circles cross at height cy + t / 2.
  const half = Math.acos(Math.min(1, t / 2 / r));
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2 - half, -Math.PI / 2 + half);
  ctx.arc(cx, cy + t, r, -Math.PI / 2 + half - 0.0001, -Math.PI / 2 - half + 0.0001, true);
  ctx.closePath();
}

/** The clear glass sphere with its half-moon of coloured light; `inside` draws within it (clipped). */
export function glassSphere(ctx: Ctx2D, cx: number, cy: number, r: number, color: string, p: GlassPaint, inside?: () => void) {
  // Tint, carrying the soft drop shadow.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.shadowColor = 'rgba(0,0,0,0.32)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = `rgba(18,24,34,${p.tint * 0.75})`;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  const box = (paint: unknown) => {
    ctx.fillStyle = paint;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  };
  // Fresnel: glass looks clearer in the middle and brighter towards the edge.
  const fr = ctx.createRadialGradient(cx, cy - r * 0.18, r * 0.1, cx, cy, r);
  fr.addColorStop(0, 'rgba(255,255,255,0.04)');
  fr.addColorStop(0.62, 'rgba(255,255,255,0.05)');
  fr.addColorStop(0.88, 'rgba(255,255,255,0.11)');
  fr.addColorStop(1, 'rgba(255,255,255,0.26)');
  box(fr);
  // Light gathered in the bottom of the sphere.
  const bl = ctx.createRadialGradient(cx, cy + r * 1.05, r * 0.15, cx, cy + r * 0.7, r * 0.95);
  bl.addColorStop(0, 'rgba(255,255,255,0.24)');
  bl.addColorStop(1, 'rgba(255,255,255,0)');
  box(bl);
  // The value's colour pouring in from the top.
  const cg = ctx.createRadialGradient(cx, cy - r * 1.1, r * 0.2, cx, cy - r * 0.6, r * 1.15);
  cg.addColorStop(0, withAlpha(color, 0.42));
  cg.addColorStop(0.5, withAlpha(color, 0.09));
  cg.addColorStop(1, withAlpha(color, 0));
  box(cg);
  inside?.();
  // A soft highlight in the upper left, where the light hits the glass.
  const gl = ctx.createRadialGradient(cx - r * 0.38, cy - r * 0.5, r * 0.02, cx - r * 0.3, cy - r * 0.42, r * 0.62);
  gl.addColorStop(0, 'rgba(255,255,255,0.10)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  box(gl);
  ctx.restore();

  // Half moon: a crescent of light along the top, thick in the middle, fading towards the sides.
  const t = r * 0.085;
  // Halo just outside the rim.
  ctx.beginPath();
  ctx.arc(cx, cy, r + 0.5, -Math.PI + 0.55, -0.55);
  ctx.strokeStyle = withAlpha(color, 0.45);
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.shadowColor = withAlpha(color, 0.9);
  ctx.shadowBlur = 20;
  ctx.stroke();
  noShadow(ctx);
  const hg = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
  hg.addColorStop(0, withAlpha(color, 0));
  hg.addColorStop(0.1, withAlpha(color, 0.3));
  hg.addColorStop(0.3, withAlpha(color, 0.85));
  hg.addColorStop(0.5, withAlpha(mixColor(color, '#ffffff', 0.2), 1));
  hg.addColorStop(0.7, withAlpha(color, 0.85));
  hg.addColorStop(0.9, withAlpha(color, 0.3));
  hg.addColorStop(1, withAlpha(color, 0));
  crescentPath(ctx, cx, cy, r - 0.5, t);
  ctx.shadowColor = withAlpha(color, 0.95);
  ctx.shadowBlur = 26;
  ctx.fillStyle = hg;
  ctx.fill();
  noShadow(ctx);
  // A second, thinner and brighter crescent on top of it.
  crescentPath(ctx, cx, cy, r - 0.5, t * 0.45);
  const hb = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
  hb.addColorStop(0.15, 'rgba(255,255,255,0)');
  hb.addColorStop(0.5, withAlpha(mixColor(color, '#ffffff', 0.55), 0.95));
  hb.addColorStop(0.85, 'rgba(255,255,255,0)');
  ctx.fillStyle = hb;
  ctx.fill();

  // Rim: a hairline all around, bright along the bottom like light caught in the glass edge.
  ctx.beginPath();
  ctx.arc(cx, cy, r - 0.6, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.26)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.lineCap = 'round';
  const steps = 36;
  const a0 = Math.PI * 0.08;
  const a1 = Math.PI * 0.98;
  for (let k = 0; k < steps; k++) {
    const f = (k + 0.5) / steps;
    // Brightest towards the bottom-left.
    const a = Math.sin(Math.PI * f) ** 1.2 * (0.45 + 0.55 * f);
    ctx.beginPath();
    ctx.arc(cx, cy, r - 1.2, a0 + ((a1 - a0) * k) / steps, a0 + ((a1 - a0) * (k + 1)) / steps + 0.01);
    ctx.strokeStyle = `rgba(255,255,255,${0.85 * a})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

/** Elevation around the rider as two ranges of mountains (near and far), scrolling with the distance. */
function mountains(ctx: Ctx2D, ride: RideData, s: RideSample, color: string, before: boolean) {
  const n = ride.distance.length;
  const total = ride.distance[n - 1];
  if (!(total > 0)) return;
  const d = before ? 0 : Math.max(0, Math.min(total, s.distance || 0));
  const N = 72;
  const sample = (half: number) => {
    const out: number[] = [];
    for (let i = 0; i <= N; i++) {
      const x = d - half + (2 * half * i) / N;
      out.push(interpolateOn(ride.distance, ride.altitude, Math.max(0, Math.min(total, x))));
    }
    return out;
  };
  /** Moving average over ±k points (in two passes), so the ranges look like soft mountains, not GPS noise. */
  const smooth = (ys: number[], k: number) => {
    let a = ys;
    for (let pass = 0; pass < 2; pass++) {
      a = a.map((_, i) => {
        let sum = 0;
        let cnt = 0;
        for (let j = Math.max(0, i - k); j <= Math.min(a.length - 1, i + k); j++) {
          if (!Number.isFinite(a[j])) continue;
          sum += a[j];
          cnt++;
        }
        return cnt ? sum / cnt : NaN;
      });
    }
    return a;
  };
  const near = smooth(sample(2000), 2);
  const far = smooth(sample(7000), 3);
  let lo = Infinity;
  let hi = -Infinity;
  for (const a of [...near, ...far]) {
    if (!Number.isFinite(a)) continue;
    lo = Math.min(lo, a);
    hi = Math.max(hi, a);
  }
  if (!Number.isFinite(lo)) return;
  if (hi - lo < 80) {
    const c = (hi + lo) / 2;
    lo = c - 40;
    hi = c + 40;
  }
  const top = CY + 22;
  const bottom = CY + R - 14;
  const Y = (a: number) => bottom - (((Number.isFinite(a) ? a : lo) - lo) / (hi - lo)) * (bottom - top);
  const X = (i: number) => CX - R + (2 * R * i) / N;
  /** Smooth ridge through the points (midpoint quadratic curves). */
  const ridge = (ys: number[], lift: number) => {
    ctx.lineTo(X(0), Y(ys[0]) - lift);
    for (let i = 1; i < ys.length; i++) {
      const mx = (X(i - 1) + X(i)) / 2;
      const my = (Y(ys[i - 1]) + Y(ys[i])) / 2 - lift;
      ctx.quadraticCurveTo(X(i - 1), Y(ys[i - 1]) - lift, mx, my);
    }
    ctx.lineTo(X(ys.length - 1), Y(ys[ys.length - 1]) - lift);
  };
  /** A range of mountains: the ridge closed along the bottom of the sphere. */
  const range = (ys: number[], lift: number) => {
    ctx.beginPath();
    ctx.moveTo(X(0), CY + R);
    ridge(ys, lift);
    ctx.lineTo(X(ys.length - 1), CY + R);
    ctx.closePath();
  };
  // Far range: higher up, pale, misty.
  range(far, 16);
  const gf = ctx.createLinearGradient(0, top - 16, 0, CY + R);
  gf.addColorStop(0, 'rgba(225,232,242,0.22)');
  gf.addColorStop(1, 'rgba(225,232,242,0.03)');
  ctx.fillStyle = gf;
  ctx.fill();
  // Near range: brighter, with a lit ridge.
  range(near, 0);
  const gn = ctx.createLinearGradient(0, top, 0, CY + R);
  gn.addColorStop(0, 'rgba(236,241,248,0.42)');
  gn.addColorStop(0.55, 'rgba(200,210,224,0.16)');
  gn.addColorStop(1, 'rgba(200,210,224,0.06)');
  ctx.fillStyle = gn;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(X(0), Y(near[0]));
  ridge(near, 0);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.3;
  ctx.shadowColor = withAlpha(color, 0.7);
  ctx.shadowBlur = 6;
  ctx.stroke();
  noShadow(ctx);
  // The rider, on the ridge in the middle.
  if (!before) {
    const y = Y(near[N / 2]);
    ctx.beginPath();
    ctx.arc(CX, y, 3.6, 0, Math.PI * 2);
    ctx.shadowColor = withAlpha(color, 1);
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    noShadow(ctx);
  }
}

/** Number and unit on one line, centred, at a size fixed by the widest expected value. */
function valueLine(ctx: Ctx2D, text: string, unit: string, template: string, baseline: number, p: GlassPaint) {
  const maxW = R * 1.46;
  const measure = (size: number, t: string) => {
    ctx.font = font(p.ts, size, 600);
    const vw = measureTabular(ctx, t);
    ctx.font = font(p.ts, size * 0.62, 400);
    const uw = unit ? ctx.measureText(unit).width + size * 0.2 : 0;
    return { vw, uw };
  };
  const ref = measure(56, template);
  const size = Math.min(56, (56 * maxW) / Math.max(1, ref.vw + ref.uw));
  const m = measure(size, text);
  const x = CX - (m.vw + m.uw) / 2;
  drawText(ctx, text, x, baseline, p.ts, { size, weight: 600 });
  if (unit) drawText(ctx, unit, x + m.vw + size * 0.2, baseline, p.ts, { size: size * 0.62, weight: 400, tabular: false, color: 'rgba(255,255,255,0.9)' });
}

function zoneOf(kind: 'hr' | 'power', s: RideSample, style: OverlayStyle): number {
  if (kind === 'hr') return Number.isFinite(s.heartRate) ? Math.min(style.hrZoneColors.length - 1, hrZone(s.heartRate, style.hrZones)) : -1;
  return Number.isFinite(s.power) ? Math.min(POWER_ZONE_COLORS.length - 1, hrZone(s.power, POWER_ZONES.map((k) => k * style.ftp))) : -1;
}

function makeDial(spec: GlassDialSpec): OverlayDefinition {
  const names = glassNames(spec.name, spec.slug);
  return {
    id: spec.id,
    label: names.labelFor('en'),
    ...names,
    theme: 'glass',
    requires: spec.requires,
    textOnly: false,
    textRateOnly: (style) => style.panelRate === 'text',
    size: () => ({ width: G, height: H }),
    draw: (ctx: Ctx2D, fullFrame: FrameState, style: OverlayStyle, octx: OverlayContext) => {
      const frame = style.panelRate === 'text' ? { ...fullFrame, sample: fullFrame.textSample } : fullFrame;
      const ride = octx.ride;
      const p = glassPaint(style);
      const ts = frame.textSample;
      const before = beforeStart(ride, frame.sample);
      const color = before ? NO_VALUE : spec.color(frame.sample, style, ride);
      ctx.lineJoin = 'round';
      glassSphere(ctx, CX, CY, R, color, p, spec.mountains ? () => mountains(ctx, ride, frame.sample, color, before) : undefined);
      if (spec.tick) {
        ctx.beginPath();
        ctx.moveTo(CX, CY - R - 2);
        ctx.lineTo(CX, CY - R + 26);
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.shadowColor = withAlpha(color, 0.9);
        ctx.shadowBlur = 8;
        ctx.stroke();
        noShadow(ctx);
      }

      const unit = style.showUnit ? spec.unit(style) : '';
      valueLine(ctx, spec.value(ts, style, ride), unit, spec.template(style), spec.mountains ? CY - 2 : CY + 2, p);
      const wkg = spec.requires === 'power' ? wkgText(ts.power, style) : '';
      if (wkg) drawText(ctx, wkg, CX, CY + 60, p.ts, { size: 22, weight: 400, align: 'center', tabular: false, color: 'rgba(255,255,255,0.9)' });
      else if (spec.icon) lineIcon(ctx, spec.icon, CX, CY + 54, 46, 'rgba(255,255,255,0.92)');

      if (style.showLabel) {
        let label = tr(style.language, spec.name);
        const z = spec.zone && !beforeStart(ride, ts) ? zoneOf(spec.zone, ts, style) : -1;
        if (z >= 0) label += ` · Z${z + 1}`;
        spaced(ctx, label, CX, CY + R + 40, p.ts, { size: 14, weight: 600, align: 'center', color: 'rgba(255,255,255,0.88)', spacing: 0.2, maxW: G - 16 });
      }
    },
  };
}

export const glassDials: OverlayDefinition[] = SPECS.map(makeDial);
