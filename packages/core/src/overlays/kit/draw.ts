import type { RideData } from '../../telemetry/ride.ts';
import { drawText, font, measureTabular } from '../draw.ts';
import type { Ctx2D, OverlayStyle } from '../types.ts';
import { convert } from '../units.ts';

// Drawing helpers shared by the kit themes.

export { rrect, spaced } from '../glass/material.ts';

export const noShadow = (ctx: Ctx2D) => {
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
};

export function line(ctx: Ctx2D, x0: number, y0: number, x1: number, y1: number) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/** Font size (≤ max) at which `template` fits `maxW` px with `weight`. */
export function fitFont(ctx: Ctx2D, style: OverlayStyle, template: string, maxW: number, max: number, weight: number): number {
  ctx.font = font(style, max, weight);
  return Math.min(max, (max * maxW) / Math.max(1, measureTabular(ctx, template)));
}

/** Value and unit on one baseline, the group aligned at x. Returns the total width. */
export function valueUnit(
  ctx: Ctx2D,
  value: string,
  unit: string,
  x: number,
  y: number,
  ts: OverlayStyle,
  o: { size: number; weight: number; unitSize?: number; unitWeight?: number; color?: string; unitColor?: string; align?: 'left' | 'center' | 'right'; gap?: number },
): number {
  ctx.font = font(ts, o.size, o.weight);
  const vw = measureTabular(ctx, value);
  const us = o.unitSize ?? o.size * 0.45;
  const gap = unit ? (o.gap ?? us * 0.3) : 0;
  ctx.font = font(ts, us, o.unitWeight ?? 600);
  const uw = unit ? ctx.measureText(unit).width : 0;
  const total = vw + gap + uw;
  const left = o.align === 'right' ? x - total : o.align === 'center' ? x - total / 2 : x;
  drawText(ctx, value, left, y, ts, { size: o.size, weight: o.weight, color: o.color });
  if (unit) drawText(ctx, unit, left + vw + gap, y, ts, { size: us, weight: o.unitWeight ?? 600, tabular: false, color: o.unitColor ?? o.color });
  return total;
}

// ---------------------------------------------------------------------------------------------
// Whole-ride elevation profile, for themes that draw their own profile card or strip.

export interface RideProfile {
  /** Fraction of the ride distance (0..1) and altitude in display units, per kept point. */
  fx: Float64Array;
  alt: Float64Array;
  lo: number;
  hi: number;
  /** Ride distance, m. */
  total: number;
}

const profileCache = new WeakMap<RideData, Map<string, RideProfile>>();

/** About `points` points along the ride; lo/hi padded a little so the line never touches the frame. */
export function rideProfile(ride: RideData, style: OverlayStyle, points = 400): RideProfile {
  let byRide = profileCache.get(ride);
  if (!byRide) profileCache.set(ride, (byRide = new Map()));
  const key = `${style.units.system}:${points}`;
  const hit = byRide.get(key);
  if (hit) return hit;
  const n = ride.t.length;
  const total = Math.max(1, ride.distance[n - 1]);
  const fx: number[] = [];
  const alt: number[] = [];
  let lo = Infinity;
  let hi = -Infinity;
  let last = -Infinity;
  for (let i = 0; i < n; i++) {
    const a = convert.elevation(ride.altitude[i], style.units);
    if (Number.isNaN(a)) continue;
    const f = ride.distance[i] / total;
    if (f - last < 1 / points && i !== n - 1) continue;
    fx.push(f);
    alt.push(a);
    lo = Math.min(lo, a);
    hi = Math.max(hi, a);
    last = f;
  }
  if (!Number.isFinite(lo)) {
    lo = 0;
    hi = 100;
  }
  const pad = Math.max(10, (hi - lo) * 0.08);
  const p = { fx: Float64Array.from(fx), alt: Float64Array.from(alt), lo: lo - pad, hi: hi + pad, total };
  byRide.set(key, p);
  return p;
}

/** Traces the profile between fractions `from` and `to` as a polyline (no beginPath). Returns false when empty. */
export function traceProfile(ctx: Ctx2D, pr: RideProfile, X: (f: number) => number, Y: (a: number) => number, from = 0, to = 1): boolean {
  let pen = false;
  for (let k = 0; k < pr.fx.length; k++) {
    if (pr.fx[k] < from) continue;
    if (pr.fx[k] > to) break;
    if (pen) ctx.lineTo(X(pr.fx[k]), Y(pr.alt[k]));
    else ctx.moveTo(X(pr.fx[k]), Y(pr.alt[k]));
    pen = true;
  }
  return pen;
}

/** Altitude (display units) of the profile at fraction f, interpolated. */
export function profileAt(pr: RideProfile, f: number): number {
  const n = pr.fx.length;
  if (!n) return NaN;
  if (f <= pr.fx[0]) return pr.alt[0];
  for (let k = 1; k < n; k++) {
    if (pr.fx[k] >= f) {
      const t = (f - pr.fx[k - 1]) / (pr.fx[k] - pr.fx[k - 1] || 1);
      return pr.alt[k - 1] + (pr.alt[k] - pr.alt[k - 1]) * t;
    }
  }
  return pr.alt[n - 1];
}
