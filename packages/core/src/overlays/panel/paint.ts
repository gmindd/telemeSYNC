import type { Ctx2D } from '../types.ts';
import type { IconId } from './series.ts';

type RGBA = [number, number, number, number];

/** Parses #rgb, #rrggbb, #rrggbbaa, rgb() and rgba(). Unknown → white. */
export function parseColor(c: string): RGBA {
  const s = c.trim();
  const hex = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((x) => x + x).join('');
    const n = parseInt(h.slice(0, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
  }
  const fn = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (fn) {
    const p = fn[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [p[0] || 0, p[1] || 0, p[2] || 0, p.length > 3 && Number.isFinite(p[3]) ? p[3] : 1];
  }
  return [255, 255, 255, 1];
}

function rgba([r, g, b, a]: RGBA): string {
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${Math.round(a * 1000) / 1000})`;
}

/** Colour between `a` (f = 0) and `b` (f = 1), optionally with a new alpha. */
export function mixColor(a: string, b: string, f: number, alpha?: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  const k = Math.max(0, Math.min(1, f));
  const m = ca.map((v, i) => v + (cb[i] - v) * k) as RGBA;
  if (alpha !== undefined) m[3] = alpha;
  return rgba(m);
}

export function withAlpha(c: string, alpha: number): string {
  const p = parseColor(c);
  p[3] = alpha;
  return rgba(p);
}

/** Closed polygon through `pts` ([x, y] pairs). */
export function polygon(ctx: Ctx2D, pts: number[][]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

/**
 * Small vector icons, centred on (cx, cy) and `s` px tall, painted with `paint`
 * (a colour or gradient). Shapes are kept simple so they read well when small.
 */
export function drawIcon(ctx: Ctx2D, icon: IconId, cx: number, cy: number, s: number, paint: unknown): void {
  const P = (pts: number[][]) => polygon(ctx, pts.map(([x, y]) => [cx + x * s, cy + y * s]));
  const line = (pts: number[][]) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(cx + x * s, cy + y * s) : ctx.moveTo(cx + x * s, cy + y * s)));
    ctx.stroke();
  };
  ctx.save();
  ctx.fillStyle = paint;
  ctx.strokeStyle = paint;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.5, s * 0.1);
  switch (icon) {
    case 'gauge': {
      ctx.beginPath();
      ctx.arc(cx, cy + s * 0.1, s * 0.42, Math.PI * 0.8, Math.PI * 2.2);
      ctx.stroke();
      line([[0, 0.1], [0.24, -0.14]]);
      ctx.beginPath();
      ctx.arc(cx, cy + s * 0.1, s * 0.09, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'bolt':
      P([[0.12, -0.5], [-0.26, 0.06], [-0.02, 0.06], [-0.12, 0.5], [0.26, -0.08], [0.02, -0.08]]);
      ctx.fill();
      break;
    case 'thermo': {
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.1, cy + s * 0.12);
      ctx.lineTo(cx - s * 0.1, cy - s * 0.32);
      ctx.arc(cx, cy - s * 0.32, s * 0.1, Math.PI, 0);
      ctx.lineTo(cx + s * 0.1, cy + s * 0.12);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy + s * 0.27, s * 0.19, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy + s * 0.27, s * 0.1, 0, Math.PI * 2);
      ctx.fill();
      line([[0, 0.2], [0, -0.22]]);
      break;
    }
    case 'heart':
      ctx.beginPath();
      ctx.moveTo(cx, cy + s * 0.4);
      ctx.bezierCurveTo(cx - s * 0.6, cy + s * 0.02, cx - s * 0.34, cy - s * 0.55, cx, cy - s * 0.2);
      ctx.bezierCurveTo(cx + s * 0.34, cy - s * 0.55, cx + s * 0.6, cy + s * 0.02, cx, cy + s * 0.4);
      ctx.closePath();
      ctx.fill();
      break;
    case 'cadence':
      ctx.beginPath();
      ctx.arc(cx - s * 0.06, cy - s * 0.06, s * 0.3, 0, Math.PI * 2);
      ctx.stroke();
      line([[-0.06, -0.06], [0.26, 0.3]]);
      line([[0.12, 0.34], [0.42, 0.34]]);
      ctx.beginPath();
      ctx.arc(cx - s * 0.06, cy - s * 0.06, s * 0.09, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'mountain':
      P([[-0.5, 0.34], [-0.13, -0.3], [0.05, -0.02], [0.2, -0.18], [0.5, 0.34]]);
      ctx.fill();
      break;
    case 'grade':
      P([[-0.46, 0.3], [0.46, 0.3], [0.46, -0.32]]);
      ctx.fill();
      break;
    case 'up':
      P([[0, -0.32], [0.36, 0.28], [-0.36, 0.28]]);
      ctx.fill();
      break;
    case 'down':
      P([[0, 0.32], [0.36, -0.28], [-0.36, -0.28]]);
      ctx.fill();
      break;
    case 'trend':
      line([[-0.44, 0.26], [-0.14, -0.04], [0.06, 0.12], [0.34, -0.18]]);
      P([[0.46, -0.32], [0.44, -0.04], [0.18, -0.3]]);
      ctx.fill();
      break;
    case 'accel':
      ctx.lineWidth = Math.max(2, s * 0.13);
      line([[-0.36, -0.28], [-0.06, 0], [-0.36, 0.28]]);
      line([[0.04, -0.28], [0.34, 0], [0.04, 0.28]]);
      break;
    case 'zone':
      ctx.fillRect(cx - s * 0.42, cy + s * 0.06, s * 0.2, s * 0.26);
      ctx.fillRect(cx - s * 0.1, cy - s * 0.12, s * 0.2, s * 0.44);
      ctx.fillRect(cx + s * 0.22, cy - s * 0.32, s * 0.2, s * 0.64);
      break;
    case 'clock':
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.42, 0, Math.PI * 2);
      ctx.stroke();
      line([[0, -0.24], [0, 0], [0.18, 0.12]]);
      break;
    case 'link': {
      // Two interlocked chain links, tilted.
      ctx.lineWidth = Math.max(2, s * 0.12);
      const link = (ox: number, oy: number) => {
        ctx.beginPath();
        const a = -Math.PI / 4;
        const ux = Math.cos(a);
        const uy = Math.sin(a);
        const half = s * 0.16;
        const r = s * 0.13;
        const x0 = cx + ox * s - ux * half;
        const y0 = cy + oy * s - uy * half;
        const x1 = cx + ox * s + ux * half;
        const y1 = cy + oy * s + uy * half;
        ctx.arc(x0, y0, r, a + Math.PI / 2, a + (Math.PI * 3) / 2);
        ctx.arc(x1, y1, r, a - Math.PI / 2, a + Math.PI / 2);
        ctx.closePath();
        ctx.stroke();
      };
      link(-0.13, 0.13);
      link(0.13, -0.13);
      break;
    }
    case 'sun':
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.2, 0, Math.PI * 2);
      ctx.fill();
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        line([[Math.cos(a) * 0.31, Math.sin(a) * 0.31], [Math.cos(a) * 0.46, Math.sin(a) * 0.46]]);
      }
      break;
  }
  ctx.restore();
}
