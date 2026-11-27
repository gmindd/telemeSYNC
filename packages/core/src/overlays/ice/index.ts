import { tr } from '../../i18n/index.ts';
import { skiRuns } from '../../metrics/derived.ts';
import { beforeStart } from '../dial/dials.ts';
import { CX, CY } from '../dial/common.ts';
import { drawRoundMap, MAP_R } from '../dial/map.ts';
import { drawText } from '../draw.ts';
import { mixColor, withAlpha } from '../panel/paint.ts';
import type { Ctx2D, FrameState, OverlayContext, OverlayDefinition, OverlayStyle } from '../types.ts';
import { convert, fmt } from '../units.ts';
import { lineIcon } from '../kit/icons.ts';
import { effectiveFrame, kitGadget, makeThemeFamily, type CompassData, type DialData, type SummaryRowData, type ThemeKit } from '../kit/kit.ts';
import { fitFont, noShadow, profileAt, rideProfile, rrect, spaced, traceProfile, valueUnit } from '../kit/draw.ts';

// Ice / Arctic: frozen glass with crystal edges, icy cyan glow, white numbers, icicles. Made for ski and
// snowboard; reads over bright snow thanks to a deep glacier-blue tint under the frost.

const CYAN = '#22d3ee';
const ICE = '#d9f7ff';
const WHITE = '#ffffff';
const SLUG = ['ice', 'gelo', 'glace', 'hielo', 'eis'] as const;

const iceText = (style: OverlayStyle): OverlayStyle => ({ ...style, outlineWidth: 0, shadow: true });
const tintOf = (style: OverlayStyle) => 0.22 + 0.36 * Math.max(0, Math.min(1, style.panelOpacity ?? 0.8));

/** Small deterministic random numbers (the crystals look the same on every frame). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Crystal outline: a circle whose edge is broken into facets. */
function crystalPath(ctx: Ctx2D, cx: number, cy: number, R: number, seed: number, n = 30, jitter = 0.04) {
  const r = rng(seed);
  ctx.beginPath();
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2;
    const rr = R * (1 - jitter + r() * jitter * 2);
    const x = cx + Math.cos(t) * rr;
    const y = cy + Math.sin(t) * rr;
    if (k) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

/** Frozen-glass disc: glacier tint, frost brighter at the edge, crystal rim, faint frost veins. */
function frostDisc(ctx: Ctx2D, cx: number, cy: number, R: number, style: OverlayStyle, seed: number) {
  ctx.save();
  crystalPath(ctx, cx, cy, R, seed);
  ctx.shadowColor = 'rgba(0,30,50,0.35)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = `rgba(8,47,73,${tintOf(style)})`;
  ctx.fill();
  ctx.restore();
  ctx.save();
  crystalPath(ctx, cx, cy, R, seed);
  ctx.clip();
  const g = ctx.createRadialGradient(cx, cy - R * 0.2, R * 0.2, cx, cy, R);
  g.addColorStop(0, 'rgba(217,247,255,0.06)');
  g.addColorStop(0.75, 'rgba(217,247,255,0.12)');
  g.addColorStop(1, 'rgba(217,247,255,0.38)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  // Frost veins growing in from the rim.
  const r = rng(seed + 7);
  ctx.strokeStyle = 'rgba(230,250,255,0.22)';
  ctx.lineWidth = 1;
  for (let k = 0; k < 14; k++) {
    const t = r() * Math.PI * 2;
    const len = R * (0.12 + r() * 0.22);
    const x0 = cx + Math.cos(t) * R;
    const y0 = cy + Math.sin(t) * R;
    const x1 = cx + Math.cos(t) * (R - len);
    const y1 = cy + Math.sin(t) * (R - len);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    ctx.moveTo(mx, my);
    ctx.lineTo(mx + Math.cos(t + 2.4) * len * 0.35, my + Math.sin(t + 2.4) * len * 0.35);
    ctx.moveTo(mx, my);
    ctx.lineTo(mx + Math.cos(t - 2.4) * len * 0.35, my + Math.sin(t - 2.4) * len * 0.35);
    ctx.stroke();
  }
  ctx.restore();
  crystalPath(ctx, cx, cy, R, seed);
  ctx.strokeStyle = 'rgba(240,252,255,0.85)';
  ctx.lineWidth = 1.6;
  ctx.shadowColor = withAlpha(CYAN, 0.8);
  ctx.shadowBlur = 10;
  ctx.stroke();
  noShadow(ctx);
}

/** Icicles hanging from y along x0..x1. */
function icicles(ctx: Ctx2D, x0: number, x1: number, y: number, maxLen: number, seed: number) {
  const r = rng(seed);
  for (let x = x0; x < x1; ) {
    const w = 6 + r() * 8;
    const len = maxLen * (0.3 + r() * 0.7);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w * 0.5, y + len);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, y, 0, y + len);
    g.addColorStop(0, 'rgba(240,252,255,0.9)');
    g.addColorStop(1, 'rgba(160,230,250,0.25)');
    ctx.fillStyle = g;
    ctx.fill();
    x += w + 4 + r() * 18;
  }
}

