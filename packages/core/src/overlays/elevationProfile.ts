import type { RideData } from '../telemetry/ride.ts';
import { convert, fmt } from './units.ts';
import { tr } from '../i18n/index.ts';
import { dot, drawText } from './draw.ts';
import type { OverlayDefinition } from './types.ts';
import { routeSpan } from './routeRange.ts';

const W = 640;
const H = 200;
const PAD_X = 16;
const PAD_TOP = 40;
const PAD_BOTTOM = 14;

interface Profile {
  /** Decimated points in px. */
  xs: Float64Array;
  ys: Float64Array;
  /** Source index of each point. */
  idx: Int32Array;
  minAlt: number;
  maxAlt: number;
  /** Distance at the start of the part shown, and its length (m). */
  d0: number;
  totalDist: number;
  i0: number;
  i1: number;
}

const cache = new WeakMap<RideData, Map<string, Profile>>();

/** Profile of samples i0..i1 (the part of the ride shown), cached per ride and part. */
function profileOf(ride: RideData, i0: number, i1: number): Profile {
  const key = `${i0}|${i1}`;
  let byRide = cache.get(ride);
  if (!byRide) cache.set(ride, (byRide = new Map()));
  let p = byRide.get(key);
  if (p) return p;
  let minAlt = Infinity;
  let maxAlt = -Infinity;
  for (let i = i0; i <= i1; i++) {
    const a = ride.altitude[i];
    if (a < minAlt) minAlt = a;
    if (a > maxAlt) maxAlt = a;
  }
  if (!Number.isFinite(minAlt)) {
    minAlt = 0;
    maxAlt = 1;
  }
  if (maxAlt - minAlt < 20) {
    const mid = (maxAlt + minAlt) / 2;
    minAlt = mid - 10;
    maxAlt = mid + 10;
  }
  const d0 = ride.distance[i0];
  const totalDist = Math.max(1, ride.distance[i1] - d0);
  const xs: number[] = [];
  const ys: number[] = [];
  const idx: number[] = [];
  let lastX = -Infinity;
  for (let i = i0; i <= i1; i++) {
    const x = PAD_X + ((ride.distance[i] - d0) / totalDist) * (W - PAD_X * 2);
    if (x - lastX < 0.5 && i !== i1) continue;
    const a = Number.isNaN(ride.altitude[i]) ? minAlt : ride.altitude[i];
    xs.push(x);
    ys.push(H - PAD_BOTTOM - ((a - minAlt) / (maxAlt - minAlt)) * (H - PAD_TOP - PAD_BOTTOM));
    idx.push(i);
    lastX = x;
  }
  p = { xs: Float64Array.from(xs), ys: Float64Array.from(ys), idx: Int32Array.from(idx), minAlt, maxAlt, d0, totalDist, i0, i1 };
  byRide.set(key, p);
  return p;
}

export const elevationProfileOverlay: OverlayDefinition = {
  id: 'elevationProfile',
  label: 'Elevation profile',
  requires: 'elevationProfile',
  textOnly: false,
  size: () => ({ width: W, height: H }),
  draw: (ctx, frame, style, octx) => {
    const ride = octx.ride;
    const span = routeSpan(ride, style, octx);
    const p = profileOf(ride, span.i0, span.i1);
    const s = frame.sample;
    const baseY = H - PAD_BOTTOM;
    // Before the part shown: nothing travelled; after it: all of it, without the marker.
    const inside = s.index >= p.i0 && s.index < p.i1 && !s.outside;
    const rel = Math.max(0, Math.min(1, (s.distance - p.d0) / p.totalDist));
    const curX = PAD_X + rel * (W - PAD_X * 2);
    const curY = inside ? baseY - ((s.altitude - p.minAlt) / (p.maxAlt - p.minAlt)) * (H - PAD_TOP - PAD_BOTTOM) : NaN;

    const area = (upToX: number) => {
      ctx.beginPath();
      ctx.moveTo(p.xs[0], baseY);
      for (let k = 0; k < p.xs.length && p.xs[k] <= upToX; k++) ctx.lineTo(p.xs[k], p.ys[k]);
      if (upToX < p.xs[p.xs.length - 1] && Number.isFinite(curY)) ctx.lineTo(upToX, curY);
      ctx.lineTo(Math.min(upToX, p.xs[p.xs.length - 1]), baseY);
      ctx.closePath();
    };
    const line = (fromX: number, toX: number) => {
      ctx.beginPath();
      let started = false;
      for (let k = 0; k < p.xs.length; k++) {
        if (p.xs[k] < fromX) continue;
        if (p.xs[k] > toX) break;
        if (!started) {
          ctx.moveTo(p.xs[k], p.ys[k]);
          started = true;
        } else ctx.lineTo(p.xs[k], p.ys[k]);
      }
      if (started && toX < W && Number.isFinite(curY)) ctx.lineTo(toX, curY);
    };

    ctx.lineJoin = 'round';
    // Whole profile, muted.
    area(Infinity);
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = style.mutedColor;
    ctx.fill();
    ctx.globalAlpha = 1;
    line(-Infinity, Infinity);
    if (style.outlineWidth > 0) {
      ctx.strokeStyle = style.outlineColor;
      ctx.lineWidth = 3 + style.outlineWidth;
      ctx.stroke();
    }
    ctx.strokeStyle = style.mutedColor;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Travelled part.
    const travelledX = (s.outside && s.t < ride.startTime) || s.index < p.i0 ? -1 : curX;
    if (travelledX > PAD_X) {
      area(travelledX);
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = style.accentColor;
      ctx.fill();
      ctx.globalAlpha = 1;
      line(-Infinity, travelledX);
      ctx.strokeStyle = style.accentColor;
      ctx.lineWidth = 3.5;
      ctx.stroke();
    }

    if (Number.isFinite(curY)) {
      dot(ctx, style, curX, curY, 8, style.accentColor);
      dot(ctx, style, curX, curY, 3.5, '#ffffff');
    }

    if (style.showLabel) {
      const alt = frame.textSample.altitude;
      const unit = style.showUnit ? ` ${convert.elevationUnit(style.units)}` : '';
      drawText(ctx, `${fmt(convert.elevation(alt, style.units), 0)}${unit}`, W - PAD_X, 28, style, { size: 26, weight: 700, align: 'right' });
      drawText(ctx, tr(style.language, 'card.elevation'), PAD_X, 26, style, { size: 18, weight: 600, tabular: false });
    }
  },
};
