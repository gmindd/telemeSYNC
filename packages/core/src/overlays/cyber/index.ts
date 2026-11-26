import type { RideData } from '../../telemetry/ride.ts';
import { tr } from '../../i18n/index.ts';
import { beforeStart } from '../dial/dials.ts';
import { CX, CY } from '../dial/common.ts';
import { drawRoundMap, MAP_R } from '../dial/map.ts';
import { drawText, font } from '../draw.ts';
import { mixColor, withAlpha } from '../panel/paint.ts';
import type { Ctx2D, FrameState, OverlayContext, OverlayDefinition, OverlayStyle } from '../types.ts';
import { convert, fmt } from '../units.ts';
import { dialData, effectiveFrame, kitGadget, makeThemeFamily, type CompassData, type DialData, type SummaryRowData, type ThemeKit } from '../kit/kit.ts';
import { noShadow, profileAt, rideProfile, spaced, traceProfile } from '../kit/draw.ts';
import { metricRole } from '../kit/roles.ts';

// Cyberpunk: neon magenta and electric cyan on dark, angular cut-corner frames, digital seven-segment numbers,
// a touch of chromatic aberration. Best over night footage.

const MAGENTA = '#ff2bd6';
const CYAN = '#00f0ff';
const ACID = '#f5ff3b';
const SLUG = ['neon', 'neon', 'neon', 'neon', 'neon'] as const;

const neonText = (style: OverlayStyle, color: string): OverlayStyle => ({ ...style, textColor: color, outlineWidth: 0, shadow: false });
const darkAlpha = (style: OverlayStyle) => 0.25 + 0.4 * Math.max(0, Math.min(1, style.panelOpacity ?? 0.8));

/** Strokes the current path as a neon tube: wide soft glow, then a bright core. */
function neon(ctx: Ctx2D, color: string, w: number) {
  ctx.shadowColor = withAlpha(color, 0.95);
  ctx.shadowBlur = 14;
  ctx.strokeStyle = withAlpha(color, 0.9);
  ctx.lineWidth = w;
  ctx.stroke();
  noShadow(ctx);
  ctx.strokeStyle = mixColor(color, '#ffffff', 0.45);
  ctx.lineWidth = Math.max(1, w * 0.4);
  ctx.stroke();
}

/** Cut-corner frame (top-left and bottom-right corners cut). */
function frameShape(ctx: Ctx2D, x: number, y: number, w: number, h: number, c: number) {
  ctx.beginPath();
  ctx.moveTo(x + c, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + c);
  ctx.closePath();
}

function frame(ctx: Ctx2D, x: number, y: number, w: number, h: number, color: string, style: OverlayStyle, accent?: string) {
  frameShape(ctx, x, y, w, h, 18);
  ctx.fillStyle = `rgba(8,0,20,${darkAlpha(style)})`;
  ctx.fill();
  // Faint scanlines.
  ctx.save();
  frameShape(ctx, x, y, w, h, 18);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  for (let yy = y; yy < y + h; yy += 4) ctx.fillRect(x, yy, w, 1);
  ctx.restore();
  frameShape(ctx, x, y, w, h, 18);
  neon(ctx, color, 2.4);
  if (accent) {
    // A short second colour on the top-right corner.
    ctx.beginPath();
    ctx.moveTo(x + w - 60, y - 5);
    ctx.lineTo(x + w + 5, y - 5);
    ctx.lineTo(x + w + 5, y + 40);
    neon(ctx, accent, 2.2);
  }
}

// ---------------------------------------------------------------------------------------------
// Seven-segment digits.

const SEGS: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abdeg',
  '3': 'abcdg',
  '4': 'bcfg',
  '5': 'acdfg',
  '6': 'acdefg',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
  '-': 'g',
  '—': 'g',
  '+': 'gp',
};

