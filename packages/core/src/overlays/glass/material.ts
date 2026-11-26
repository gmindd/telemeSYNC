import { drawText, font, measureTabular } from '../draw.ts';
import { mixColor, withAlpha } from '../panel/paint.ts';
import type { Ctx2D, OverlayStyle } from '../types.ts';

// "Glass" theme: frosted, see-through gadgets. Each shape is a light tint (so the numbers read over any
// video) under a white frost that is brighter at the top, a 1 px hairline rim with a specular highlight on
// its top edge, and a soft shadow that lifts it off the picture. Values are drawn with thin luminous arcs
// and lines in a small palette of soft hues, numbers in a light weight, labels small, uppercase and spaced.

/** Transparent margin each glass shape keeps around it, so its soft shadow is never cut by the frame. */
export const SHADOW_PAD = 10;

/** Accent pairs (deep → light) of the theme. */
export const GLASS = {
  ice: { from: '#3fb6ff', to: '#c4efff' },
  rose: { from: '#ff5c8a', to: '#ffc6d6' },
  lilac: { from: '#a678ff', to: '#e8d6ff' },
  mint: { from: '#2fe0a0', to: '#c6ffe7' },
  amber: { from: '#ffa53d', to: '#ffe2ad' },
  pearl: { from: '#9fb0c4', to: '#ffffff' },
} as const;

export type GlassHue = keyof typeof GLASS;
export interface Hue {
  from: string;
  to: string;
}

/** Light colour of a hue (icons, dots, the lit part of a line). */
export const hueLight = (h: Hue) => mixColor(h.from, h.to, 0.55);

export interface GlassPaint {
  /** Text style: no outline, a soft shadow for legibility over bright video. */
  ts: OverlayStyle;
  /** Dark tint under the frost (alpha from the panel background opacity). */
  tint: number;
  label: string;
  faint: string;
  hairline: string;
}

export function glassPaint(style: OverlayStyle): GlassPaint {
  const op = Math.max(0, Math.min(1, style.panelOpacity ?? 0.8));
  return {
    ts: { ...style, outlineWidth: 0, shadow: true },
    tint: 0.08 + 0.3 * op,
    label: 'rgba(255,255,255,0.72)',
    faint: 'rgba(255,255,255,0.5)',
    hairline: 'rgba(255,255,255,0.14)',
  };
}

/** Rounded-rectangle path. */
export function rrect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.lineTo(x + w - k, y);
  ctx.arc(x + w - k, y + k, k, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - k);
  ctx.arc(x + w - k, y + h - k, k, 0, Math.PI / 2);
  ctx.lineTo(x + k, y + h);
  ctx.arc(x + k, y + h - k, k, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + k);
  ctx.arc(x + k, y + k, k, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}

const noShadow = (ctx: Ctx2D) => {
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
};

/** Fills the current path as frosted glass between y0 (top) and y1 (bottom), with a drop shadow. */
function frost(ctx: Ctx2D, p: GlassPaint, y0: number, y1: number, glow?: Hue) {
  // Tint, carrying the drop shadow.
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.26)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = `rgba(16,22,32,${p.tint})`;
  ctx.fill();
  ctx.restore();
  // White frost: bright at the top, clear in the middle, a little light bounce at the bottom.
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, 'rgba(255,255,255,0.20)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.07)');
  g.addColorStop(0.8, 'rgba(255,255,255,0.04)');
  g.addColorStop(1, 'rgba(255,255,255,0.10)');
  ctx.fillStyle = g;
  ctx.fill();
  if (glow) {
    // A faint wash of the gadget's hue from the bottom, like light passing through tinted glass.
    const c = ctx.createLinearGradient(0, y1, 0, y0);
    c.addColorStop(0, withAlpha(glow.from, 0.16));
    c.addColorStop(0.6, withAlpha(glow.from, 0));
    ctx.fillStyle = c;
    ctx.fill();
  }
}

