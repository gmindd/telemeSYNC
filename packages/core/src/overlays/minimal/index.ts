import { tr } from '../../i18n/index.ts';
import { formatDuration } from '../../util/timezone.ts';
import { beforeStart } from '../dial/dials.ts';
import { CX, CY } from '../dial/common.ts';
import { drawRoundMap, MAP_R } from '../dial/map.ts';
import { drawText } from '../draw.ts';
import { sportOf, type Ctx2D, type FrameState, type OverlayContext, type OverlayDefinition, type OverlayStyle } from '../types.ts';
import { convert, fmt } from '../units.ts';
import { lineIcon } from '../kit/icons.ts';
import { dialData, effectiveFrame, kitGadget, makeThemeFamily, type CompassData, type DialData, type SummaryRowData, type ThemeKit } from '../kit/kit.ts';
import { fitFont, profileAt, rideProfile, rrect, traceProfile, valueUnit } from '../kit/draw.ts';
import { metricRole } from '../kit/roles.ts';
import { drawGpsWatch, WATCH_H, WATCH_W } from './gpsWatch.ts';

// Minimal Pro: sports-watch faces. Matte black, white minute ticks, one signal-orange accent, big bold numbers.
// The faces are solid (a watch is not see-through); their darkness follows the "Background" opacity a little.

const ORANGE = '#ff5a1f';
const WHITE = '#ffffff';
const GREY = 'rgba(255,255,255,0.55)';
const SLUG = ['pro', 'pro', 'pro', 'pro', 'pro'] as const;

const solidText = (style: OverlayStyle): OverlayStyle => ({ ...style, outlineWidth: 0, shadow: false });
const faceAlpha = (style: OverlayStyle) => Math.max(0.72, Math.min(0.97, (style.panelOpacity ?? 0.8) + 0.12));

/** Bezel with 60 minute ticks and the black face. */
function watchCase(ctx: Ctx2D, cx: number, cy: number, R: number, style: OverlayStyle) {
  const a = faceAlpha(style);
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(24,25,28,${a})`;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  for (let k = 0; k < 60; k++) {
    const t = (k / 60) * Math.PI * 2 - Math.PI / 2;
    const major = k % 5 === 0;
    const r0 = R * (major ? 0.885 : 0.91);
    const r1 = R * 0.965;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(t) * r0, cy + Math.sin(t) * r0);
    ctx.lineTo(cx + Math.cos(t) * r1, cy + Math.sin(t) * r1);
    ctx.strokeStyle = major ? WHITE : GREY;
    ctx.lineWidth = major ? Math.max(1.6, R * 0.016) : Math.max(1, R * 0.008);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.79, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(9,9,11,${Math.min(1, a + 0.03)})`;
  ctx.fill();
}

/** Progress ring from 12 o'clock (signed values grow both ways from the top), or zone segments. */
function ring(ctx: Ctx2D, cx: number, cy: number, r: number, w: number, d: DialData) {
  ctx.lineCap = 'butt';
  if (d.zone) {
    const n = d.zone.colors.length;
    const gap = 0.05;
    const seg = (Math.PI * 2) / n;
    for (let k = 0; k < n; k++) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2 + k * seg + gap / 2, -Math.PI / 2 + (k + 1) * seg - gap / 2);
      ctx.strokeStyle = k === d.zone.index ? ORANGE : k < d.zone.index ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = w;
      ctx.stroke();
    }
    return;
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = w;
  ctx.stroke();
  if (!Number.isFinite(d.f)) return;
  const top = -Math.PI / 2;
  const a1 = top + Math.PI * 2 * (Math.max(0, Math.min(1, d.f)) - d.origin);
  if (Math.abs(a1 - top) < 0.003) return;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.min(top, a1), Math.max(top, a1));
  ctx.strokeStyle = ORANGE;
  ctx.lineWidth = w;
  ctx.stroke();
}

