import type { Ctx2D } from '../types.ts';

// Thin outline icons of the glass dials (stroke only, rounded), centred on (cx, cy), about s px tall.
export type LineIcon = 'grade' | 'thermo' | 'route' | 'stopwatch' | 'heart' | 'cadence' | 'gauge' | 'bolt' | 'mountain';

export function lineIcon(ctx: Ctx2D, icon: LineIcon, cx: number, cy: number, s: number, color: string) {
  const X = (v: number) => cx + v * s;
  const Y = (v: number) => cy + v * s;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.4, s * 0.06);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 4;
  ctx.beginPath();
  switch (icon) {
    case 'grade':
      ctx.moveTo(X(-0.62), Y(0.3));
      ctx.lineTo(X(0.62), Y(0.3));
      ctx.lineTo(X(0.62), Y(-0.3));
      ctx.closePath();
      ctx.stroke();
      break;
    case 'thermo': {
      const r = 0.15;
      ctx.moveTo(X(-0.1), Y(0.18));
      ctx.lineTo(X(-0.1), Y(-0.38));
      ctx.arc(X(0), Y(-0.38), 0.1 * s, Math.PI, 0);
      ctx.lineTo(X(0.1), Y(0.18));
      ctx.arc(X(0), Y(0.32), r * 1.45 * s, -Math.PI / 2 + 0.75, Math.PI * 1.5 - 0.75);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(X(0), Y(0.32), 0.1 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(X(0), Y(0.24));
      ctx.lineTo(X(0), Y(-0.12));
      ctx.stroke();
      break;
    }
    case 'route': {
      // Two map pins joined by a winding path.
      const pin = (px: number, py: number) => {
        ctx.beginPath();
        ctx.arc(X(px), Y(py - 0.12), 0.13 * s, Math.PI * 0.8, Math.PI * 2.2);
        ctx.lineTo(X(px), Y(py + 0.1));
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(X(px), Y(py - 0.12), 0.045 * s, 0, Math.PI * 2);
        ctx.fill();
      };
      pin(-0.55, -0.02);
      pin(0.55, -0.12);
      ctx.beginPath();
      ctx.moveTo(X(-0.55), Y(0.14));
      ctx.bezierCurveTo(X(-0.4), Y(0.42), X(-0.18), Y(0.38), X(0), Y(0.24));
      ctx.bezierCurveTo(X(0.18), Y(0.1), X(0.42), Y(0.26), X(0.55), Y(0.04));
      ctx.stroke();
      break;
    }
    case 'stopwatch':
      ctx.arc(X(0), Y(0.08), 0.36 * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(X(-0.1), Y(-0.44));
      ctx.lineTo(X(0.1), Y(-0.44));
      ctx.moveTo(X(0), Y(-0.44));
      ctx.lineTo(X(0), Y(-0.28));
      ctx.moveTo(X(0.27), Y(-0.24));
      ctx.lineTo(X(0.34), Y(-0.31));
      ctx.moveTo(X(0), Y(0.08));
      ctx.lineTo(X(0), Y(-0.14));
      ctx.moveTo(X(0), Y(0.08));
      ctx.lineTo(X(0.12), Y(0.16));
      ctx.stroke();
      break;
    case 'heart':
      ctx.moveTo(X(0), Y(0.36));
      ctx.bezierCurveTo(X(-0.62), Y(0), X(-0.36), Y(-0.52), X(0), Y(-0.2));
      ctx.bezierCurveTo(X(0.36), Y(-0.52), X(0.62), Y(0), X(0), Y(0.36));
      ctx.closePath();
      ctx.stroke();
      break;
    case 'cadence': {
      // Turning arrow around a crank axle (revolutions per minute).
      const r = 0.36 * s;
      const a0 = -Math.PI * 0.35;
      const a1 = Math.PI * 1.35;
      ctx.arc(cx, cy, r, a0, a1);
      ctx.stroke();
      const ex = cx + Math.cos(a1) * r;
      const ey = cy + Math.sin(a1) * r;
      const tx = -Math.sin(a1);
      const ty = Math.cos(a1);
      const h = 0.16 * s;
      ctx.beginPath();
      ctx.moveTo(ex + tx * h * 0.9, ey + ty * h * 0.9);
      ctx.lineTo(ex - ty * h * 0.75 - tx * h * 0.3, ey + tx * h * 0.75 - ty * h * 0.3);
      ctx.lineTo(ex + ty * h * 0.75 - tx * h * 0.3, ey - tx * h * 0.75 - ty * h * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, 0.07 * s, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'gauge':
      ctx.arc(X(0), Y(0.14), 0.46 * s, Math.PI * 0.85, Math.PI * 2.15);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(X(0), Y(0.14));
      ctx.lineTo(X(0.22), Y(-0.1));
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(X(0), Y(0.14), 0.05 * s, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'mountain':
      // Two peaks, the higher one with a snow line.
      ctx.moveTo(X(-0.62), Y(0.34));
      ctx.lineTo(X(-0.2), Y(-0.3));
      ctx.lineTo(X(0.02), Y(0.02));
      ctx.lineTo(X(0.22), Y(-0.16));
      ctx.lineTo(X(0.62), Y(0.34));
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(X(-0.34), Y(-0.09));
      ctx.lineTo(X(-0.24), Y(-0.02));
      ctx.lineTo(X(-0.14), Y(-0.12));
      ctx.lineTo(X(-0.06), Y(-0.06));
      ctx.stroke();
      break;
    case 'bolt':
      ctx.moveTo(X(0.1), Y(-0.48));
      ctx.lineTo(X(-0.26), Y(0.06));
      ctx.lineTo(X(-0.02), Y(0.06));
      ctx.lineTo(X(-0.12), Y(0.48));
      ctx.lineTo(X(0.26), Y(-0.08));
      ctx.lineTo(X(0.02), Y(-0.08));
      ctx.closePath();
      ctx.stroke();
      break;
  }
  ctx.restore();
}
