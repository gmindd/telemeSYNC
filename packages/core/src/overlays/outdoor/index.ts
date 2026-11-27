import { tr } from '../../i18n/index.ts';
import { beforeStart } from '../dial/dials.ts';
import { CX, CY } from '../dial/common.ts';
import { drawRoundMap, MAP_R } from '../dial/map.ts';
import { drawText } from '../draw.ts';
import type { Ctx2D, CanvasGradientLike, FrameState, OverlayContext, OverlayDefinition, OverlayStyle } from '../types.ts';
import { convert, fmt } from '../units.ts';
import { lineIcon } from '../kit/icons.ts';
import { niceStep } from '../panel/series.ts';
import { effectiveFrame, kitGadget, makeThemeFamily, type CompassData, type DialData, type SummaryRowData, type ThemeKit } from '../kit/kit.ts';
import { fitFont, noShadow, profileAt, rideProfile, rrect, spaced, traceProfile, valueUnit } from '../kit/draw.ts';

// Outdoor / Adventure: expedition gear. Brass bezels, olive faces, cream paper with contour lines, leather and
// stitching, a safety-orange needle, road signs and trail markers. For mountain bike, gravel and hiking.

const CREAM = '#f1e6c8';
const PAPER = '#e9dcbc';
const INK = '#2b2620';
const OLIVE = '#3f4a26';
const ORANGE = '#e8622c';
const RED = '#c0392b';
const SLUG = ['outdoor', 'outdoor', 'outdoor', 'outdoor', 'outdoor'] as const;

const solid = (style: OverlayStyle): OverlayStyle => ({ ...style, outlineWidth: 0, shadow: false });
const lifted = (style: OverlayStyle): OverlayStyle => ({ ...style, outlineWidth: 0, shadow: true });

function brassGradient(ctx: Ctx2D, x0: number, y0: number, x1: number, y1: number): CanvasGradientLike {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#f3d98b');
  g.addColorStop(0.35, '#b8893b');
  g.addColorStop(0.6, '#e8c46a');
  g.addColorStop(1, '#6e4f1c');
  return g;
}