/** One watch face for a metric; R = radius (140 for the 300 px dial). */
function watchFace(ctx: Ctx2D, cx: number, cy: number, R: number, d: DialData, showSecondary: boolean) {
  const ts = solidText(d.style);
  const k = R / 140;
  watchCase(ctx, cx, cy, R, d.style);
  ring(ctx, cx, cy, R * 0.79 + 0.5 - 5 * k, 9 * k, d);
  if (d.style.showLabel) drawText(ctx, d.label.toLocaleUpperCase(d.style.language), cx, cy - 46 * k, ts, { size: 15 * k, weight: 700, align: 'center', tabular: false, color: WHITE });
  const size = fitFont(ctx, ts, d.template, 168 * k, 66 * k, 800);
  drawText(ctx, d.value, cx, cy + 20 * k, ts, { size, weight: 800, align: 'center', color: WHITE });
  if (d.unit) drawText(ctx, d.unit, cx, cy + 48 * k, ts, { size: 18 * k, weight: 600, align: 'center', tabular: false, color: GREY });
  const extra = d.zone && d.zone.index >= 0 ? `Z${d.zone.index + 1}` : showSecondary ? d.secondary : '';
  if (extra) drawText(ctx, extra, cx, cy + 74 * k, ts, { size: (d.zone ? 16 : 13) * k, weight: 700, align: 'center', tabular: true, color: d.zone ? ORANGE : GREY });
}

const DIAL = 300;

function dial(ctx: Ctx2D, d: DialData) {
  watchFace(ctx, DIAL / 2, DIAL / 2, 140, d, true);
}

// ---------------------------------------------------------------------------------------------
// Compass: a watch face whose bezel turns with the heading; orange index at the top, way back to the start.

const COMPASS = 300;

function compass(ctx: Ctx2D, c: CompassData) {
  const cx = COMPASS / 2;
  const cy = COMPASS / 2;
  const R = 140;
  const ts = solidText(c.style);
  const a = faceAlpha(c.style);
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(24,25,28,${a})`;
  ctx.fill();
  const rot = (-c.heading * Math.PI) / 180;
  for (let deg = 0; deg < 360; deg += 5) {
    const t = rot + (deg * Math.PI) / 180 - Math.PI / 2;
    const major = deg % 30 === 0;
    const r0 = R * (major ? 0.84 : 0.89);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(t) * r0, cy + Math.sin(t) * r0);
    ctx.lineTo(cx + Math.cos(t) * R * 0.95, cy + Math.sin(t) * R * 0.95);
    ctx.strokeStyle = major ? WHITE : GREY;
    ctx.lineWidth = major ? 2 : 1;
    ctx.stroke();
  }
  (['N', 'E', 'S', 'W'] as const).forEach((l, i) => {
    const t = rot + (i * Math.PI) / 2 - Math.PI / 2;
    drawText(ctx, l, cx + Math.cos(t) * R * 0.7, cy + Math.sin(t) * R * 0.7 + 7, ts, { size: 20, weight: 800, align: 'center', tabular: false, color: l === 'N' ? ORANGE : WHITE });
  });
  // Fixed orange index at the top: the direction of travel.
  ctx.beginPath();
  ctx.moveTo(cx, cy - R + 2);
  ctx.lineTo(cx - 9, cy - R - 12 + 26);
  ctx.lineTo(cx + 9, cy - R - 12 + 26);
  ctx.closePath();
  ctx.fillStyle = ORANGE;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(9,9,11,${Math.min(1, a + 0.03)})`;
  ctx.fill();
  drawText(ctx, c.before ? '—' : `${Math.round(c.heading) % 360}°`, cx + 6, cy + 14, ts, { size: 40, weight: 800, align: 'center', color: WHITE });
  drawText(ctx, c.cardinal, cx, cy + 40, ts, { size: 16, weight: 700, align: 'center', tabular: false, color: GREY });
  if (c.toStart) {
    // White dot on the ring towards the start, and the distance under the face.
    const t = ((c.toStart.bearing - c.heading) * Math.PI) / 180 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(t) * R * 0.58, cy + Math.sin(t) * R * 0.58, 6, 0, Math.PI * 2);
    ctx.fillStyle = WHITE;
    ctx.fill();
    drawText(ctx, `${tr(c.style.language, 'kit.start')} ${c.toStart.text}`, cx, cy - 34, ts, { size: 13, weight: 700, align: 'center', tabular: true, color: GREY });
  }
}

// ---------------------------------------------------------------------------------------------
// Map, profile, summary.

const MAP_SIZE = 320;
const MAP_O = (MAP_SIZE - CX * 2) / 2;

