import type { RideData, RideSample } from '../../telemetry/ride.ts';
import { tr } from '../../i18n/index.ts';
import { beforeStart } from '../dial/dials.ts';
import { drawRoundMap, MAP_R } from '../dial/map.ts';
import { CX, CY } from '../dial/common.ts';
import { drawText, font } from '../draw.ts';
import { withAlpha } from '../panel/paint.ts';
import { niceStep } from '../panel/series.ts';
import type { Ctx2D, FrameState, OverlayContext, OverlayDefinition, OverlayStyle } from '../types.ts';
import { convert, fmt } from '../units.ts';
import { compassData, effectiveFrame, kitGadget, makeThemeFamily, type CompassData, type DialData, type SummaryRowData, type ThemeKit } from '../kit/kit.ts';
import { fitFont, line, noShadow, profileAt, rideProfile, spaced, traceProfile } from '../kit/draw.ts';

// Aviation HUD: everything in thin phosphor-green lines and text, like a fighter jet's head-up display, with a
// faint dark under-stroke so it still reads over a bright sky. Amber marks a caution (steep grade, top zone).

const GREEN = '#5dff8a';
const AMBER = '#ffb020';
const SLUG = ['hud', 'hud', 'hud', 'hud', 'hud'] as const;

/** Text style of the HUD: green, thin dark outline, no soft shadow. */
const hudText = (style: OverlayStyle, color = GREEN): OverlayStyle => ({ ...style, textColor: color, outlineWidth: 1.2, outlineColor: 'rgba(0,0,0,0.5)', shadow: false });

/** Strokes the current path green with a glow, over a faint dark line for contrast. */
function glowStroke(ctx: Ctx2D, color: string, w: number, dash?: number[]) {
  ctx.setLineDash?.(dash ?? []);
  ctx.strokeStyle = 'rgba(0,0,0,0.32)';
  ctx.lineWidth = w + 2.4;
  ctx.stroke();
  ctx.shadowColor = withAlpha(color, 0.85);
  ctx.shadowBlur = 6;
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
  noShadow(ctx);
  ctx.setLineDash?.([]);
}

/** Corner brackets around a box (the HUD's frames are open). */
function brackets(ctx: Ctx2D, x: number, y: number, w: number, h: number, len: number, color: string) {
  ctx.beginPath();
  ctx.moveTo(x, y + len);
  ctx.lineTo(x, y);
  ctx.lineTo(x + len, y);
  ctx.moveTo(x + w - len, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + len);
  ctx.moveTo(x + w, y + h - len);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w - len, y + h);
  ctx.moveTo(x + len, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + h - len);
  glowStroke(ctx, color, 1.6);
}

/** Box with a pointed side (the current-value box of a tape). */
function caretBox(ctx: Ctx2D, x: number, y: number, w: number, h: number, point: 'left' | 'right' | 'down' | 'none', color: string) {
  const p = 10;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  if (point === 'right') {
    ctx.lineTo(x + w, y + h / 2 - 7);
    ctx.lineTo(x + w + p, y + h / 2);
    ctx.lineTo(x + w, y + h / 2 + 7);
  }
  ctx.lineTo(x + w, y + h);
  if (point === 'down') {
    ctx.lineTo(x + w / 2 + 7, y + h);
    ctx.lineTo(x + w / 2, y + h + p);
    ctx.lineTo(x + w / 2 - 7, y + h);
  }
  ctx.lineTo(x, y + h);
  if (point === 'left') {
    ctx.lineTo(x, y + h / 2 + 7);
    ctx.lineTo(x - p, y + h / 2);
    ctx.lineTo(x, y + h / 2 - 7);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,14,4,0.35)';
  ctx.fill();
  glowStroke(ctx, color, 1.6);
}