/** Frosted glass disc with hairline rim and a specular highlight along the top. */
export function glassDisc(ctx: Ctx2D, cx: number, cy: number, r: number, p: GlassPaint, glow?: Hue) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  frost(ctx, p, cy - r, cy + r, glow);
  // Glossy reflection in the upper half.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  const gl = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.95, r * 0.05, cx - r * 0.1, cy - r * 0.6, r * 0.95);
  gl.addColorStop(0, 'rgba(255,255,255,0.16)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gl;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
  // Hairline rims.
  ctx.beginPath();
  ctx.arc(cx, cy, r - 0.6, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.30)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Specular edge: bright in the top-left, fading both ways.
  ctx.lineCap = 'round';
  const steps = 24;
  const a0 = -Math.PI * 0.95;
  const a1 = -Math.PI * 0.2;
  for (let k = 0; k < steps; k++) {
    const f = (k + 0.5) / steps;
    const a = Math.sin(Math.PI * f) ** 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 1, a0 + ((a1 - a0) * k) / steps, a0 + ((a1 - a0) * (k + 1)) / steps + 0.01);
    ctx.strokeStyle = `rgba(255,255,255,${0.75 * a})`;
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
  // Soft light caught on the bottom-right edge.
  ctx.beginPath();
  ctx.arc(cx, cy, r - 1, Math.PI * 0.1, Math.PI * 0.55);
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

/** Frosted glass rounded rectangle (cards, panels, chips). */
export function glassRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number, p: GlassPaint, glow?: Hue) {
  rrect(ctx, x, y, w, h, r);
  frost(ctx, p, y, y + h, glow);
  rrect(ctx, x + 0.6, y + 0.6, w - 1.2, h - 1.2, r);
  ctx.strokeStyle = 'rgba(255,255,255,0.26)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // Specular top edge: a hairline brightest a third of the way across.
  const k = Math.min(r, w / 2, h / 2);
  const sg = ctx.createLinearGradient(x, 0, x + w, 0);
  sg.addColorStop(0, 'rgba(255,255,255,0.15)');
  sg.addColorStop(0.3, 'rgba(255,255,255,0.8)');
  sg.addColorStop(0.75, 'rgba(255,255,255,0.18)');
  sg.addColorStop(1, 'rgba(255,255,255,0.05)');
  ctx.beginPath();
  ctx.arc(x + k, y + k, k - 1, Math.PI * 1.15, Math.PI * 1.5);
  ctx.lineTo(x + w - k, y + 1);
  ctx.strokeStyle = sg;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** Hairline divider. */
export function hairline(ctx: Ctx2D, x0: number, y0: number, x1: number, y1: number, alpha = 0.14) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
  ctx.lineWidth = 1;
  ctx.stroke();
}

/**
 * Thin luminous arc on a hairline track: from fraction f0 to f1 of the sweep (start angle a0, sweep),
 * colour running from hue.from to hue.to along the whole sweep, with a white glowing tip at `tip`.
 */
export function glassArc(ctx: Ctx2D, cx: number, cy: number, r: number, w: number, a0: number, sweep: number, hue: Hue, f0: number, f1: number, tip: number) {
  const ang = (f: number) => a0 + sweep * f;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, ang(0), ang(1));
  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.lineWidth = w;
  ctx.stroke();
  const a = Math.max(0, Math.min(1, Math.min(f0, f1)));
  const b = Math.max(0, Math.min(1, Math.max(f0, f1)));
  if (b - a > 0.002) {
    // Glow pass, then the colour in short pieces so it follows the sweep.
    ctx.beginPath();
    ctx.arc(cx, cy, r, ang(a), ang(b));
    ctx.shadowColor = withAlpha(hue.from, 0.9);
    ctx.shadowBlur = 16;
    ctx.strokeStyle = withAlpha(hueLight(hue), 0.6);
    ctx.lineWidth = w;
    ctx.stroke();
    noShadow(ctx);
    ctx.lineCap = 'butt';
    const step = 1 / 120;
    for (let s = a; s < b; s += step) {
      const e = Math.min(b, s + step);
      ctx.beginPath();
      ctx.arc(cx, cy, r, ang(s), Math.min(ang(b), ang(e) + 0.01));
      ctx.strokeStyle = mixColor(hue.from, hue.to, (s + e) / 2);
      ctx.stroke();
    }
    // Rounded ends.
    ctx.lineCap = 'round';
    for (const f of [a, b]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, ang(f) - 0.001, ang(f) + 0.001);
      ctx.strokeStyle = mixColor(hue.from, hue.to, f);
      ctx.stroke();
    }
  }
  if (Number.isFinite(tip)) {
    const t = ang(Math.max(0, Math.min(1, tip)));
    glowDot(ctx, cx + Math.cos(t) * r, cy + Math.sin(t) * r, w * 0.75 + 1, hue);
  }
}