/** Width of a character drawn at height h. */
function segWidth(ch: string, h: number): number {
  if (ch === '.' || ch === ',' || ch === ':' || ch === "'" || ch === '"') return h * 0.24;
  if (ch === ' ') return h * 0.3;
  return h * 0.68;
}

/** Seven-segment text with its left edge at x and its baseline at y. Returns the width. */
function sevenSeg(ctx: Ctx2D, text: string, x: number, y: number, h: number, color: string, glow = true): number {
  const w = h * 0.56;
  const t = h * 0.15;
  let cx = x;
  const bar = (x0: number, y0: number, x1: number, y1: number) => {
    // Hexagonal segment between two points.
    const horiz = y0 === y1;
    const k = t / 2;
    const inset = k * 0.55;
    ctx.beginPath();
    if (horiz) {
      ctx.moveTo(x0 + inset, y0);
      ctx.lineTo(x0 + inset + k, y0 - k);
      ctx.lineTo(x1 - inset - k, y0 - k);
      ctx.lineTo(x1 - inset, y0);
      ctx.lineTo(x1 - inset - k, y0 + k);
      ctx.lineTo(x0 + inset + k, y0 + k);
    } else {
      ctx.moveTo(x0, y0 + inset);
      ctx.lineTo(x0 + k, y0 + inset + k);
      ctx.lineTo(x0 + k, y1 - inset - k);
      ctx.lineTo(x0, y1 - inset);
      ctx.lineTo(x0 - k, y1 - inset - k);
      ctx.lineTo(x0 - k, y0 + inset + k);
    }
    ctx.closePath();
    ctx.fill();
  };
  ctx.save();
  ctx.fillStyle = color;
  if (glow) {
    ctx.shadowColor = withAlpha(color, 0.9);
    ctx.shadowBlur = h * 0.18;
  }
  for (const ch of text) {
    const cw = segWidth(ch, h);
    const top = y - h;
    const mid = y - h / 2;
    const segs = SEGS[ch];
    if (segs) {
      const L = cx + t;
      const R = cx + w;
      if (segs.includes('a')) bar(L, top, R, top);
      if (segs.includes('g')) bar(L, mid, R, mid);
      if (segs.includes('d')) bar(L, y, R, y);
      if (segs.includes('f')) bar(L, top, L, mid);
      if (segs.includes('b')) bar(R, top, R, mid);
      if (segs.includes('e')) bar(L, mid, L, y);
      if (segs.includes('c')) bar(R, mid, R, y);
      if (segs.includes('p')) bar((L + R) / 2, top + h * 0.22, (L + R) / 2, y - h * 0.22);
    } else if (ch === '.' || ch === ',') {
      ctx.fillRect(cx + t * 0.4, y - t, t, t);
    } else if (ch === ':') {
      ctx.fillRect(cx + t * 0.4, y - h * 0.32, t, t);
      ctx.fillRect(cx + t * 0.4, y - h * 0.72, t, t);
    } else if (ch === "'" || ch === '"') {
      ctx.fillRect(cx + t * 0.4, top, t * 0.8, h * 0.28);
      if (ch === '"') ctx.fillRect(cx + t * 1.6, top, t * 0.8, h * 0.28);
    }
    cx += cw;
  }
  ctx.restore();
  return cx - x;
}

const segTextWidth = (text: string, h: number) => [...text].reduce((s, ch) => s + segWidth(ch, h), 0);

/** Seven-segment value with a little chromatic aberration (cyan left, magenta right, then the colour). */
function digital(ctx: Ctx2D, text: string, x: number, y: number, h: number, color: string, align: 'left' | 'center' | 'right' = 'left') {
  const w = segTextWidth(text, h);
  const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  sevenSeg(ctx, text, left - 1.5, y, h, withAlpha(CYAN, 0.28), false);
  sevenSeg(ctx, text, left + 1.5, y, h, withAlpha(ACID, 0.18), false);
  sevenSeg(ctx, text, left, y, h, color);
  return w;
}