/** Brass ring (outer radius R, width w) with a soft drop shadow and small screws. */
function brassRing(ctx: Ctx2D, cx: number, cy: number, R: number, w: number, screws = true) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = brassGradient(ctx, cx - R, cy - R, cx + R, cy + R);
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, R - w, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(60,40,10,0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();
  if (!screws) return;
  for (const t of [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) {
    const x = cx + Math.cos(t) * (R - w / 2);
    const y = cy + Math.sin(t) * (R - w / 2);
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = '#5a4116';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 2.4, y);
    ctx.lineTo(x + 2.4, y);
    ctx.strokeStyle = '#e8c46a';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/** Stitched border: dashed line inset from a rounded rectangle. */
function stitches(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number, color: string) {
  rrect(ctx, x, y, w, h, r);
  ctx.setLineDash?.([7, 5]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.setLineDash?.([]);
}

/** Faint contour lines over a box (kraft-paper texture). */
function contours(ctx: Ctx2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let k = 0; k < 9; k++) {
    ctx.beginPath();
    ctx.ellipse(x + w * 0.62, y + h * 0.42, 30 + k * 34, 18 + k * 21, 0.3, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Dial: a brass altimeter with an orange needle and a cream value window.

const DIAL = 300;
const A0 = Math.PI * 0.75;
const SWEEP = Math.PI * 1.5;

function dial(ctx: Ctx2D, d: DialData) {
  const c = DIAL / 2;
  const ts = solid(d.style);
  brassRing(ctx, c, c, 140, 16);
  const face = ctx.createRadialGradient(c - 30, c - 40, 10, c, c, 124);
  face.addColorStop(0, '#59653a');
  face.addColorStop(1, '#262c17');
  ctx.beginPath();
  ctx.arc(c, c, 124, 0, Math.PI * 2);
  ctx.fillStyle = face;
  ctx.fill();
  // Scale ticks over the 270° sweep.
  for (let k = 0; k <= 30; k++) {
    const t = A0 + (SWEEP * k) / 30;
    const major = k % 5 === 0;
    const r0 = major ? 100 : 108;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(t) * r0, c + Math.sin(t) * r0);
    ctx.lineTo(c + Math.cos(t) * 118, c + Math.sin(t) * 118);
    ctx.strokeStyle = CREAM;
    ctx.lineWidth = major ? 3 : 1.4;
    ctx.stroke();
  }
  // Value window.
  rrect(ctx, c - 76, c + 18, 152, 52, 8);
  ctx.fillStyle = CREAM;
  ctx.fill();
  ctx.strokeStyle = '#6e4f1c';
  ctx.lineWidth = 2;
  ctx.stroke();
  const size = fitFont(ctx, ts, d.template, 108 - d.unit.length * 9, 40, 800);
  valueUnit(ctx, d.value, d.unit, c, c + 58, ts, { size, weight: 800, unitSize: 15, unitWeight: 700, align: 'center', color: INK, unitColor: '#5a4a32' });
  const extra = d.zone && d.zone.index >= 0 ? tr(d.style.language, 'dial.zone', { n: d.zone.index + 1 }) : d.secondary;
  if (extra) drawText(ctx, extra, c, c + 94, ts, { size: 13, weight: 700, align: 'center', tabular: true, color: CREAM });
  // Needle with a counterweight, over everything but the cap.
  if (Number.isFinite(d.f)) {
    const t = A0 + SWEEP * Math.max(0, Math.min(1, d.f));
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(t);
    ctx.beginPath();
    ctx.moveTo(-26, -4);
    ctx.lineTo(104, -1.6);
    ctx.lineTo(112, 0);
    ctx.lineTo(104, 1.6);
    ctx.lineTo(-26, 4);
    ctx.closePath();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = ORANGE;
    ctx.fill();
    ctx.restore();
    noShadow(ctx);
  }
  ctx.beginPath();
  ctx.arc(c, c, 9, 0, Math.PI * 2);
  ctx.fillStyle = brassGradient(ctx, c - 9, c - 9, c + 9, c + 9);
  ctx.fill();
  // Label last, over the needle, with a soft shadow so it stays readable.
  if (d.style.showLabel) spaced(ctx, d.label, c, c - 44, lifted(d.style), { size: 13, weight: 800, align: 'center', color: CREAM, maxW: 150 });
}

// ---------------------------------------------------------------------------------------------
// Compass: a classic brass compass whose rose points north.

const COMPASS = 320;

function compass(ctx: Ctx2D, c: CompassData) {
  const cx = COMPASS / 2;
  const cy = COMPASS / 2;
  const ts = solid(c.style);
  brassRing(ctx, cx, cy, 142, 16, false);
  ctx.beginPath();
  ctx.arc(cx, cy, 126, 0, Math.PI * 2);
  ctx.fillStyle = PAPER;
  ctx.fill();
  contours(ctx, cx - 126, cy - 126, 252, 252, 'rgba(120,95,55,0.18)');
  const rot = (-c.heading * Math.PI) / 180;
  for (let deg = 0; deg < 360; deg += 10) {
    const t = rot + (deg * Math.PI) / 180 - Math.PI / 2;
    const major = deg % 30 === 0;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(t) * (major ? 104 : 110), cy + Math.sin(t) * (major ? 104 : 110));
    ctx.lineTo(cx + Math.cos(t) * 120, cy + Math.sin(t) * 120);
    ctx.strokeStyle = INK;
    ctx.lineWidth = major ? 2.2 : 1;
    ctx.stroke();
  }
  (['N', 'E', 'S', 'W'] as const).forEach((l, i) => {
    const t = rot + (i * Math.PI) / 2 - Math.PI / 2;
    drawText(ctx, l, cx + Math.cos(t) * 88, cy + Math.sin(t) * 88 + 8, ts, { size: 22, weight: 800, align: 'center', tabular: false, color: l === 'N' ? RED : INK });
  });
  // Eight-point rose; the north needle red.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  for (let k = 0; k < 8; k++) {
    const long = k % 2 === 0;
    const t = (k * Math.PI) / 4;
    const L = long ? 70 : 40;
    ctx.save();
    ctx.rotate(t);
    ctx.beginPath();
    ctx.moveTo(0, -L);
    ctx.lineTo(8, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fillStyle = k === 0 ? RED : '#8a7350';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -L);
    ctx.lineTo(-8, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fillStyle = k === 0 ? '#e0574a' : '#c7b089';
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  // Lubber line (direction of travel) and the heading window.
  ctx.beginPath();
  ctx.moveTo(cx, cy - 126);
  ctx.lineTo(cx - 8, cy - 140);
  ctx.lineTo(cx + 8, cy - 140);
  ctx.closePath();
  ctx.fillStyle = ORANGE;
  ctx.fill();
  rrect(ctx, cx - 54, cy + 30, 108, 38, 6);
  ctx.fillStyle = OLIVE;
  ctx.fill();
  drawText(ctx, c.before ? '—' : `${Math.round(c.heading) % 360}° ${c.cardinal}`, cx, cy + 57, ts, { size: 20, weight: 800, align: 'center', color: CREAM });
  if (c.toStart) {
    const t = ((c.toStart.bearing - c.heading) * Math.PI) / 180 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(t) * 112, cy + Math.sin(t) * 112, 6, 0, Math.PI * 2);
    ctx.fillStyle = ORANGE;
    ctx.fill();
    drawText(ctx, `${tr(c.style.language, 'kit.start')} ${c.toStart.text}`, cx, cy - 26, ts, { size: 12, weight: 800, align: 'center', tabular: true, color: INK });
  }
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fillStyle = brassGradient(ctx, cx - 7, cy - 7, cx + 7, cy + 7);
  ctx.fill();
}

// ---------------------------------------------------------------------------------------------
// Map: a field map on paper inside a brass housing.

const MAP_SIZE = 330;
const MAP_O = (MAP_SIZE - CX * 2) / 2;

function map(ctx: Ctx2D, frame: FrameState, style: OverlayStyle, octx: OverlayContext) {
  ctx.save();
  ctx.translate(MAP_O, MAP_O);
  drawRoundMap(
    ctx,
    frame,
    { ...solid(style), accentColor: ORANGE },
    octx,
    (c) => brassRing(c, CX, CY, MAP_R + 14, 14),
    {
      bg: ['#efe3c4', '#d9c79c'],
      shade: 0.12,
      route: 'rgba(70,55,30,0.55)',
      routeUnder: 'rgba(0,0,0,0)',
      arrow: RED,
      arrowGlow: 'rgba(0,0,0,0.3)',
      north: OLIVE,
      northRing: '#e8c46a',
      northWidth: 2,
    },
  );
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Profile: a survey chart on graph paper with a red pin.

const PROF_W = 680;
const PROF_H = 230;

function paperCard(ctx: Ctx2D, x: number, y: number, w: number, h: number) {
  ctx.save();
  rrect(ctx, x, y, w, h, 10);
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.restore();
  stitches(ctx, x + 7, y + 7, w - 14, h - 14, 6, 'rgba(90,70,40,0.55)');
}

/** Map pin at (x, y) = its point. */
function pin(ctx: Ctx2D, x: number, y: number) {
  ctx.beginPath();
  ctx.arc(x, y - 22, 10, Math.PI * 0.82, Math.PI * 2.18);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fillStyle = RED;
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;
  ctx.fill();
  noShadow(ctx);
  ctx.beginPath();
  ctx.arc(x, y - 22, 4, 0, Math.PI * 2);
  ctx.fillStyle = CREAM;
  ctx.fill();
}

function profile(ctx: Ctx2D, frame: FrameState, style: OverlayStyle, octx: OverlayContext) {
  const ride = octx.ride;
  const ts = solid(style);
  paperCard(ctx, 10, 10, PROF_W - 20, PROF_H - 20);
  const x0 = 70;
  const x1 = PROF_W - 34;
  const y0 = 64;
  const y1 = PROF_H - 44;
  // Graph paper.
  ctx.beginPath();
  for (let x = x0; x <= x1; x += 16) {
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
  }
  for (let y = y0; y <= y1; y += 16) {
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
  }
  ctx.strokeStyle = 'rgba(120,95,55,0.18)';
  ctx.lineWidth = 1;
  ctx.stroke();
  const pr = rideProfile(ride, style);
  const s = frame.sample;
  const before = beforeStart(ride, s);
  const X = (f: number) => x0 + f * (x1 - x0);
  const Y = (a: number) => y1 - ((a - pr.lo) / (pr.hi - pr.lo || 1)) * (y1 - y0);
  const cur = before ? 0 : Math.min(1, s.distance / pr.total);
  ctx.beginPath();
  traceProfile(ctx, pr, X, Y);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x0, y1);
  ctx.closePath();
  ctx.fillStyle = 'rgba(170,140,90,0.35)';
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.beginPath();
  traceProfile(ctx, pr, X, Y);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  if (cur > 0) {
    ctx.beginPath();
    traceProfile(ctx, pr, X, Y, 0, cur);
    ctx.lineTo(X(cur), Y(profileAt(pr, cur)));
    ctx.strokeStyle = ORANGE;
    ctx.lineWidth = 3.4;
    ctx.stroke();
    pin(ctx, X(cur), Y(profileAt(pr, cur)));
  }
  const u = convert.elevationUnit(style.units);
  if (style.showLabel) spaced(ctx, tr(style.language, 'card.altitude'), 34, 44, ts, { size: 14, weight: 800, color: INK });
  drawText(ctx, `${fmt(convert.elevation(frame.textSample.altitude, style.units), 0)} ${u}`, x1, 46, ts, { size: 22, weight: 800, align: 'right', color: INK });
  const step = niceStep((pr.hi - pr.lo) / 3);
  for (let a = Math.ceil(pr.lo / step) * step; a <= pr.hi; a += step) drawText(ctx, fmt(a, 0), x0 - 8, Y(a) + 5, ts, { size: 12, weight: 700, align: 'right', color: '#5a4a32' });
  const du = convert.distanceUnit(style.units);
  drawText(ctx, `${fmt(convert.distance(pr.total, style.units), 1)} ${du}`, x1, PROF_H - 24, ts, { size: 12, weight: 700, align: 'right', color: '#5a4a32' });
}

// ---------------------------------------------------------------------------------------------
// Summary: an olive canvas patch with stitching.

const SUM_W = 420;
const SUM_H = 270;

function summary(ctx: Ctx2D, rows: SummaryRowData[], style: OverlayStyle) {
  const ts = solid(style);
  ctx.save();
  rrect(ctx, 10, 10, SUM_W - 20, SUM_H - 20, 16);
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = OLIVE;
  ctx.globalAlpha = Math.max(0.8, Math.min(1, (style.panelOpacity ?? 0.8) + 0.15));
  ctx.fill();
  ctx.restore();
  stitches(ctx, 18, 18, SUM_W - 36, SUM_H - 36, 10, 'rgba(241,230,200,0.7)');
  const rowH = (SUM_H - 60) / 4;
  rows.forEach((r, i) => {
    const mid = 30 + i * rowH + rowH / 2;
    lineIcon(ctx, r.icon, 50, mid, 24, CREAM);
    spaced(ctx, r.label, 78, mid + 5, ts, { size: 11, weight: 800, color: 'rgba(241,230,200,0.75)', maxW: 140 });
    valueUnit(ctx, r.value, r.unit, SUM_W - 34, mid + 11, ts, { size: 28, weight: 800, unitSize: 14, align: 'right', color: CREAM, unitColor: 'rgba(241,230,200,0.75)' });
  });
}

// ---------------------------------------------------------------------------------------------
// Extras: the grade road sign and the trail marker post.

/** Room around every gadget for the glows and shadows, so the video never shows them cut off. */
const PAD = 14;
const g = (spec: Parameters<typeof kitGadget>[2]) => kitGadget('outdoor', SLUG, { ...spec, pad: PAD });

const gradeSign = g({
  role: 'gradeSign',
  name: 'kit.gradeSign',
  slug: 'grade-sign',
  requires: 'grade',
  size: { width: 260, height: 260 },
  draw: (ctx, frame, style, octx) => {
    const s = effectiveFrame(frame, style).textSample;
    const ts = solid(style);
    const c = 130;
    const r = 112;
    const diamond = (k: number) => {
      ctx.beginPath();
      ctx.moveTo(c, c - k);
      ctx.lineTo(c + k, c);
      ctx.lineTo(c, c + k);
      ctx.lineTo(c - k, c);
      ctx.closePath();
    };
    ctx.save();
    diamond(r);
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.restore();
    diamond(r - 7);
    ctx.fillStyle = ORANGE;
    ctx.fill();
    diamond(r - 14);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.stroke();
    for (const [x, y] of [[c, c - r + 22], [c, c + r - 22]]) {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#9aa0a6';
      ctx.fill();
    }
    const v = beforeStart(octx.ride, s) || !Number.isFinite(s.grade) ? '—' : `${s.grade > 0 ? '+' : ''}${fmt(s.grade, 0)}`;
    valueUnit(ctx, v, '%', c, c + 14, ts, { size: 52, weight: 800, unitSize: 26, unitWeight: 800, align: 'center', color: INK });
    spaced(ctx, tr(style.language, 'metric.grade'), c, c + 46, ts, { size: 12, weight: 800, align: 'center', color: INK, maxW: 110 });
  },
});

const trailPost = g({
  role: 'trailPost',
  name: 'kit.trailPost',
  slug: 'trail-post',
  requires: 'distance',
  textOnly: true,
  size: { width: 240, height: 420 },
  draw: (ctx, frame, style, octx) => {
    const s = frame.textSample;
    const ts = lifted(style);
    // Weathered wooden post.
    const wood = ctx.createLinearGradient(80, 0, 160, 0);
    wood.addColorStop(0, '#5b4630');
    wood.addColorStop(0.5, '#8a6d4b');
    wood.addColorStop(1, '#4a3826');
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    rrect(ctx, 84, 40, 72, 370, 6);
    ctx.fillStyle = wood;
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(40,28,16,0.45)';
    ctx.lineWidth = 1;
    for (let k = 0; k < 6; k++) {
      ctx.beginPath();
      ctx.moveTo(94 + k * 11, 48);
      ctx.bezierCurveTo(98 + k * 11, 160, 90 + k * 11, 280, 96 + k * 11, 402);
      ctx.stroke();
    }
    // Arrow sign at the top.
    ctx.beginPath();
    ctx.moveTo(40, 64);
    ctx.lineTo(176, 64);
    ctx.lineTo(206, 92);
    ctx.lineTo(176, 120);
    ctx.lineTo(40, 120);
    ctx.closePath();
    ctx.fillStyle = OLIVE;
    ctx.fill();
    ctx.strokeStyle = CREAM;
    ctx.lineWidth = 2;
    ctx.stroke();
    const km = convert.distance(s.distance, style.units);
    drawText(ctx, beforeStart(octx.ride, s) ? '0' : fmt(km, 1), 112, 104, ts, { size: 30, weight: 800, align: 'center', color: CREAM });
    // Stencilled unit and the total down the post.
    drawText(ctx, convert.distanceUnit(style.units).toUpperCase(), 120, 166, ts, { size: 26, weight: 800, align: 'center', tabular: false, color: CREAM });
    drawText(ctx, tr(style.language, 'dial.total'), 120, 330, ts, { size: 13, weight: 800, align: 'center', tabular: false, color: 'rgba(241,230,200,0.85)' });
    drawText(ctx, fmt(convert.distance(octx.ride.totals.distanceM, style.units), 1), 120, 360, ts, { size: 22, weight: 800, align: 'center', color: CREAM });
  },
});

export const outdoorKit: ThemeKit = {
  id: 'outdoor',
  slug: SLUG,
  pad: PAD,
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
  extras: [gradeSign, trailPost],
};

export const outdoorFamily: OverlayDefinition[] = makeThemeFamily(outdoorKit);