/** White dot with a coloured halo (current value, current position). */
export function glowDot(ctx: Ctx2D, x: number, y: number, r: number, hue: Hue) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.shadowColor = withAlpha(hue.from, 1);
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  noShadow(ctx);
}

/** Small uppercase label with wide letter spacing. Returns its width. */
export function spaced(
  ctx: Ctx2D,
  text: string,
  x: number,
  y: number,
  ts: OverlayStyle,
  opts: { size: number; weight?: number; color?: string; align?: 'left' | 'right' | 'center'; spacing?: number; maxW?: number },
): number {
  const lang = ts.language;
  const t = text.toLocaleUpperCase(lang);
  let size = opts.size;
  let sp = (opts.spacing ?? 0.18) * size;
  const weight = opts.weight ?? 600;
  const widthAt = () => {
    ctx.font = font(ts, size, weight);
    let w = 0;
    for (const ch of t) w += ctx.measureText(ch).width + sp;
    return Math.max(0, w - sp);
  };
  let w = widthAt();
  if (opts.maxW && w > opts.maxW) {
    // Long labels (German, French): tighten the spacing first, then shrink.
    sp *= 0.4;
    w = widthAt();
    if (w > opts.maxW) {
      size = Math.max(size * 0.7, (size * opts.maxW) / w);
      w = widthAt();
    }
  }
  let cx = opts.align === 'right' ? x - w : opts.align === 'center' ? x - w / 2 : x;
  for (const ch of t) {
    drawText(ctx, ch, cx, y, ts, { size, weight, color: opts.color ?? 'rgba(255,255,255,0.72)', tabular: false });
    ctx.font = font(ts, size, weight);
    cx += ctx.measureText(ch).width + sp;
  }
  return w;
}

/** Number with its unit after it (smaller), centred or aligned as a group. Returns the total width. */
export function valueWithUnit(
  ctx: Ctx2D,
  value: string,
  unit: string,
  x: number,
  y: number,
  p: GlassPaint,
  opts: { size: number; weight?: number; unitSize?: number; align?: 'left' | 'right' | 'center'; color?: string; unitColor?: string },
): number {
  const weight = opts.weight ?? 400;
  ctx.font = font(p.ts, opts.size, weight);
  const vw = measureTabular(ctx, value);
  const us = opts.unitSize ?? opts.size * 0.42;
  ctx.font = font(p.ts, us, 400);
  const uw = unit ? ctx.measureText(unit).width + us * 0.35 : 0;
  const total = vw + uw;
  const left = opts.align === 'right' ? x - total : opts.align === 'center' ? x - total / 2 : x;
  drawText(ctx, value, left, y, p.ts, { size: opts.size, weight, color: opts.color });
  if (unit) drawText(ctx, unit, left + vw + us * 0.35, y, p.ts, { size: us, weight: 400, tabular: false, color: opts.unitColor ?? p.label });
  return total;
}

/** Zone colour lightened for text, so a red or blue zone still reads on tinted glass. */
export const zoneText = (c: string) => mixColor(c, '#ffffff', 0.45);

/** Row of rounded zone pills, the current one lit in its colour with a glow. */
export function zonePills(ctx: Ctx2D, x: number, y: number, w: number, h: number, colors: string[], current: number) {
  const n = colors.length;
  const gap = Math.max(3, h * 0.6);
  const pw = (w - gap * (n - 1)) / n;
  for (let k = 0; k < n; k++) {
    const px = x + k * (pw + gap);
    rrect(ctx, px, y, pw, h, h / 2);
    if (k === current) {
      ctx.shadowColor = withAlpha(colors[k], 0.95);
      ctx.shadowBlur = 12;
      ctx.fillStyle = mixColor(colors[k], '#ffffff', 0.25);
      ctx.fill();
      noShadow(ctx);
    } else {
      ctx.fillStyle = k < current ? withAlpha(colors[k], 0.38) : 'rgba(255,255,255,0.16)';
      ctx.fill();
    }
  }
}