function map(ctx: Ctx2D, frame: FrameState, style: OverlayStyle, octx: OverlayContext) {
  const a = faceAlpha(style);
  ctx.save();
  ctx.translate(MAP_O, MAP_O);
  drawRoundMap(
    ctx,
    frame,
    { ...solidText(style), accentColor: ORANGE },
    octx,
    (c) => {
      c.beginPath();
      c.arc(CX, CY, MAP_R + 12, 0, Math.PI * 2);
      c.fillStyle = `rgba(24,25,28,${a})`;
      c.fill();
      for (let k = 0; k < 60; k++) {
        const t = (k / 60) * Math.PI * 2;
        const r0 = MAP_R + (k % 5 === 0 ? 3 : 6);
        c.beginPath();
        c.moveTo(CX + Math.cos(t) * r0, CY + Math.sin(t) * r0);
        c.lineTo(CX + Math.cos(t) * (MAP_R + 10), CY + Math.sin(t) * (MAP_R + 10));
        c.strokeStyle = k % 5 === 0 ? WHITE : GREY;
        c.lineWidth = k % 5 === 0 ? 1.8 : 1;
        c.stroke();
      }
    },
    {
      bg: [`rgba(9,9,11,${a})`, `rgba(9,9,11,${a})`],
      shade: 0,
      route: 'rgba(255,255,255,0.8)',
      routeUnder: 'rgba(0,0,0,0)',
      arrow: ORANGE,
      arrowGlow: 'rgba(0,0,0,0)',
      north: '#09090b',
      northRing: WHITE,
      northWidth: 1.5,
    },
  );
  ctx.restore();
}

const PROF_W = 640;
const PROF_H = 200;

function card(ctx: Ctx2D, w: number, h: number, style: OverlayStyle) {
  rrect(ctx, 4, 4, w - 8, h - 8, 18);
  ctx.fillStyle = `rgba(9,9,11,${faceAlpha(style)})`;
  ctx.fill();
}

/** White profile line, orange part ridden, orange dot; title and gain. */
function drawProfileLine(ctx: Ctx2D, frame: FrameState, style: OverlayStyle, ride: OverlayContext['ride'], x0: number, x1: number, y0: number, y1: number) {
  const pr = rideProfile(ride, style);
  const s = frame.sample;
  const before = beforeStart(ride, s);
  const X = (f: number) => x0 + f * (x1 - x0);
  const Y = (a: number) => y1 - ((a - pr.lo) / (pr.hi - pr.lo || 1)) * (y1 - y0);
  const cur = before ? 0 : Math.min(1, s.distance / pr.total);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (traceProfile(ctx, pr, X, Y, cur, 1)) {
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 2.4;
    ctx.stroke();
  }
  if (cur > 0) {
    ctx.beginPath();
    traceProfile(ctx, pr, X, Y, 0, cur);
    ctx.lineTo(X(cur), Y(profileAt(pr, cur)));
    ctx.strokeStyle = ORANGE;
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(X(cur), Y(profileAt(pr, cur)), 6, 0, Math.PI * 2);
    ctx.fillStyle = ORANGE;
    ctx.fill();
  }
}

function profile(ctx: Ctx2D, frame: FrameState, style: OverlayStyle, octx: OverlayContext) {
  const ts = solidText(style);
  card(ctx, PROF_W, PROF_H, style);
  const u = convert.elevationUnit(style.units);
  if (style.showLabel) drawText(ctx, tr(style.language, 'card.elevation'), 26, 40, ts, { size: 15, weight: 700, tabular: false, color: WHITE });
  valueUnit(ctx, fmt(convert.elevation(frame.textSample.altitude, style.units), 0), u, PROF_W - 26, 42, ts, { size: 26, weight: 800, unitSize: 15, align: 'right', color: WHITE, unitColor: GREY });
  drawProfileLine(ctx, frame, style, octx.ride, 26, PROF_W - 26, 66, PROF_H - 26);
}

const SUM_W = 400;
const SUM_H = 250;