/** Height at which `template` fits `maxW`. */
const fitSeg = (template: string, maxW: number, max: number) => Math.min(max, (max * maxW) / Math.max(1, segTextWidth(template, max)));

// ---------------------------------------------------------------------------------------------
// Dial: a cut-corner frame, digital value, segmented bar.

const DIAL_W = 340;
const DIAL_H = 200;

function cellBar(ctx: Ctx2D, x: number, y: number, w: number, h: number, f: number, origin: number, zone?: DialData['zone']) {
  const n = 16;
  const gap = 4;
  const cw = (w - gap * (n - 1)) / n;
  const lit = (k: number) => {
    const c = (k + 0.5) / n;
    if (!Number.isFinite(f)) return false;
    return origin > 0 ? (c >= Math.min(origin, f) && c <= Math.max(origin, f)) : c <= f;
  };
  for (let k = 0; k < n; k++) {
    const c = mixColor(CYAN, MAGENTA, k / (n - 1));
    ctx.fillStyle = lit(k) ? c : 'rgba(255,255,255,0.08)';
    if (lit(k)) {
      ctx.shadowColor = c;
      ctx.shadowBlur = 8;
    }
    ctx.fillRect(x + k * (cw + gap), y, cw, h);
    noShadow(ctx);
  }
  if (zone && zone.index >= 0) {
    // Zone: an acid-yellow tick above its share of the bar.
    const zx = x + ((zone.index + 0.5) / zone.colors.length) * w;
    ctx.beginPath();
    ctx.moveTo(zx, y - 4);
    ctx.lineTo(zx - 6, y - 12);
    ctx.lineTo(zx + 6, y - 12);
    ctx.closePath();
    ctx.fillStyle = ACID;
    ctx.fill();
  }
}

function dial(ctx: Ctx2D, d: DialData) {
  const ts = neonText(d.style, CYAN);
  frame(ctx, 12, 14, DIAL_W - 24, DIAL_H - 28, CYAN, d.style, MAGENTA);
  if (d.style.showLabel) spaced(ctx, d.label, 34, 46, ts, { size: 14, weight: 700, color: CYAN, spacing: 0.16, maxW: 180 });
  const tag = d.zone && d.zone.index >= 0 ? `Z${d.zone.index + 1}` : '';
  if (tag) drawText(ctx, tag, DIAL_W - 36, 46, ts, { size: 16, weight: 800, align: 'right', tabular: false, color: ACID });
  else if (d.secondary) drawText(ctx, d.secondary, DIAL_W - 36, 46, ts, { size: 12, weight: 700, align: 'right', color: withAlpha(CYAN, 0.85) });
  const unitW = d.unit ? (ctx.font = font(ts, 20, 700), ctx.measureText(d.unit.toUpperCase()).width + 10) : 0;
  const h = fitSeg(d.template, DIAL_W - 70 - unitW, 66);
  const vw = digital(ctx, d.value, 34, 124, h, MAGENTA);
  if (d.unit) drawText(ctx, d.unit.toUpperCase(), 34 + vw + 10, 124, ts, { size: 20, weight: 700, tabular: false, color: CYAN });
  cellBar(ctx, 34, 146, DIAL_W - 68, 12, d.f, d.origin, d.zone);
}

// ---------------------------------------------------------------------------------------------
// Compass: hexagonal neon ring, turning ticks, digital heading.

const COMPASS = 320;