/** Caution colour for a dial: top zone, steep grade or slope. */
function cautionOf(d: DialData): boolean {
  if (d.zone && d.zone.index >= d.zone.colors.length - 1 && d.zone.index >= 0) return true;
  if (d.role === 'grade') return Math.abs(d.textSample.grade) >= 15;
  if (d.role === 'slope') return Math.abs(Math.atan(d.textSample.grade / 100) * 57.3) >= 30;
  return false;
}

// ---------------------------------------------------------------------------------------------
// Dial: a boxed readout with a mini scale.

const DIAL_W = 300;
const DIAL_H = 150;

function dial(ctx: Ctx2D, d: DialData) {
  const color = cautionOf(d) ? AMBER : GREEN;
  const ts = hudText(d.style, color);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (d.style.showLabel) spaced(ctx, d.label, 16, 30, ts, { size: 13, weight: 600, color, spacing: 0.16, maxW: 150 });
  if (d.secondary) drawText(ctx, d.secondary, DIAL_W - 16, 30, ts, { size: 12, weight: 600, align: 'right', tabular: true, color: withAlpha(color, 0.8) });
  caretBox(ctx, 16, 42, 206, 60, 'right', color);
  const size = fitFont(ctx, ts, d.template, 178, 44, 600);
  drawText(ctx, d.value, 119, 88, ts, { size, weight: 600, align: 'center', color });
  if (d.unit) drawText(ctx, d.unit, 240, 80, ts, { size: 18, weight: 600, tabular: false, color });
  if (d.zone && d.zone.index >= 0) drawText(ctx, `Z${d.zone.index + 1}`, 240, 102, ts, { size: 15, weight: 700, tabular: false, color });
  // Mini scale with a caret at the value.
  const x0 = 16;
  const x1 = DIAL_W - 16;
  const y = 128;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  for (let k = 0; k <= 10; k++) {
    const x = x0 + ((x1 - x0) * k) / 10;
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + (k % 5 === 0 ? 8 : 4));
  }
  if (d.origin > 0.01) {
    const ox = x0 + (x1 - x0) * d.origin;
    ctx.moveTo(ox, y - 6);
    ctx.lineTo(ox, y + 12);
  }
  glowStroke(ctx, color, 1.3);
  if (Number.isFinite(d.f)) {
    const x = x0 + (x1 - x0) * Math.max(0, Math.min(1, d.f));
    ctx.beginPath();
    ctx.moveTo(x, y - 2);
    ctx.lineTo(x - 6, y - 12);
    ctx.lineTo(x + 6, y - 12);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.fill();
    noShadow(ctx);
  }
}

// ---------------------------------------------------------------------------------------------
// Compass: heading tape with the boxed heading, and the way back to the start.

const COMPASS_W = 540;
const COMPASS_H = 150;

function headingTape(ctx: Ctx2D, c: CompassData, cx: number, y: number, width: number, style: OverlayStyle) {
  const ts = hudText(style);
  const span = 50; // degrees each side
  const k = width / 2 / span;
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - width / 2 - 2, y - 40, width + 4, 80);
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(cx - width / 2, y);
  ctx.lineTo(cx + width / 2, y);
  const h = c.heading;
  const first = Math.ceil((h - span) / 5) * 5;
  const labels: { x: number; text: string }[] = [];
  for (let a = first; a <= h + span; a += 5) {
    const x = cx + (a - h) * k;
    const major = a % 10 === 0;
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + (major ? 12 : 6));
    if (major) {
      const deg = ((a % 360) + 360) % 360;
      const card = deg % 90 === 0 ? ['N', 'E', 'S', 'W'][deg / 90] : '';
      labels.push({ x, text: card || String(deg).padStart(3, '0') });
    }
  }
  glowStroke(ctx, GREEN, 1.4);
  for (const l of labels) {
    if (Math.abs(l.x - cx) < 34) continue; // under the heading box
    drawText(ctx, l.text, l.x, y + 32, ts, { size: 16, weight: 600, align: 'center', tabular: true });
  }
  ctx.restore();
  // Boxed heading with a caret pointing at the tape.
  caretBox(ctx, cx - 34, y - 42, 68, 30, 'down', GREEN);
  drawText(ctx, c.before ? '---' : String(Math.round(h) % 360).padStart(3, '0'), cx, y - 20, ts, { size: 20, weight: 700, align: 'center' });
}

