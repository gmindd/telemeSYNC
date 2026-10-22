import type { RideData } from '../telemetry/ride.ts';
import { convert, fmt } from './units.ts';
import { tr } from '../i18n/index.ts';
import { dot, drawText } from './draw.ts';
import type { OverlayDefinition } from './types.ts';

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
  totalDist: number;
}

const cache = new WeakMap<RideData, Profile>();

function profileOf(ride: RideData): Profile {
  let p = cache.get(ride);
  if (p) return p;
  const n = ride.t.length;
  let minAlt = Infinity;
  let maxAlt = -Infinity;
  for (let i = 0; i < n; i++) {
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
  const totalDist = Math.max(1, ride.distance[n - 1]);
  const xs: number[] = [];
  const ys: number[] = [];
  const idx: number[] = [];
  let lastX = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = PAD_X + (ride.distance[i] / totalDist) * (W - PAD_X * 2);
    if (x - lastX < 0.5 && i !== n - 1) continue;
    const a = Number.isNaN(ride.altitude[i]) ? minAlt : ride.altitude[i];
    xs.push(x);
    ys.push(H - PAD_BOTTOM - ((a - minAlt) / (maxAlt - minAlt)) * (H - PAD_TOP - PAD_BOTTOM));
    idx.push(i);
    lastX = x;
  }
  p = { xs: Float64Array.from(xs), ys: Float64Array.from(ys), idx: Int32Array.from(idx), minAlt, maxAlt, totalDist };
  cache.set(ride, p);
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
    const p = profileOf(ride);
    const s = frame.sample;
    const baseY = H - PAD_BOTTOM;
    const curX = PAD_X + (s.distance / p.totalDist) * (W - PAD_X * 2);
    const curY = baseY - ((s.altitude - p.minAlt) / (p.maxAlt - p.minAlt)) * (H - PAD_TOP - PAD_BOTTOM);

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
    const travelledX = s.outside && s.t < ride.startTime ? -1 : curX;
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