function summary(ctx: Ctx2D, rows: SummaryRowData[], style: OverlayStyle) {
  const ts = solidText(style);
  card(ctx, SUM_W, SUM_H, style);
  const rowH = (SUM_H - 32) / 4;
  rows.forEach((r, i) => {
    const y = 16 + i * rowH;
    if (i > 0) {
      ctx.beginPath();
      ctx.moveTo(24, y);
      ctx.lineTo(SUM_W - 24, y);
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    const mid = y + rowH / 2;
    lineIcon(ctx, r.icon, 44, mid, 26, ORANGE);
    drawText(ctx, r.label, 74, mid + 5, ts, { size: 13, weight: 700, tabular: false, color: GREY });
    valueUnit(ctx, r.value, r.unit, SUM_W - 26, mid + 11, ts, { size: 30, weight: 800, unitSize: 14, align: 'right', color: WHITE, unitColor: GREY });
  });
}

// ---------------------------------------------------------------------------------------------
// Extras: the watch (main pace dial with two sub-dials) and the bottom data bar.

const g = (spec: Parameters<typeof kitGadget>[2]) => kitGadget('minimal', SLUG, spec);

const watch = g({
  role: 'watch',
  name: 'kit.watch',
  slug: 'watch',
  requires: 'speed',
  size: { width: 600, height: 400 },
  draw: (ctx, frame, style, octx) => {
    const ride = octx.ride;
    const f = effectiveFrame(frame, style);
    const sport = sportOf(style, ride);
    const running = sport === 'running' || sport === 'hiking';
    const main = metricRole(running ? 'pace' : 'speed');
    watchFace(ctx, 200, 200, 190, dialData(main, f, style, ride), true);
    const subs = [running ? 'steps' : 'cadence', 'heartRate', 'altitude', 'distance']
      .map((r) => metricRole(r))
      .filter((r) => ride.available.has(r.requires))
      .slice(0, 2);
    subs.forEach((r, i) => watchFace(ctx, 498, 104 + i * 194, 92, dialData(r, f, style, ride), false));
  },
});

const dataBar = g({
  role: 'dataBar',
  name: 'kit.dataBar',
  slug: 'data-bar',
  requires: 'elapsedTime',
  placement: 'bottom',
  size: { width: 1500, height: 130 },
  draw: (ctx, frame, style, octx) => {
    const ride = octx.ride;
    const f = effectiveFrame(frame, style);
    const ts = solidText(style);
    const s = f.textSample;
    const before = beforeStart(ride, s);
    card(ctx, 1500, 130, style);
    const L = (k: Parameters<typeof tr>[1]) => tr(style.language, k).toLocaleUpperCase(style.language);
    const u = convert.elevationUnit(style.units);
    let x = 34;
    const col = (label: string, value: string, unit: string, w: number) => {
      drawText(ctx, label, x, 50, ts, { size: 15, weight: 700, tabular: false, color: GREY });
      valueUnit(ctx, value, unit, x, 100, ts, { size: 40, weight: 800, unitSize: 18, color: WHITE, unitColor: GREY });
      x += w;
    };
    if (ride.available.has('altitude')) {
      col(L('card.elevation'), fmt(convert.elevation(s.altitude, style.units), 0), u, 220);
      drawProfileLine(ctx, f, style, ride, x, x + 520, 34, 106);
      x += 560;
      col(L('summary.gain'), `+${fmt(convert.elevation(before ? NaN : s.elevationGain, style.units), 0)}`, u, 220);
    }
    if (ride.available.has('distance')) col(L('metric.distance'), fmt(convert.distance(s.distance, style.units), 1), convert.distanceUnit(style.units), 230);
    col(L('metric.elapsedTime'), formatDuration(before ? 0 : s.elapsedMs), '', 220);
  },
});

/** GPS sports watch with 3 or 4 configurable fields (now, average, lap or maximum). */
const gpsWatch = g({
  role: 'gpsWatch',
  name: 'kit.gpsWatch',
  slug: 'gps-watch',
  requires: 'elapsedTime',
  textOnly: true,
  size: { width: WATCH_W, height: WATCH_H },
  draw: drawGpsWatch,
});

export const minimalKit: ThemeKit = {
  id: 'minimal',
  slug: SLUG,
  dialSize: { width: DIAL, height: DIAL },
  dial,
  mapSize: { width: MAP_SIZE, height: MAP_SIZE },
  map,
  profileSize: { width: PROF_W, height: PROF_H },
  profile,
  summarySize: { width: SUM_W, height: SUM_H },
  summary,
  compassSize: { width: COMPASS, height: COMPASS },
  compass,
  extras: [gpsWatch, watch, dataBar],
};

export const minimalFamily: OverlayDefinition[] = makeThemeFamily(minimalKit);