/** Small arrow pointing at `deg` relative to the direction of travel (0 = straight ahead). */
function relArrow(ctx: Ctx2D, x: number, y: number, deg: number, s: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(s * 0.6, s * 0.6);
  ctx.lineTo(0, s * 0.25);
  ctx.lineTo(-s * 0.6, s * 0.6);
  ctx.closePath();
  glowStroke(ctx, color, 1.5);
  ctx.restore();
}

function backToStart(ctx: Ctx2D, c: CompassData, x: number, y: number, align: 'left' | 'center') {
  if (!c.toStart) return;
  const ts = hudText(c.style);
  const text = `${tr(c.style.language, 'kit.start')} ${c.toStart.text}`;
  ctx.font = font(ts, 16, 600);
  const w = ctx.measureText(text).width + 30;
  const left = align === 'center' ? x - w / 2 : x;
  relArrow(ctx, left + 9, y - 6, c.toStart.bearing - c.heading, 9, GREEN);
  drawText(ctx, text, left + 26, y, ts, { size: 16, weight: 600, tabular: true });
}

function compass(ctx: Ctx2D, c: CompassData) {
  ctx.lineJoin = 'round';
  headingTape(ctx, c, COMPASS_W / 2, 70, COMPASS_W - 40, c.style);
  const ts = hudText(c.style);
  drawText(ctx, `${tr(c.style.language, 'kit.heading')} ${c.cardinal}`, 20, 136, ts, { size: 15, weight: 600, tabular: false });
  if (c.toStart) {
    const text = `${tr(c.style.language, 'kit.start')} ${c.toStart.text}`;
    ctx.font = font(ts, 16, 600);
    backToStart(ctx, c, COMPASS_W - 20 - ctx.measureText(text).width - 30, 136, 'left');
  }
}

// ---------------------------------------------------------------------------------------------
// Map: a radar scope around the rotating minimap.

const MAP_SIZE = 330;
const MAP_O = (MAP_SIZE - CX * 2) / 2;