/** Thin icy arc on the 270° sweep, with a white tip. */
function iceArc(ctx: Ctx2D, cx: number, cy: number, r: number, f: number, origin: number) {
  const a0 = Math.PI * 0.75;
  const sweep = Math.PI * 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, a0, a0 + sweep);
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 6;
  ctx.stroke();
  if (!Number.isFinite(f)) return;
  const v = Math.max(0, Math.min(1, f));
  const a = Math.min(origin, v);
  const b = Math.max(origin, v);
  if (b - a > 0.003) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0 + sweep * a, a0 + sweep * b);
    ctx.strokeStyle = CYAN;
    ctx.shadowColor = withAlpha(CYAN, 0.95);
    ctx.shadowBlur = 14;
    ctx.lineWidth = 6;
    ctx.stroke();
    noShadow(ctx);
  }
  const t = a0 + sweep * v;
  ctx.beginPath();
  ctx.arc(cx + Math.cos(t) * r, cy + Math.sin(t) * r, 5, 0, Math.PI * 2);
  ctx.fillStyle = WHITE;
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 10;
  ctx.fill();
  noShadow(ctx);
}

// ---------------------------------------------------------------------------------------------
// Dial.

const DIAL = 300;

function dial(ctx: Ctx2D, d: DialData) {
  const ts = iceText(d.style);
  const c = DIAL / 2;
  frostDisc(ctx, c, c, 138, d.style, d.role.length * 31 + 3);
  iceArc(ctx, c, c, 118, d.f, d.origin);
  if (d.style.showLabel) spaced(ctx, d.label, c, c - 46, ts, { size: 13, weight: 700, align: 'center', color: ICE, maxW: 170 });
  const size = fitFont(ctx, ts, d.template, 160, 62, 800);
  valueUnit(ctx, d.value, d.unit, c, c + 20, ts, { size, weight: 800, unitSize: size * 0.4, unitWeight: 700, align: 'center', color: WHITE, unitColor: ICE });
  const extra = d.zone && d.zone.index >= 0 ? tr(d.style.language, 'dial.zone', { n: d.zone.index + 1 }) : d.secondary;
  if (extra) drawText(ctx, extra, c, c + 54, ts, { size: 14, weight: 700, align: 'center', tabular: true, color: ICE });
  lineIcon(ctx, d.icon, c, c + 86, 30, withAlpha(ICE, 0.9));
}

// ---------------------------------------------------------------------------------------------
// Compass: a snowflake ring turning with the heading.

const COMPASS = 320;

