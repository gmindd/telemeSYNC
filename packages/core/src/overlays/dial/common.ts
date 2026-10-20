import { drawText, font, measureTabular } from '../draw.ts';
import { drawIcon, mixColor, withAlpha } from '../panel/paint.ts';
import type { Ctx2D, OverlayStyle } from '../types.ts';

// Round "dial" gadgets (BTT design): a chainring-like toothed rim, a coloured arc for the
// value and a dark disc with icon, number and unit. Layout at scale 1 (px).
export const DIAL = 300;
export const CX = DIAL / 2;
export const CY = DIAL / 2;
/** Extra height for the row of small numbers under the dial (MÉD/MÁX, TOTAL…). */
export const BELOW_H = 40;
const R_TIP = 147;
const R_ROOT = 138;
export const R_RIM = 134;
export const ARC_R = 122;
export const ARC_W = 12;
export const R_INNER = 109;
const START = Math.PI * 0.75;
const SWEEP = Math.PI * 1.5;

export interface DialColors {
  from: string;
  to: string;
}

export interface DialPaint {
  /** Text style inside the dial: no outline/shadow when the disc is dark enough. */
  ts: OverlayStyle;
  disc: string;
  label: string;
}

export function dialPaint(style: OverlayStyle): DialPaint {
  const op = Math.max(0, Math.min(1, style.panelOpacity ?? 0.8));
  // The disc stays fairly dark even with a light panel background, or the numbers lose contrast.
  const discOp = Math.max(0.35, op);
  return {
    ts: discOp >= 0.35 ? { ...style, outlineWidth: 0, shadow: false } : style,
    disc: `rgba(9,12,17,${Math.min(0.96, discOp + 0.12)})`,
    label: 'rgba(255,255,255,0.62)',
  };
}

export function angleAt(f: number): number {
  return START + SWEEP * f;
}