function map(ctx: Ctx2D, frame: FrameState, style: OverlayStyle, octx: OverlayContext) {
  ctx.save();
  ctx.translate(MAP_O, MAP_O);
  drawRoundMap(
    ctx,
    frame,
    { ...hudText(style), accentColor: GREEN },
    octx,
    (c) => {
      c.beginPath();
      c.arc(CX, CY, MAP_R + 8, 0, Math.PI * 2);
      glowStroke(c, GREEN, 1.6);
      c.beginPath();
      for (let a = 0; a < 360; a += 10) {
        const r0 = MAP_R + 8;
        const r1 = r0 + (a % 30 === 0 ? 10 : 5);
        const t = (a * Math.PI) / 180;
        c.moveTo(CX + Math.cos(t) * r0, CY + Math.sin(t) * r0);
        c.lineTo(CX + Math.cos(t) * r1, CY + Math.sin(t) * r1);
      }
      glowStroke(c, GREEN, 1.2);
    },
    {
      bg: ['rgba(0,30,10,0.16)', 'rgba(0,30,10,0.42)'],
      shade: 0.12,
      route: withAlpha(GREEN, 0.4),
      routeUnder: 'rgba(0,0,0,0.25)',
      arrow: GREEN,
      arrowGlow: withAlpha(GREEN, 0.9),
      north: 'rgba(0,20,6,0.7)',
      northRing: GREEN,
      northWidth: 1.4,
    },
  );
  // Range rings over the map.
  for (const r of [MAP_R / 3, (MAP_R * 2) / 3]) {
    ctx.beginPath();
    ctx.arc(CX, CY, r, 0, Math.PI * 2);
    ctx.strokeStyle = withAlpha(GREEN, 0.22);
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Profile: a terrain-following radar line in corner brackets.

const PROF_W = 660;
const PROF_H = 220;

function profile(ctx: Ctx2D, frame: FrameState, style: OverlayStyle, octx: OverlayContext) {
  const ride = octx.ride;
  const ts = hudText(style);
  const pr = rideProfile(ride, style);
  const s = frame.sample;
  const before = beforeStart(ride, s);
  const x0 = 70;
  const x1 = PROF_W - 30;
  const y0 = 64;
  const y1 = PROF_H - 40;
  const X = (f: number) => x0 + f * (x1 - x0);
  const Y = (a: number) => y1 - ((a - pr.lo) / (pr.hi - pr.lo || 1)) * (y1 - y0);
  brackets(ctx, 12, 12, PROF_W - 24, PROF_H - 24, 26, GREEN);
  const u = convert.elevationUnit(style.units);
  if (style.showLabel) spaced(ctx, tr(style.language, 'card.altitude'), 34, 44, ts, { size: 13, weight: 600, color: GREEN });
  drawText(ctx, `${fmt(convert.elevation(frame.textSample.altitude, style.units), 0)} ${u}`, 200, 44, ts, { size: 18, weight: 700 });
  drawText(ctx, `+${fmt(convert.elevation(before ? NaN : frame.textSample.elevationGain, style.units), 0)} ${u}`, x1, 44, ts, { size: 16, weight: 600, align: 'right' });
  // Dotted grid with labels.
  const step = niceStep((pr.hi - pr.lo) / 3);
  for (let a = Math.ceil(pr.lo / step) * step; a <= pr.hi; a += step) {
    ctx.beginPath();
    ctx.moveTo(x0, Y(a));
    ctx.lineTo(x1, Y(a));
    ctx.setLineDash?.([2, 6]);
    ctx.strokeStyle = withAlpha(GREEN, 0.35);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash?.([]);
    drawText(ctx, fmt(a, 0), x0 - 10, Y(a) + 5, ts, { size: 12, weight: 600, align: 'right', color: withAlpha(GREEN, 0.8) });
  }
  const cur = before ? 0 : Math.min(1, s.distance / pr.total);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (traceProfile(ctx, pr, X, Y)) glowStroke(ctx, withAlpha(GREEN, 0.45), 1.4);
  if (cur > 0) {
    ctx.beginPath();
    traceProfile(ctx, pr, X, Y, 0, cur);
    ctx.lineTo(X(cur), Y(profileAt(pr, cur)));
    glowStroke(ctx, GREEN, 2.2);
    const yy = Y(profileAt(pr, cur));
    ctx.beginPath();
    ctx.moveTo(X(cur), yy + 8);
    ctx.lineTo(X(cur), y1 + 8);
    glowStroke(ctx, GREEN, 1, [4, 4]);
    ctx.beginPath();
    ctx.moveTo(X(cur), yy - 8);
    ctx.lineTo(X(cur) + 7, yy);
    ctx.lineTo(X(cur), yy + 8);
    ctx.lineTo(X(cur) - 7, yy);
    ctx.closePath();
    glowStroke(ctx, GREEN, 1.6);
  }
  const du = convert.distanceUnit(style.units);
  drawText(ctx, `0 ${du}`, x0, PROF_H - 18, ts, { size: 12, weight: 600, color: withAlpha(GREEN, 0.8) });
  drawText(ctx, `${fmt(convert.distance(pr.total, style.units), 1)} ${du}`, x1, PROF_H - 18, ts, { size: 12, weight: 600, align: 'right', color: withAlpha(GREEN, 0.8) });
}

// ---------------------------------------------------------------------------------------------
// Summary: a boxed list.

const SUM_W = 420;
const SUM_H = 230;

function summary(ctx: Ctx2D, rows: SummaryRowData[], style: OverlayStyle) {
  const ts = hudText(style);
  brackets(ctx, 12, 12, SUM_W - 24, SUM_H - 24, 24, GREEN);
  const top = 34;
  const rowH = (SUM_H - 60) / 4;
  rows.forEach((r, i) => {
    const y = top + i * rowH + rowH * 0.62;
    spaced(ctx, r.label, 34, y, ts, { size: 12, weight: 600, color: withAlpha(GREEN, 0.85), maxW: 180 });
    drawText(ctx, r.unit ? `${r.value} ${r.unit}` : r.value, SUM_W - 34, y + 2, ts, { size: 22, weight: 700, align: 'right' });
  });
}

// ---------------------------------------------------------------------------------------------
// Extras: pitch ladder, speed and altitude tapes, and the full HUD.

/** Pitch ladder: rungs every 5 % around the current grade, solid above zero, dashed below; flight-path marker. */
function pitchLadder(ctx: Ctx2D, cx: number, cy: number, halfH: number, grade: number, style: OverlayStyle, before: boolean) {
  const ts = hudText(style);
  const k = 15; // px per %
  const g = Number.isFinite(grade) && !before ? grade : 0;
  const caution = Math.abs(g) >= 15;
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - 230, cy - halfH, 460, halfH * 2);
  ctx.clip();
  const lo = Math.floor((g - halfH / k) / 5) * 5;
  const hi = Math.ceil((g + halfH / k) / 5) * 5;
  for (let r = lo; r <= hi; r += 5) {
    const y = cy - (r - g) * k;
    const half = r === 0 ? 170 : 110;
    const gap = 46;
    ctx.beginPath();
    ctx.moveTo(cx - half, y);
    ctx.lineTo(cx - gap, y);
    ctx.moveTo(cx + gap, y);
    ctx.lineTo(cx + half, y);
    if (r !== 0) {
      const tip = r > 0 ? 9 : -9;
      ctx.moveTo(cx - half, y);
      ctx.lineTo(cx - half, y + tip);
      ctx.moveTo(cx + half, y);
      ctx.lineTo(cx + half, y + tip);
    }
    glowStroke(ctx, GREEN, r === 0 ? 1.8 : 1.4, r < 0 ? [10, 7] : undefined);
    if (r !== 0) {
      const t = r > 0 ? `+${r}` : String(r);
      drawText(ctx, t, cx - half - 10, y + 6, ts, { size: 15, weight: 600, align: 'right' });
      drawText(ctx, t, cx + half + 10, y + 6, ts, { size: 15, weight: 600 });
    }
  }
  ctx.restore();
  // Flight-path marker.
  ctx.beginPath();
  ctx.arc(cx, cy, 9, 0, Math.PI * 2);
  ctx.moveTo(cx - 9, cy);
  ctx.lineTo(cx - 28, cy);
  ctx.moveTo(cx + 9, cy);
  ctx.lineTo(cx + 28, cy);
  ctx.moveTo(cx, cy - 9);
  ctx.lineTo(cx, cy - 20);
  glowStroke(ctx, GREEN, 1.8);
  // Grade readout under the ladder.
  const color = caution ? AMBER : GREEN;
  const text = before || !Number.isFinite(grade) ? '—' : `${grade > 0 ? '+' : ''}${fmt(grade, 1)} %`;
  const by = cy + halfH + 8;
  ctx.beginPath();
  ctx.moveTo(cx - 70, by);
  ctx.lineTo(cx - 70, by + 12);
  ctx.lineTo(cx - 56, by + 12);
  ctx.moveTo(cx + 70, by);
  ctx.lineTo(cx + 70, by + 12);
  ctx.lineTo(cx + 56, by + 12);
  glowStroke(ctx, color, 1.4);
  drawText(ctx, text, cx, by + 14, hudText(style, color), { size: 22, weight: 700, align: 'center', color });
  if (caution) {
    caretBox(ctx, cx - 110, by + 28, 220, 30, 'none', AMBER);
    drawText(ctx, tr(style.language, 'kit.caution'), cx, by + 50, hudText(style, AMBER), { size: 17, weight: 800, align: 'center', tabular: false, color: AMBER });
  }
}

interface TapeSpec {
  value: number;
  /** Lowest value worth a tick (speed never goes below 0). */
  min?: number;
  pxPerUnit: number;
  minor: number;
  major: number;
  unit: string;
  side: 'left' | 'right';
}

/** Vertical tape centred on the value, with the boxed value pointing at it. */
function tape(ctx: Ctx2D, x: number, cy: number, halfH: number, t: TapeSpec, style: OverlayStyle, before: boolean) {
  const ts = hudText(style);
  const v = Number.isFinite(t.value) && !before ? t.value : 0;
  const dir = t.side === 'left' ? 1 : -1; // ticks point towards the centre of the screen
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - 120, cy - halfH, 240, halfH * 2);
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(x, cy - halfH);
  ctx.lineTo(x, cy + halfH);
  const first = Math.ceil((v - halfH / t.pxPerUnit) / t.minor) * t.minor;
  const labels: { y: number; text: string }[] = [];
  for (let a = Math.max(first, t.min ?? -Infinity); a <= v + halfH / t.pxPerUnit; a += t.minor) {
    const y = cy - (a - v) * t.pxPerUnit;
    const major = Math.abs(a / t.major - Math.round(a / t.major)) < 1e-6;
    ctx.moveTo(x, y);
    ctx.lineTo(x + dir * (major ? 14 : 7), y);
    if (major && Math.abs(y - cy) > 22) labels.push({ y, text: fmt(a, 0) });
  }
  glowStroke(ctx, GREEN, 1.4);
  for (const l of labels) drawText(ctx, l.text, x - dir * 12, l.y + 6, ts, { size: 16, weight: 600, align: t.side === 'left' ? 'right' : 'left' });
  ctx.restore();
  const bw = 86;
  const bx = t.side === 'left' ? x - bw - 16 : x + 16;
  caretBox(ctx, bx, cy - 18, bw, 36, t.side === 'left' ? 'right' : 'left', GREEN);
  drawText(ctx, before || !Number.isFinite(t.value) ? '—' : fmt(t.value, 0), bx + bw / 2, cy + 8, ts, { size: 22, weight: 700, align: 'center' });
  drawText(ctx, t.unit, x - dir * 10, cy - halfH - 8, ts, { size: 14, weight: 600, align: t.side === 'left' ? 'right' : 'left', tabular: false });
}