function compass(ctx: Ctx2D, c: CompassData) {
  const cx = COMPASS / 2;
  const cy = COMPASS / 2;
  const ts = iceText(c.style);
  frostDisc(ctx, cx, cy, 140, c.style, 91);
  const rot = (-c.heading * Math.PI) / 180;
  // Six snowflake arms with side branches, turning with the heading.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.strokeStyle = 'rgba(217,247,255,0.35)';
  ctx.lineWidth = 2;
  for (let k = 0; k < 6; k++) {
    ctx.save();
    ctx.rotate((k * Math.PI) / 3);
    ctx.beginPath();
    ctx.moveTo(0, -62);
    ctx.lineTo(0, -118);
    for (const y of [-82, -100]) {
      ctx.moveTo(0, y);
      ctx.lineTo(-12, y - 12);
      ctx.moveTo(0, y);
      ctx.lineTo(12, y - 12);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  (['N', 'E', 'S', 'W'] as const).forEach((l, i) => {
    const t = rot + (i * Math.PI) / 2 - Math.PI / 2;
    drawText(ctx, l, cx + Math.cos(t) * 104, cy + Math.sin(t) * 104 + 7, ts, { size: 20, weight: 800, align: 'center', tabular: false, color: l === 'N' ? CYAN : WHITE });
  });
  ctx.beginPath();
  ctx.moveTo(cx, cy - 138);
  ctx.lineTo(cx - 9, cy - 120);
  ctx.lineTo(cx + 9, cy - 120);
  ctx.closePath();
  ctx.fillStyle = WHITE;
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 10;
  ctx.fill();
  noShadow(ctx);
  drawText(ctx, c.before ? '—' : `${Math.round(c.heading) % 360}°`, cx + 6, cy + 14, ts, { size: 40, weight: 800, align: 'center', color: WHITE });
  drawText(ctx, c.cardinal, cx, cy + 40, ts, { size: 16, weight: 700, align: 'center', tabular: false, color: ICE });
  if (c.toStart) {
    const t = ((c.toStart.bearing - c.heading) * Math.PI) / 180 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(t) * 76, cy + Math.sin(t) * 76, 6, 0, Math.PI * 2);
    ctx.fillStyle = CYAN;
    ctx.fill();
    drawText(ctx, `${tr(c.style.language, 'kit.start')} ${c.toStart.text}`, cx, cy - 32, ts, { size: 13, weight: 700, align: 'center', tabular: true, color: ICE });
  }
}

// ---------------------------------------------------------------------------------------------
// Map: a frozen lens with icicles.

const MAP_W = 330;
const MAP_H = 370;
const MAP_O = (MAP_W - CX * 2) / 2;

function map(ctx: Ctx2D, frame: FrameState, style: OverlayStyle, octx: OverlayContext) {
  ctx.save();
  ctx.translate(MAP_O, MAP_O);
  drawRoundMap(
    ctx,
    frame,
    { ...iceText(style), accentColor: CYAN },
    octx,
    (c) => frostDisc(c, CX, CY, MAP_R + 12, style, 57),
    {
      bg: [`rgba(8,47,73,${tintOf(style) * 0.6})`, `rgba(8,47,73,${tintOf(style) + 0.1})`],
      shade: 0.15,
      route: 'rgba(240,252,255,0.6)',
      routeUnder: 'rgba(0,30,50,0.3)',
      arrow: WHITE,
      arrowGlow: withAlpha(CYAN, 0.95),
      north: 'rgba(8,47,73,0.85)',
      northRing: ICE,
      northWidth: 1.4,
    },
  );
  icicles(ctx, CX - 70, CX + 70, CY + MAP_R + 8, 32, 11);
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Profile: the ride as a glacier, with icicles under it.

const PROF_W = 680;
const PROF_H = 230;

function frostCard(ctx: Ctx2D, x: number, y: number, w: number, h: number, style: OverlayStyle) {
  rrect(ctx, x, y, w, h, 18);
  ctx.save();
  ctx.shadowColor = 'rgba(0,30,50,0.3)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = `rgba(8,47,73,${tintOf(style)})`;
  ctx.fill();
  ctx.restore();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(217,247,255,0.22)');
  g.addColorStop(0.4, 'rgba(217,247,255,0.06)');
  g.addColorStop(1, 'rgba(217,247,255,0.14)');
  rrect(ctx, x, y, w, h, 18);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(240,252,255,0.7)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

function glacier(ctx: Ctx2D, frame: FrameState, style: OverlayStyle, ride: OverlayContext['ride'], x0: number, x1: number, y0: number, y1: number) {
  const pr = rideProfile(ride, style, 160);
  const s = frame.sample;
  const before = beforeStart(ride, s);
  const X = (f: number) => x0 + f * (x1 - x0);
  const Y = (a: number) => y1 - ((a - pr.lo) / (pr.hi - pr.lo || 1)) * (y1 - y0);
  const cur = before ? 0 : Math.min(1, s.distance / pr.total);
  // Ice body: vertical facets alternating light and shade.
  ctx.save();
  ctx.beginPath();
  traceProfile(ctx, pr, X, Y);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x0, y1);
  ctx.closePath();
  ctx.clip();
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, 'rgba(240,252,255,0.85)');
  g.addColorStop(1, 'rgba(120,210,240,0.35)');
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  for (let k = 0; k < 40; k++) {
    if (k % 2) continue;
    const xa = x0 + ((x1 - x0) * k) / 40;
    const xb = x0 + ((x1 - x0) * (k + 1)) / 40;
    ctx.beginPath();
    ctx.moveTo(xa, y0);
    ctx.lineTo(xb, y0);
    ctx.lineTo(xb - 10, y1);
    ctx.lineTo(xa - 18, y1);
    ctx.closePath();
    ctx.fillStyle = 'rgba(14,116,144,0.16)';
    ctx.fill();
  }
  ctx.restore();
  icicles(ctx, x0 + 6, x1 - 6, y1, 22, 23);
  ctx.lineJoin = 'round';
  if (cur > 0) {
    ctx.beginPath();
    traceProfile(ctx, pr, X, Y, 0, cur);
    ctx.lineTo(X(cur), Y(profileAt(pr, cur)));
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 3;
    ctx.shadowColor = withAlpha(CYAN, 0.95);
    ctx.shadowBlur = 10;
    ctx.stroke();
    noShadow(ctx);
    ctx.beginPath();
    ctx.arc(X(cur), Y(profileAt(pr, cur)), 6, 0, Math.PI * 2);
    ctx.fillStyle = WHITE;
    ctx.shadowColor = CYAN;
    ctx.shadowBlur = 12;
    ctx.fill();
    noShadow(ctx);
  }
}

function profile(ctx: Ctx2D, frame: FrameState, style: OverlayStyle, octx: OverlayContext) {
  const ts = iceText(style);
  frostCard(ctx, 12, 12, PROF_W - 24, PROF_H - 50, style);
  if (style.showLabel) spaced(ctx, tr(style.language, 'card.elevation'), 34, 44, ts, { size: 13, weight: 700, color: ICE });
  valueUnit(ctx, fmt(convert.elevation(frame.textSample.altitude, style.units), 0), convert.elevationUnit(style.units), PROF_W - 34, 46, ts, { size: 24, weight: 800, unitSize: 14, align: 'right', color: WHITE, unitColor: ICE });
  glacier(ctx, frame, style, octx.ride, 34, PROF_W - 34, 62, PROF_H - 52);
}

// ---------------------------------------------------------------------------------------------
// Summary.

const SUM_W = 420;
const SUM_H = 270;

function summary(ctx: Ctx2D, rows: SummaryRowData[], style: OverlayStyle) {
  const ts = iceText(style);
  frostCard(ctx, 12, 12, SUM_W - 24, SUM_H - 24, style);
  const rowH = (SUM_H - 48) / 4;
  rows.forEach((r, i) => {
    const y = 24 + i * rowH;
    if (i > 0) {
      ctx.beginPath();
      ctx.moveTo(36, y);
      ctx.lineTo(SUM_W - 36, y);
      ctx.strokeStyle = 'rgba(217,247,255,0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    const mid = y + rowH / 2;
    lineIcon(ctx, r.icon, 50, mid, 24, CYAN);
    spaced(ctx, r.label, 78, mid + 5, ts, { size: 11, weight: 700, color: ICE, maxW: 140 });
    valueUnit(ctx, r.value, r.unit, SUM_W - 34, mid + 11, ts, { size: 28, weight: 800, unitSize: 14, align: 'right', color: WHITE, unitColor: ICE });
  });
}

// ---------------------------------------------------------------------------------------------
// Extras: runs and vertical drop.

/** Room around every gadget for the glows and shadows, so the video never shows them cut off. */
const PAD = 14;
const g = (spec: Parameters<typeof kitGadget>[2]) => kitGadget('ice', SLUG, { ...spec, pad: PAD });

const runsCard = g({
  role: 'runsCard',
  name: 'kit.runsCard',
  slug: 'runs-card',
  requires: 'runs',
  sports: ['snow'],
  textOnly: true,
  size: { width: 520, height: 170 },
  draw: (ctx, frame, style, octx) => {
    const ride = octx.ride;
    const s = effectiveFrame(frame, style).textSample;
    const ts = iceText(style);
    const before = beforeStart(ride, s);
    const r = skiRuns(ride);
    const u = convert.elevationUnit(style.units);
    frostCard(ctx, 12, 12, 496, 136, style);
    const cols: [string, string, string][] = [
      [tr(style.language, 'metric.runs'), before ? '0' : String(r.count[s.index]), ''],
      [tr(style.language, 'kit.run'), fmt(convert.elevation(before ? NaN : r.drop[s.index], style.units), 0), u],
      [tr(style.language, 'kit.drop'), fmt(convert.elevation(before ? NaN : r.total[s.index], style.units), 0), u],
    ];
    cols.forEach(([label, value, unit], i) => {
      const x = 36 + i * 160;
      spaced(ctx, label, x, 50, ts, { size: 12, weight: 700, color: ICE, maxW: 140 });
      valueUnit(ctx, value, unit, x, 112, ts, { size: 44, weight: 800, unitSize: 18, color: i === 0 ? mixColor(CYAN, WHITE, 0.3) : WHITE, unitColor: ICE });
    });
    icicles(ctx, 40, 480, 148, 18, 31);
  },
});

export const iceKit: ThemeKit = {
  id: 'ice',
  slug: SLUG,
  pad: PAD,
  dialSize: { width: DIAL, height: DIAL },
  dial,
  mapSize: { width: MAP_W, height: MAP_H },
  map,
  profileSize: { width: PROF_W, height: PROF_H },
  profile,
  summarySize: { width: SUM_W, height: SUM_H },
  summary,
  compassSize: { width: COMPASS, height: COMPASS },
  compass,
  extras: [runsCard],
};

export const iceFamily: OverlayDefinition[] = makeThemeFamily(iceKit);
