import type { RideData } from '../telemetry/ride.ts';
import { mercator } from '../util/geo.ts';
import { dot, strokeWithOutline } from './draw.ts';
import type { Ctx2D, OverlayContext, OverlayDefinition, OverlayStyle } from './types.ts';

interface Projected {
  /** Projected x/y (unit Mercator) of every sample; NaN where no position. */
  x: Float64Array;
  y: Float64Array;
}

const projCache = new WeakMap<RideData, Projected>();

function project(ride: RideData): Projected {
  let p = projCache.get(ride);
  if (!p) {
    const n = ride.t.length;
    const x = new Float64Array(n).fill(NaN);
    const y = new Float64Array(n).fill(NaN);
    for (let i = 0; i < n; i++) {
      if (Number.isNaN(ride.lat[i])) continue;
      const m = mercator(ride.lat[i], ride.lon[i]);
      x[i] = m.x;
      y[i] = m.y;
    }
    p = { x, y };
    projCache.set(ride, p);
  }
  return p;
}

interface Frame {
  /** Maps unit Mercator to overlay px. */
  sx: (x: number) => number;
  sy: (y: number) => number;
  /** Indices of samples kept after pixel decimation. */
  kept: Int32Array;
}

const frameCache = new WeakMap<RideData, Map<string, Frame>>();

function boundsOf(p: Projected, i0: number, i1: number) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = i0; i <= i1; i++) {
    const x = p.x[i];
    if (Number.isNaN(x)) continue;
    const y = p.y[i];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

function frameFor(ride: RideData, octx: OverlayContext, style: OverlayStyle, size: number, pad: number): Frame {
  const p = project(ride);
  const n = ride.t.length;
  let i0 = 0;
  let i1 = n - 1;
  if (style.mapMode === 'clip') {
    i0 = 0;
    while (i0 < n - 1 && ride.t[i0] < octx.clipStart) i0++;
    i1 = i0;
    while (i1 < n - 1 && ride.t[i1] <= octx.clipEnd) i1++;
  }
  const key = `${style.mapMode}|${i0}|${i1}|${size}|${pad}`;
  let byRide = frameCache.get(ride);
  if (!byRide) frameCache.set(ride, (byRide = new Map()));
  const cached = byRide.get(key);
  if (cached) return cached;

  let b = boundsOf(p, i0, i1);
  if (!Number.isFinite(b.minX)) b = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  // Minimum extent (~150 m) so a stopped clip does not zoom to infinity.
  const minExtent = 150 / 40_075_016;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const extent = Math.max(b.maxX - b.minX, b.maxY - b.minY, minExtent);
  const k = (size - pad * 2) / extent;
  const sx = (x: number) => size / 2 + (x - cx) * k;
  const sy = (y: number) => size / 2 + (y - cy) * k;

  // Decimate to ~0.5 px resolution over the whole ride.
  const kept: number[] = [];
  let lx = NaN;
  let ly = NaN;
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(p.x[i])) continue;
    const X = sx(p.x[i]);
    const Y = sy(p.y[i]);
    if (kept.length === 0 || Math.abs(X - lx) + Math.abs(Y - ly) >= 0.5 || i === n - 1) {
      kept.push(i);
      lx = X;
      ly = Y;
    }
  }
  const f = { sx, sy, kept: Int32Array.from(kept) };
  byRide.set(key, f);
  return f;
}

const BASE = 420;
const PAD = 24;

export const mapOverlay: OverlayDefinition = {
  id: 'map',
  label: 'Map',
  requires: 'map',
  textOnly: false,
  size: () => ({ width: BASE, height: BASE }),
  draw: (ctx: Ctx2D, frame, style, octx) => {
    const ride = octx.ride;
    const p = project(ride);
    const f = frameFor(ride, octx, style, BASE, PAD);
    const cur = frame.sample;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, BASE, BASE);
    ctx.clip();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Full track.
    ctx.beginPath();
    let started = false;
    for (const i of f.kept) {
      const X = f.sx(p.x[i]);
      const Y = f.sy(p.y[i]);
      if (!started) {
        ctx.moveTo(X, Y);
        started = true;
      } else ctx.lineTo(X, Y);
    }
    strokeWithOutline(ctx, style, style.mutedColor, 4);

    // Travelled part up to the exact current position.
    const hasPos = Number.isFinite(cur.lat) && !cur.outside;
    const curIdx = cur.outside && cur.t > ride.endTime ? ride.t.length - 1 : cur.index;
    if (!(cur.outside && cur.t < ride.startTime)) {
      ctx.beginPath();
      started = false;
      for (const i of f.kept) {
        if (i > curIdx) break;
        const X = f.sx(p.x[i]);
        const Y = f.sy(p.y[i]);
        if (!started) {
          ctx.moveTo(X, Y);
          started = true;
        } else ctx.lineTo(X, Y);
      }
      if (hasPos) {
        const m = mercatorXY(cur.lat, cur.lon);
        if (started) ctx.lineTo(f.sx(m.x), f.sy(m.y));
      }
      if (started) strokeWithOutline(ctx, style, style.accentColor, 5);
    }

    if (hasPos) {
      const m = mercatorXY(cur.lat, cur.lon);
      dot(ctx, style, f.sx(m.x), f.sy(m.y), 9, style.accentColor);
      dot(ctx, style, f.sx(m.x), f.sy(m.y), 4, '#ffffff');
    }
    ctx.restore();
  },
};

function mercatorXY(lat: number, lon: number) {
  return mercator(lat, lon);
}