function speedTape(style: OverlayStyle, s: RideSample) {
  const metric = style.units.system === 'metric';
  return { value: convert.speed(s.speed, style.units), min: 0, pxPerUnit: metric ? 6 : 9, minor: 5, major: 10, unit: convert.speedUnit(style.units), side: 'left' as const };
}

function altTape(style: OverlayStyle, s: RideSample) {
  const metric = style.units.system === 'metric';
  return { value: convert.elevation(s.altitude, style.units), pxPerUnit: metric ? 0.6 : 0.18, minor: metric ? 25 : 100, major: metric ? 100 : 500, unit: convert.elevationUnit(style.units), side: 'right' as const };
}

const g = (spec: Parameters<typeof kitGadget>[2]) => kitGadget('hud', SLUG, spec);

const pitchGadget = g({
  role: 'pitch',
  name: 'kit.pitch',
  slug: 'pitch',
  requires: 'grade',
  size: { width: 480, height: 400 },
  draw: (ctx, frame, style, octx) => {
    const f = effectiveFrame(frame, style);
    pitchLadder(ctx, 240, 180, 150, f.sample.grade, style, beforeStart(octx.ride, f.sample));
  },
});

const speedTapeGadget = g({
  role: 'speedTape',
  name: 'kit.speedTape',
  slug: 'speed-tape',
  requires: 'speed',
  size: { width: 190, height: 460 },
  draw: (ctx, frame, style, octx) => {
    const f = effectiveFrame(frame, style);
    tape(ctx, 160, 240, 200, speedTape(style, f.sample), style, beforeStart(octx.ride, f.sample));
  },
});

