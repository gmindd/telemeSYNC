import type { RideData } from '../../telemetry/ride.ts';
import { drawText, font } from '../draw.ts';
import { withAlpha } from '../panel/paint.ts';
import { niceStep } from '../panel/series.ts';
import type { Ctx2D, OverlayDefinition, OverlayStyle } from '../types.ts';
import { convert, fmt } from '../units.ts';
import { dialPaint } from './common.ts';
import { elevationLossAt } from './dials.ts';

// Whole-ride elevation profile in a dark card: axes in the ride's units, gain/loss so far,
// travelled part bright, the rest dimmed.
const W = 600;
const H = 240;
const R = 16;
/** Transparent margin around the cards (keeps the anti-aliased border inside the frame). */
const M = 6;
const PX0 = 66;
const PX1 = W - 26;
const PY0 = 62;
const PY1 = H - 44;

/** Rounded rectangle path (the 2D context surface has no roundRect). */
export function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - r);
  ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}

/** Card background shared by the profile and the compact panel. */
export function drawCard(ctx: Ctx2D, w: number, h: number, style: OverlayStyle) {
  const op = Math.max(0, Math.min(1, style.panelOpacity ?? 0.8));
  roundRect(ctx, M, M, w - M * 2, h - M * 2, R);
  if (op > 0.02) {
    ctx.fillStyle = `rgba(9,12,17,${op})`;
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

interface Profile {
  xs: Float64Array;
  /** Altitude in display units per point. */
  alt: Float64Array;
  idx: Int32Array;
  lo: number;
  hi: number;
  step: number;
  total: number;
}

const cache = new WeakMap<RideData, Map<string, Profile>>();

function profileOf(ride: RideData, style: OverlayStyle): Profile {
  const key = style.units.system;
  let byRide = cache.get(ride);
  if (!byRide) cache.set(ride, (byRide = new Map()));
  const hit = byRide.get(key);
  if (hit) return hit;
  const n = ride.t.length;
  const total = Math.max(1, ride.distance[n - 1]);
  let mn = Infinity;
  let mx = -Infinity;
  for (let i = 0; i < n; i++) {
    const a = convert.elevation(ride.altitude[i], style.units);
    if (a < mn) mn = a;
    if (a > mx) mx = a;
  }
  if (!Number.isFinite(mn)) {
    mn = 0;
    mx = 100;
  }
  const step = niceStep(Math.max(20, mx - mn) / 3);
  const lo = Math.floor(mn / step) * step;
  const hi = Math.max(lo + step * 2, Math.ceil(mx / step) * step);
  const xs: number[] = [];
  const alt: number[] = [];
  const idx: number[] = [];
  let lastX = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = PX0 + (ride.distance[i] / total) * (PX1 - PX0);
    if (x - lastX < 0.7 && i !== n - 1) continue;
    const a = convert.elevation(ride.altitude[i], style.units);
    xs.push(x);
    alt.push(Number.isNaN(a) ? lo : a);
    idx.push(i);
    lastX = x;
  }
  const p = { xs: Float64Array.from(xs), alt: Float64Array.from(alt), idx: Int32Array.from(idx), lo, hi, step, total };
  byRide.set(key, p);
  return p;
}

export const dialProfileOverlay: OverlayDefinition = {
  id: 'dialProfile',
  label: 'Perfil de altimetria (cartão)',
  requires: 'elevationProfile',
  textOnly: false,
  size: () => ({ width: W, height: H }),
  draw: (ctx: Ctx2D, frame, style, octx) => {
    const ride = octx.ride;
    const pr = profileOf(ride, style);
    const pt = dialPaint(style);
    const accent = style.accentColor;
    const s = frame.sample;
    const ts = frame.textSample;
    const before = s.outside && s.t < ride.startTime;
    const Y = (a: number) => PY1 - ((a - pr.lo) / (pr.hi - pr.lo)) * (PY1 - PY0);
    const curX = before ? PX0 : PX0 + (Math.min(s.distance, pr.total) / pr.total) * (PX1 - PX0);
    const curA = convert.elevation(s.altitude, style.units);

    drawCard(ctx, W, H, style);

    // Header: title, gain and loss so far.
    drawText(ctx, 'ALTITUDE', 26, 40, pt.ts, { size: 20, weight: 800, tabular: false });
    const u = convert.elevationUnit(style.units);
    const gain = before ? NaN : convert.elevation(ts.elevationGain, style.units);
    const loss = before ? NaN : convert.elevation(elevationLossAt(ride, ts), style.units);
    const items: [string, string][] = [['GANHO', `${fmt(gain, 0)} ${u}`], ['PERDA', `${fmt(loss, 0)} ${u}`]];
    let x = W - 26;
    for (const [label, value] of items.reverse()) {
      x -= drawText(ctx, value, x, 40, pt.ts, { size: 17, weight: 800, align: 'right' }) + 7;
      ctx.font = font(pt.ts, 13, 700);
      x -= drawText(ctx, label, x, 40, pt.ts, { size: 13, weight: 700, align: 'right', tabular: false, color: pt.label }) + 18;
    }

    // Grid and axes.
    ctx.lineWidth = 1;
    for (let a = pr.lo; a <= pr.hi + 1e-9; a += pr.step) {
      const y = Y(a);
      ctx.beginPath();
      ctx.moveTo(PX0, y);
      ctx.lineTo(PX1, y);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.stroke();
      drawText(ctx, fmt(a, 0), PX0 - 10, y + 5, pt.ts, { size: 13, weight: 600, align: 'right', color: pt.label });
    }
    const totalU = convert.distance(pr.total, style.units);
    const dStep = niceStep(totalU / 5);
    const du = convert.distanceUnit(style.units);
    for (let d = 0; d <= totalU - dStep * 0.4; d += dStep) {
      const xx = PX0 + (d / totalU) * (PX1 - PX0);
      drawText(ctx, d === 0 ? `0 ${du}` : fmt(d, 0), xx, H - 20, pt.ts, { size: 13, weight: 600, align: d === 0 ? 'left' : 'center', color: pt.label });
    }
    drawText(ctx, fmt(totalU, 1), PX1, H - 20, pt.ts, { size: 13, weight: 700, align: 'right', color: pt.label });

    // Terrain area and ridge line.
    const area = (toX: number) => {
      ctx.beginPath();
      ctx.moveTo(pr.xs[0], PY1);
      let k = 0;
      for (; k < pr.xs.length && pr.xs[k] <= toX; k++) ctx.lineTo(pr.xs[k], Y(pr.alt[k]));
      if (toX < PX1 && Number.isFinite(curA)) ctx.lineTo(toX, Y(curA));
      ctx.lineTo(Math.min(toX, pr.xs[pr.xs.length - 1]), PY1);
      ctx.closePath();
    };
    const ridge = (fromX: number, toX: number, end?: boolean) => {
      ctx.beginPath();
      let pen = false;
      for (let k = 0; k < pr.xs.length; k++) {
        if (pr.xs[k] < fromX) continue;
        if (pr.xs[k] > toX) break;
        if (!pen && fromX > PX0 && Number.isFinite(curA)) {
          ctx.moveTo(fromX, Y(curA));
          pen = true;
        }
        if (pen) ctx.lineTo(pr.xs[k], Y(pr.alt[k]));
        else ctx.moveTo(pr.xs[k], Y(pr.alt[k]));
        pen = true;
      }
      if (end && pen && Number.isFinite(curA)) ctx.lineTo(toX, Y(curA));
    };
    area(Infinity);
    const terrain = ctx.createLinearGradient(0, PY0, 0, PY1);
    terrain.addColorStop(0, 'rgba(120,88,64,0.75)');
    terrain.addColorStop(1, 'rgba(40,30,24,0.35)');
    ctx.fillStyle = terrain;
    ctx.fill();
    if (curX > PX0) {
      area(curX);
      const done = ctx.createLinearGradient(0, PY0, 0, PY1);
      done.addColorStop(0, withAlpha(accent, 0.45));
      done.addColorStop(1, withAlpha(accent, 0.05));
      ctx.fillStyle = done;
      ctx.fill();
    }
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ridge(curX, Infinity);
    ctx.strokeStyle = withAlpha(accent, 0.45);
    ctx.lineWidth = 2.5;
    ctx.stroke();
    if (curX > PX0) {
      ridge(-Infinity, curX, true);
      ctx.shadowColor = withAlpha(accent, 0.85);
      ctx.shadowBlur = 10;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.shadowColor = 'rgba(0,0,0,0)';
      ctx.shadowBlur = 0;
    }

    // Current position.
    if (!before && Number.isFinite(curA)) {
      const y = Y(curA);
      ctx.beginPath();
      ctx.moveTo(curX, y + 8);
      ctx.lineTo(curX, PY1);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(curX, y, 7, 0, Math.PI * 2);
      ctx.shadowColor = withAlpha(accent, 0.95);
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.shadowColor = 'rgba(0,0,0,0)';
      ctx.shadowBlur = 0;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  },
};