function compass(ctx: Ctx2D, c: CompassData) {
  const cx = COMPASS / 2;
  const cy = COMPASS / 2;
  const R = 132;
  const ts = neonText(c.style, CYAN);
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const t = (k / 6) * Math.PI * 2;
    const x = cx + Math.cos(t) * (R + 12);
    const y = cy + Math.sin(t) * (R + 12);
    if (k) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = `rgba(8,0,20,${darkAlpha(c.style)})`;
  ctx.fill();
  neon(ctx, MAGENTA, 2.6);
  const rot = (-c.heading * Math.PI) / 180;
  ctx.beginPath();
  for (let deg = 0; deg < 360; deg += 10) {
    const t = rot + (deg * Math.PI) / 180 - Math.PI / 2;
    const r0 = R * (deg % 30 === 0 ? 0.78 : 0.85);
    ctx.moveTo(cx + Math.cos(t) * r0, cy + Math.sin(t) * r0);
    ctx.lineTo(cx + Math.cos(t) * R * 0.92, cy + Math.sin(t) * R * 0.92);
  }
  neon(ctx, CYAN, 1.6);
  (['N', 'E', 'S', 'W'] as const).forEach((l, i) => {
    const t = rot + (i * Math.PI) / 2 - Math.PI / 2;
    drawText(ctx, l, cx + Math.cos(t) * R * 0.62, cy + Math.sin(t) * R * 0.62 + 7, ts, { size: 20, weight: 800, align: 'center', tabular: false, color: l === 'N' ? ACID : CYAN });
  });
  // Index at the top.
  ctx.beginPath();
  ctx.moveTo(cx, cy - R - 2);
  ctx.lineTo(cx - 10, cy - R - 20);
  ctx.lineTo(cx + 10, cy - R - 20);
  ctx.closePath();
  ctx.fillStyle = ACID;
  ctx.shadowColor = ACID;
  ctx.shadowBlur = 10;
  ctx.fill();
  noShadow(ctx);
  digital(ctx, c.before ? '---' : String(Math.round(c.heading) % 360), cx, cy + 16, 38, MAGENTA, 'center');
  drawText(ctx, c.cardinal, cx, cy + 44, ts, { size: 16, weight: 800, align: 'center', tabular: false, color: CYAN });
  if (c.toStart) {
    const t = ((c.toStart.bearing - c.heading) * Math.PI) / 180 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(t) * R * 0.42, cy + Math.sin(t) * R * 0.42, 5, 0, Math.PI * 2);
    ctx.fillStyle = ACID;
    ctx.fill();
    drawText(ctx, `${tr(c.style.language, 'kit.start')} ${c.toStart.text}`, cx, cy - 34, ts, { size: 12, weight: 700, align: 'center', tabular: true, color: ACID });
  }
}

// ---------------------------------------------------------------------------------------------
// Map: dark grid lens in a neon ring.

const MAP_SIZE = 330;
const MAP_O = (MAP_SIZE - CX * 2) / 2;