const altTapeGadget = g({
  role: 'altTape',
  name: 'kit.altTape',
  slug: 'altitude-tape',
  requires: 'altitude',
  size: { width: 200, height: 460 },
  draw: (ctx, frame, style, octx) => {
    const f = effectiveFrame(frame, style);
    tape(ctx, 30, 240, 200, altTape(style, f.sample), style, beforeStart(octx.ride, f.sample));
  },
});

/** Readouts in a corner: "HR 152" lines. */
function readouts(ctx: Ctx2D, x: number, y: number, rows: [string, string][], style: OverlayStyle) {
  const ts = hudText(style);
  rows.forEach(([label, value], i) => {
    drawText(ctx, label, x, y + i * 30, ts, { size: 18, weight: 600, tabular: false });
    drawText(ctx, value, x + 70, y + i * 30, ts, { size: 20, weight: 700 });
  });
}

const fullHud = g({
  role: 'hud',
  name: 'kit.hud',
  slug: 'full',
  requires: 'speed',
  size: { width: 1280, height: 720 },
  draw: (ctx, frame, style, octx) => {
    const ride: RideData = octx.ride;
    const f = effectiveFrame(frame, style);
    const before = beforeStart(ride, f.sample);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    headingTape(ctx, compassData(f, style, ride), 640, 92, 760, style);
    tape(ctx, 230, 360, 190, speedTape(style, f.sample), style, before);
    if (ride.available.has('altitude')) tape(ctx, 1050, 360, 190, altTape(style, f.sample), style, before);
    if (ride.available.has('grade')) pitchLadder(ctx, 640, 340, 150, f.sample.grade, style, before);
    const ts = f.textSample;
    const left: [string, string][] = [];
    if (ride.available.has('heartRate')) left.push(['HR', fmt(ts.heartRate, 0)]);
    if (ride.available.has('power')) left.push(['PWR', fmt(ts.power, 0)]);
    if (ride.available.has('cadence')) left.push(['CAD', fmt(ts.cadence, 0)]);
    readouts(ctx, 60, 620, left.slice(0, 3), style);
    const t = hudText(style);
    const du = convert.distanceUnit(style.units).toUpperCase();
    drawText(ctx, `DIST ${fmt(convert.distance(ts.distance, style.units), 1)} ${du}`, 1220, 620, t, { size: 20, weight: 700, align: 'right' });
    const c = compassData(f, style, ride);
    if (c.toStart) {
      const text = `${tr(style.language, 'kit.start')} ${c.toStart.text}`;
      ctx.font = font(t, 16, 600);
      backToStart(ctx, c, 1220 - ctx.measureText(text).width - 30, 652, 'left');
    }
  },
});

export const hudKit: ThemeKit = {
  id: 'hud',
  slug: SLUG,
  dialSize: { width: DIAL_W, height: DIAL_H },
  dial,
  mapSize: { width: MAP_SIZE, height: MAP_SIZE },
  map,
  profileSize: { width: PROF_W, height: PROF_H },
  profile,
  summarySize: { width: SUM_W, height: SUM_H },
  summary,
  compassSize: { width: COMPASS_W, height: COMPASS_H },
  compass,
  extras: [fullHud, pitchGadget, speedTapeGadget, altTapeGadget],
};

export const hudFamily: OverlayDefinition[] = makeThemeFamily(hudKit);