/** Chainring: `n` trapezoid teeth between the root and tip radius, dark metal. */
function chainring(ctx: Ctx2D, n: number) {
  const pitch = (Math.PI * 2) / n;
  ctx.beginPath();
  for (let k = 0; k < n; k++) {
    const a = k * pitch;
    const pts: [number, number][] = [
      [a - pitch * 0.5, R_ROOT],
      [a - pitch * 0.22, R_ROOT],
      [a - pitch * 0.14, R_TIP],
      [a + pitch * 0.14, R_TIP],
      [a + pitch * 0.22, R_ROOT],
    ];
    pts.forEach(([ang, r], i) => {
      const x = CX + Math.cos(ang) * r;
      const y = CY + Math.sin(ang) * r;
      if (k === 0 && i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(CX - 40, CY - 50, 20, CX, CY, R_TIP);
  g.addColorStop(0, '#4a525c');
  g.addColorStop(0.7, '#2a3038');
  g.addColorStop(1, '#14181d');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

/** Rim, track and disc. `toothed` = BTT chainring; otherwise the plain road ring. */
export function drawDialBase(ctx: Ctx2D, colors: DialColors, p: DialPaint, toothed: boolean) {
  ctx.lineJoin = 'round';
  if (toothed) {
    chainring(ctx, 34);
    // Bolt circle look: a darker band inside the teeth.
    ctx.beginPath();
    ctx.arc(CX, CY, R_RIM, 0, Math.PI * 2);
    ctx.fillStyle = '#0d1116';
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(CX, CY, R_ROOT, 0, Math.PI * 2);
    ctx.fillStyle = '#0d1116';
    ctx.fill();
    ctx.strokeStyle = withAlpha(colors.from, 0.5);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // Track.
  ctx.beginPath();
  ctx.arc(CX, CY, ARC_R, angleAt(0), angleAt(1));
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = ARC_W;
  ctx.lineCap = 'round';
  ctx.stroke();
  // Disc.
  ctx.beginPath();
  ctx.arc(CX, CY, R_INNER, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(CX, CY - 30, 10, CX, CY, R_INNER);
  g.addColorStop(0, withAlpha('#1b2430', 0.98));
  g.addColorStop(1, p.disc);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** Coloured arc from fraction `f0` to `f1` (0..1 of the sweep), with glow and a white tip at `tip`. */
export function drawDialArc(ctx: Ctx2D, colors: DialColors, f0: number, f1: number, tip: number) {
  const a = Math.max(0, Math.min(1, Math.min(f0, f1)));
  const b = Math.max(0, Math.min(1, Math.max(f0, f1)));
  ctx.lineCap = 'round';
  ctx.lineWidth = ARC_W;
  if (b - a > 0.002) {
    ctx.beginPath();
    ctx.arc(CX, CY, ARC_R, angleAt(a), angleAt(b));
    ctx.shadowColor = withAlpha(colors.to, 0.8);
    ctx.shadowBlur = 18;
    ctx.strokeStyle = mixColor(colors.from, colors.to, 0.5);
    ctx.stroke();
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.shadowBlur = 0;
    // Colour runs along the whole sweep, so the arc tip shows how far the value goes.
    ctx.lineCap = 'butt';
    const step = 1 / 120;
    for (let s = a; s < b; s += step) {
      const e = Math.min(b, s + step);
      ctx.beginPath();
      ctx.arc(CX, CY, ARC_R, angleAt(s), Math.min(angleAt(b), angleAt(e) + 0.01));
      ctx.strokeStyle = mixColor(colors.from, colors.to, (s + e) / 2);
      ctx.stroke();
    }
    ctx.lineCap = 'round';
  }
  if (Number.isFinite(tip)) {
    const t = Math.max(0, Math.min(1, tip));
    const x = CX + Math.cos(angleAt(t)) * ARC_R;
    const y = CY + Math.sin(angleAt(t)) * ARC_R;
    ctx.beginPath();
    ctx.arc(x, y, ARC_W / 2 + 1.5, 0, Math.PI * 2);
    ctx.shadowColor = withAlpha(colors.to, 0.95);
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.shadowBlur = 0;
  }
}

/** Font size so that `template` fits `maxW` px. */
export function fitSize(ctx: Ctx2D, style: OverlayStyle, template: string, maxW: number, maxSize: number, weight = 800): number {
  ctx.font = font(style, maxSize, weight);
  return Math.min(maxSize, (maxSize * maxW) / Math.max(1, measureTabular(ctx, template)));
}

export interface BelowItem {
  /** Small grey label, or an up/down triangle in `iconColor`. */
  label?: string;
  icon?: 'up' | 'down';
  iconColor?: string;
  value: string;
}

/** "LABEL value" pairs centred in the row under the dial. */
export function drawBelowRow(ctx: Ctx2D, items: BelowItem[], p: DialPaint) {
  const y = DIAL + BELOW_H - 12;
  const gap = 22;
  const parts = items.map((it) => {
    ctx.font = font(p.ts, 14, 700);
    const lw = it.icon ? 12 : ctx.measureText(it.label ?? '').width;
    ctx.font = font(p.ts, 19, 800);
    const vw = measureTabular(ctx, it.value);
    return { ...it, lw, w: lw + 7 + vw };
  });
  const total = parts.reduce((s, q) => s + q.w, 0) + gap * (parts.length - 1);
  // Dark pill behind the row, so the numbers read over any video.
  const pw = total + 28;
  const top = DIAL + 6;
  const ph = BELOW_H - 10;
  const r = ph / 2;
  ctx.beginPath();
  ctx.arc(CX - pw / 2 + r, top + r, r, Math.PI / 2, Math.PI * 1.5);
  ctx.arc(CX + pw / 2 - r, top + r, r, -Math.PI / 2, Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = p.disc;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.stroke();
  let x = CX - total / 2;
  for (const q of parts) {
    if (q.icon) drawIcon(ctx, q.icon, x + 6, y - 6, 14, q.iconColor ?? '#ffffff');
    else drawText(ctx, q.label ?? '', x, y, p.ts, { size: 14, weight: 700, tabular: false, color: p.label });
    drawText(ctx, q.value, x + q.lw + 7, y, p.ts, { size: 19, weight: 800 });
    x += q.w + gap;
  }
}

/** Row of coloured zone segments inside the dial, the current one bright and outlined. */
export function drawZoneBar(ctx: Ctx2D, y: number, width: number, colors: string[], current: number) {
  const n = colors.length;
  const gap = 3;
  const x0 = CX - width / 2;
  const sw = (width - gap * (n - 1)) / n;
  for (let k = 0; k < n; k++) {
    const x = x0 + k * (sw + gap);
    ctx.globalAlpha = k === current ? 1 : 0.5;
    ctx.fillStyle = colors[k];
    ctx.fillRect(x, y, sw, 7);
    ctx.globalAlpha = 1;
  }
  if (current >= 0) {
    const x = x0 + current * (sw + gap) + sw / 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 2);
    ctx.lineTo(x - 5, y - 9);
    ctx.lineTo(x + 5, y - 9);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
}