function map(ctx: Ctx2D, frame0: FrameState, style: OverlayStyle, octx: OverlayContext) {
  ctx.save();
  ctx.translate(MAP_O, MAP_O);
  drawRoundMap(
    ctx,
    frame0,
    { ...neonText(style, CYAN), accentColor: CYAN },
    octx,
    (c) => {
      c.beginPath();
      c.arc(CX, CY, MAP_R + 8, 0, Math.PI * 2);
      neon(c, CYAN, 2.6);
    },
    {
      bg: [`rgba(10,0,28,${darkAlpha(style)})`, `rgba(4,0,14,${darkAlpha(style) + 0.15})`],
      shade: 0.2,
      route: withAlpha(MAGENTA, 0.55),
      routeUnder: 'rgba(0,0,0,0.3)',
      arrow: MAGENTA,
      arrowGlow: withAlpha(MAGENTA, 0.95),
      north: '#0a0014',
      northRing: ACID,
      northWidth: 1.6,
    },
  );
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Profile: synthwave wireframe mountains over a perspective grid.

/** Perspective grid floor between y0 (horizon) and y1, from x0 to x1, scrolling with `phase` (0..1). */
function gridFloor(ctx: Ctx2D, x0: number, x1: number, y0: number, y1: number, phase: number) {
  const cx = (x0 + x1) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, x1 - x0, y1 - y0);
  ctx.clip();
  ctx.beginPath();
  for (let k = -12; k <= 12; k++) {
    ctx.moveTo(cx + k * 22, y0);
    ctx.lineTo(cx + k * 130, y1);
  }
  for (let k = 0; k < 7; k++) {
    const z = ((k + phase) / 7) ** 2;
    const y = y0 + (y1 - y0) * z;
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
  }
  ctx.strokeStyle = withAlpha(MAGENTA, 0.35);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function synthwave(ctx: Ctx2D, ride: RideData, frame0: FrameState, style: OverlayStyle, x0: number, x1: number, y0: number, y1: number) {
  const pr = rideProfile(ride, style);
  const s = frame0.sample;
  const before = beforeStart(ride, s);
  const cur = before ? 0 : Math.min(1, s.distance / pr.total);
  const base = y1 - 26;
  gridFloor(ctx, x0, x1, base, y1, (s.distance / 200) % 1 || 0);
  const X = (f: number) => x0 + f * (x1 - x0);
  const Y = (a: number) => base - ((a - pr.lo) / (pr.hi - pr.lo || 1)) * (base - y0);
  // Wireframe: vertical hatching under the ridge, then the ridge in two colours.
  ctx.beginPath();
  for (let f = 0; f <= 1; f += 1 / 90) {
    ctx.moveTo(X(f), base);
    ctx.lineTo(X(f), Y(profileAt(pr, f)));
  }
  ctx.strokeStyle = withAlpha(CYAN, 0.22);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (traceProfile(ctx, pr, X, Y, cur, 1)) neon(ctx, CYAN, 2);
  if (cur > 0) {
    ctx.beginPath();
    traceProfile(ctx, pr, X, Y, 0, cur);
    ctx.lineTo(X(cur), Y(profileAt(pr, cur)));
    neon(ctx, MAGENTA, 2.6);
    const y = Y(profileAt(pr, cur));
    ctx.beginPath();
    ctx.moveTo(X(cur), y + 8);
    ctx.lineTo(X(cur), y1);
    neon(ctx, ACID, 1.2);
    ctx.beginPath();
    ctx.arc(X(cur), y, 6, 0, Math.PI * 2);
    ctx.fillStyle = ACID;
    ctx.shadowColor = ACID;
    ctx.shadowBlur = 12;
    ctx.fill();
    noShadow(ctx);
  }
}

const PROF_W = 680;
const PROF_H = 230;

function profile(ctx: Ctx2D, frame0: FrameState, style: OverlayStyle, octx: OverlayContext) {
  const ts = neonText(style, CYAN);
  frame(ctx, 12, 14, PROF_W - 24, PROF_H - 28, MAGENTA, style);
  if (style.showLabel) spaced(ctx, tr(style.language, 'card.elevation'), 36, 46, ts, { size: 14, weight: 700, color: CYAN });
  const u = convert.elevationUnit(style.units);
  digital(ctx, fmt(convert.elevation(frame0.textSample.altitude, style.units), 0), PROF_W - 70, 52, 26, MAGENTA, 'right');
  drawText(ctx, u.toUpperCase(), PROF_W - 40, 52, ts, { size: 16, weight: 700, align: 'right', tabular: false, color: CYAN });
  synthwave(ctx, octx.ride, frame0, style, 36, PROF_W - 36, 66, PROF_H - 30);
}

// ---------------------------------------------------------------------------------------------
// Summary.

const SUM_W = 420;
const SUM_H = 270;

function summary(ctx: Ctx2D, rows: SummaryRowData[], style: OverlayStyle) {
  const ts = neonText(style, CYAN);
  frame(ctx, 12, 14, SUM_W - 24, SUM_H - 28, CYAN, style, MAGENTA);
  const rowH = (SUM_H - 60) / 4;
  rows.forEach((r, i) => {
    const y = 34 + i * rowH + rowH * 0.62;
    spaced(ctx, r.label, 36, y - 4, ts, { size: 12, weight: 700, color: CYAN, maxW: 160 });
    let x = SUM_W - 36;
    if (r.unit) {
      x -= drawText(ctx, r.unit.toUpperCase(), x, y, ts, { size: 14, weight: 700, align: 'right', tabular: false, color: CYAN }) + 8;
    }
    digital(ctx, r.value, x, y + 2, 30, MAGENTA, 'right');
  });
}

// ---------------------------------------------------------------------------------------------
// Extras: heart rate with an ECG line, and the wide synthwave profile strip.

/** Room around every gadget for the glows and shadows, so the video never shows them cut off. */
const PAD = 14;
const g = (spec: Parameters<typeof kitGadget>[2]) => kitGadget('cyber', SLUG, { ...spec, pad: PAD });

/** One heartbeat (P, QRS, T waves) at phase p (0..1), height 1. */
function beat(p: number): number {
  const bump = (c: number, w: number, a: number) => a * Math.exp(-(((p - c) / w) ** 2));
  return bump(0.18, 0.035, 0.12) - bump(0.3, 0.012, 0.15) + bump(0.33, 0.014, 1) - bump(0.36, 0.014, 0.3) + bump(0.58, 0.05, 0.22);
}

const ecg = g({
  role: 'ecg',
  name: 'kit.ecg',
  slug: 'ecg',
  requires: 'heartRate',
  size: { width: 560, height: 200 },
  draw: (ctx, frame0, style, octx) => {
    const f = effectiveFrame(frame0, style);
    const d = dialData(metricRole('heartRate'), f, style, octx.ride);
    const ts = neonText(style, CYAN);
    frame(ctx, 12, 14, 536, 172, MAGENTA, style, CYAN);
    if (style.showLabel) spaced(ctx, d.label, 34, 46, ts, { size: 14, weight: 700, color: CYAN, maxW: 220 });
    const vw = digital(ctx, d.value, 34, 112, 54, MAGENTA);
    drawText(ctx, 'BPM', 44 + vw, 112, ts, { size: 18, weight: 700, tabular: false, color: CYAN });
    if (d.zone && d.zone.index >= 0) drawText(ctx, `ZONE ${d.zone.index + 1}`, 34, 150, ts, { size: 15, weight: 800, tabular: false, color: ACID });
    // Trace scrolling at the heart rate: beats per second from the value, phase from the time.
    const bpm = Number.isFinite(d.textSample.heartRate) ? d.textSample.heartRate : 0;
    const x0 = 250;
    const x1 = 530;
    const mid = 112;
    const secs = 2.4; // seconds shown
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 2) {
      const tt = f.t / 1000 - ((x1 - x) / (x1 - x0)) * secs;
      const p = bpm > 0 ? ((tt * bpm) / 60) % 1 : 0;
      const y = mid - beat(p < 0 ? p + 1 : p) * 56;
      if (x === x0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    neon(ctx, MAGENTA, 2.4);
    cellBar(ctx, 250, 160, 280, 10, d.f, 0, d.zone);
  },
});

const synthStrip = g({
  role: 'synthwave',
  name: 'kit.synthwave',
  slug: 'synthwave',
  requires: 'elevationProfile',
  placement: 'bottom',
  size: { width: 1240, height: 200 },
  draw: (ctx, frame0, style, octx) => synthwave(ctx, octx.ride, frame0, style, 30, 1210, 20, 186),
});

export const cyberKit: ThemeKit = {
  id: 'cyber',
  slug: SLUG,
  pad: PAD,
  dialSize: { width: DIAL_W, height: DIAL_H },
  dial,
  mapSize: { width: MAP_SIZE, height: MAP_SIZE },
  map,
  profileSize: { width: PROF_W, height: PROF_H },
  profile,
  summarySize: { width: SUM_W, height: SUM_H },
  summary,
  compassSize: { width: COMPASS, height: COMPASS },
  compass,
  extras: [ecg, synthStrip],
};

export const cyberFamily: OverlayDefinition[] = makeThemeFamily(cyberKit);
