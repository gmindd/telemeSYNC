import { sampleAt, type RideData, type RideSample } from '../../telemetry/ride.ts';
import { STREETS_ATTRIBUTION, type StreetKind, type Streets } from '../../map/streets.ts';
import { drawText } from '../draw.ts';
import { withAlpha } from '../panel/paint.ts';
import type { Ctx2D, FrameState, OverlayContext, OverlayDefinition, OverlayStyle } from '../types.ts';
import { CX, CY, DIAL, dialPaint, drawDialBase } from './common.ts';
import { routeSpan } from '../routeRange.ts';

// Round minimap, "GTA" style: centred on the rider, rotating so the direction of travel points up.
export const MAP_R = 128;
/** The rider sits a bit below the centre, so more of the road ahead is visible. */
const RIDER_Y = CY + 30;
const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LON = 111_320;

interface Local {
  /** East / north metres from the first position; NaN where no position. */
  e: Float64Array;
  n: Float64Array;
  /** View radius in metres (from the size of the ride). */
  viewM: number;
  /** Path length from the start to each sample (m, carried over samples without position). */
  cum: Float64Array;
  /** Origin and east metres per degree of longitude, to place other things (streets) in the same frame. */
  lat0: number;
  lon0: number;
  k: number;
}

const localCache = new WeakMap<RideData, Local>();

function localOf(ride: RideData): Local {
  let l = localCache.get(ride);
  if (l) return l;
  const len = ride.t.length;
  let lat0 = NaN;
  let lon0 = NaN;
  for (let i = 0; i < len && Number.isNaN(lat0); i++) {
    if (!Number.isNaN(ride.lat[i])) {
      lat0 = ride.lat[i];
      lon0 = ride.lon[i];
    }
  }
  const k = Math.cos((lat0 * Math.PI) / 180) * M_PER_DEG_LON;
  const e = new Float64Array(len).fill(NaN);
  const n = new Float64Array(len).fill(NaN);
  let minE = Infinity;
  let maxE = -Infinity;
  let minN = Infinity;
  let maxN = -Infinity;
  for (let i = 0; i < len; i++) {
    if (Number.isNaN(ride.lat[i])) continue;
    e[i] = (ride.lon[i] - lon0) * k;
    n[i] = (ride.lat[i] - lat0) * M_PER_DEG_LAT;
    minE = Math.min(minE, e[i]);
    maxE = Math.max(maxE, e[i]);
    minN = Math.min(minN, n[i]);
    maxN = Math.max(maxN, n[i]);
  }
  const extent = Number.isFinite(minE) ? Math.max(maxE - minE, maxN - minN) : 1000;
  const cum = new Float64Array(len);
  let last = -1;
  for (let i = 0; i < len; i++) {
    cum[i] = i > 0 ? cum[i - 1] : 0;
    if (Number.isNaN(e[i])) continue;
    if (last >= 0) cum[i] += Math.hypot(e[i] - e[last], n[i] - n[last]);
    last = i;
  }
  l = { e, n, viewM: Math.max(300, Math.min(2500, extent * 0.3)), cum, lat0, lon0, k };
  localCache.set(ride, l);
  return l;
}

interface LocalStreet {
  kind: StreetKind;
  e: Float64Array;
  n: Float64Array;
  /** Bounds (local metres), to skip streets out of view. */
  minE: number;
  maxE: number;
  minN: number;
  maxN: number;
}

const streetsCache = new WeakMap<Streets, { ride: RideData; ways: LocalStreet[] }>();

/** Streets in the ride's local metres (computed once per streets and ride). */
function localStreets(streets: Streets, ride: RideData, l: Local): LocalStreet[] {
  const hit = streetsCache.get(streets);
  if (hit && hit.ride === ride) return hit.ways;
  const ways = streets.ways.map((w) => {
    const e = Float64Array.from(w.lon, (lon) => (lon - l.lon0) * l.k);
    const n = Float64Array.from(w.lat, (lat) => (lat - l.lat0) * M_PER_DEG_LAT);
    let minE = Infinity;
    let maxE = -Infinity;
    let minN = Infinity;
    let maxN = -Infinity;
    for (let i = 0; i < e.length; i++) {
      minE = Math.min(minE, e[i]);
      maxE = Math.max(maxE, e[i]);
      minN = Math.min(minN, n[i]);
      maxN = Math.max(maxN, n[i]);
    }
    return { kind: w.kind, e, n, minE, maxE, minN, maxN };
  });
  streetsCache.set(streets, { ride, ways });
  return ways;
}

/** Street widths and colours (gadget units): paths and tracks thin, main roads wide. */
const STREET_LOOK: { kind: StreetKind; width: number; color: string }[] = [
  { kind: 'path', width: 1.6, color: 'rgba(185,212,222,0.42)' },
  { kind: 'minor', width: 2.2, color: 'rgba(185,212,222,0.5)' },
  { kind: 'road', width: 3.4, color: 'rgba(200,224,232,0.62)' },
  { kind: 'major', width: 5, color: 'rgba(222,238,244,0.72)' },
];

/** Position (local metres) at the sample, interpolated between fixes. */
function positionAt(ride: RideData, l: Local, s: RideSample): { e: number; n: number } | null {
  const i = Math.max(0, Math.min(ride.t.length - 1, s.index));
  const j = Math.min(ride.t.length - 1, i + 1);
  const f = s.fractionalIndex - i;
  let a = i;
  while (a > 0 && Number.isNaN(l.e[a])) a--;
  if (Number.isNaN(l.e[a])) return null;
  if (Number.isNaN(l.e[j]) || f <= 0) return { e: l.e[a], n: l.n[a] };
  return { e: l.e[a] + (l.e[j] - l.e[a]) * f, n: l.n[a] + (l.n[j] - l.n[a]) * f };
}

/** Point of the path at path length `d` (interpolated between fixes), or null outside the path. */
function pointAtLength(l: Local, d: number): { e: number; n: number } | null {
  const c = l.cum;
  const len = c.length;
  if (!len || d < 0 || d > c[len - 1]) return null;
  let lo = 0;
  let hi = len - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (c[mid] < d) lo = mid;
    else hi = mid;
  }
  let a = lo;
  while (a > 0 && Number.isNaN(l.e[a])) a--;
  let b = hi;
  while (b < len - 1 && Number.isNaN(l.e[b])) b++;
  if (Number.isNaN(l.e[a]) || Number.isNaN(l.e[b])) return null;
  const f = c[b] > c[a] ? (d - c[a]) / (c[b] - c[a]) : 0;
  return { e: l.e[a] + (l.e[b] - l.e[a]) * f, n: l.n[a] + (l.n[b] - l.n[a]) * f };
}

/**
 * Direction of travel (radians clockwise from north), stable when stopped. Points 30, 45 and 60 m
 * back along the path are interpolated, so the direction turns smoothly between GPS fixes instead of
 * jumping once a second, and their average softens the corners.
 */
function headingAt(ride: RideData, l: Local, s: RideSample, pos: { e: number; n: number }): number {
  const i = Math.max(0, Math.min(ride.t.length - 1, s.index));
  const j = Math.min(ride.t.length - 1, i + 1);
  const here = l.cum[i] + (l.cum[j] - l.cum[i]) * Math.max(0, Math.min(1, s.fractionalIndex - i));
  let ve = 0;
  let vn = 0;
  for (const back of [30, 45, 60]) {
    // Early in the ride there is no path behind yet: look ahead instead.
    const behind = here - back >= 0;
    const q = pointAtLength(l, behind ? here - back : here + back);
    if (!q) continue;
    const de = behind ? pos.e - q.e : q.e - pos.e;
    const dn = behind ? pos.n - q.n : q.n - pos.n;
    const m = Math.hypot(de, dn);
    if (m > 1) {
      ve += de / m;
      vn += dn / m;
    }
  }
  return ve || vn ? Math.atan2(ve, vn) : 0;
}

/**
 * Round minimap inside a frame drawn by `rim` (centre CX, CY; the map has radius MAP_R): shared by the
 * "Mostradores" map (chainring rim) and the Christmas one (wreath).
 */
export function drawRoundMap(ctx: Ctx2D, frame: FrameState, style: OverlayStyle, octx: OverlayContext, rim: (ctx: Ctx2D) => void) {
  const ride = octx.ride;
  const l = localOf(ride);
  const p = dialPaint(style);
  const s = frame.sample;
  rim(ctx);
  const pos = positionAt(ride, l, s);
  const theta = pos ? headingAt(ride, l, s, pos) : 0;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const viewM = style.mapRadiusM && style.mapRadiusM > 0 ? style.mapRadiusM : l.viewM;
  const k = (MAP_R * 1.1) / viewM;
  const sx = (e: number, n: number) => CX + ((e - (pos?.e ?? 0)) * cos - (n - (pos?.n ?? 0)) * sin) * k;
  const sy = (e: number, n: number) => RIDER_Y - ((e - (pos?.e ?? 0)) * sin + (n - (pos?.n ?? 0)) * cos) * k;

  ctx.save();
  ctx.beginPath();
  ctx.arc(CX, CY, MAP_R, 0, Math.PI * 2);
  ctx.clip();
  const bg = ctx.createRadialGradient(CX, CY - 20, 10, CX, CY, MAP_R);
  bg.addColorStop(0, '#1d3a3a');
  bg.addColorStop(1, '#0a1619');
  ctx.fillStyle = bg;
  ctx.fillRect(CX - MAP_R, CY - MAP_R, MAP_R * 2, MAP_R * 2);

  const streets = pos && octx.streets?.ways.length ? localStreets(octx.streets, ride, l) : undefined;
  if (pos && streets) {
    // Streets and paths around (OpenStreetMap): what makes a bend recognisable.
    const reach = viewM * 1.6;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const look of STREET_LOOK) {
      ctx.beginPath();
      for (const w of streets) {
        if (w.kind !== look.kind || w.maxE < pos.e - reach || w.minE > pos.e + reach || w.maxN < pos.n - reach || w.minN > pos.n + reach) continue;
        ctx.moveTo(sx(w.e[0], w.n[0]), sy(w.e[0], w.n[0]));
        for (let i = 1; i < w.e.length; i++) ctx.lineTo(sx(w.e[i], w.n[i]), sy(w.e[i], w.n[i]));
      }
      ctx.strokeStyle = look.color;
      ctx.lineWidth = look.width;
      ctx.stroke();
    }
  } else if (pos) {
    // World-aligned grid: shows the map turning and moving.
    const step = viewM / 3;
    const reach = viewM * 2;
    ctx.strokeStyle = 'rgba(160,220,210,0.07)';
    ctx.lineWidth = 1;
    const g0e = Math.floor((pos.e - reach) / step) * step;
    const g0n = Math.floor((pos.n - reach) / step) * step;
    for (let e = g0e; e <= pos.e + reach; e += step) {
      ctx.beginPath();
      ctx.moveTo(sx(e, pos.n - reach), sy(e, pos.n - reach));
      ctx.lineTo(sx(e, pos.n + reach), sy(e, pos.n + reach));
      ctx.stroke();
    }
    for (let n = g0n; n <= pos.n + reach; n += step) {
      ctx.beginPath();
      ctx.moveTo(sx(pos.e - reach, n), sy(pos.e - reach, n));
      ctx.lineTo(sx(pos.e + reach, n), sy(pos.e + reach, n));
      ctx.stroke();
    }
  }
  if (pos) {
    // Route: only points near the view, decimated to ~1.5 px.
    const near = (viewM * 1.8) ** 2;
    const minStep = 1.5 / k;
    const path = (from: number, to: number, extra?: { e: number; n: number }) => {
      ctx.beginPath();
      let pen = false;
      let le = NaN;
      let ln = NaN;
      for (let i = from; i <= to; i++) {
        const e = l.e[i];
        if (Number.isNaN(e)) continue;
        const n = l.n[i];
        const de = e - pos.e;
        const dn = n - pos.n;
        if (de * de + dn * dn > near) {
          pen = false;
          continue;
        }
        if (pen && Math.abs(e - le) + Math.abs(n - ln) < minStep && i !== to) continue;
        if (pen) ctx.lineTo(sx(e, n), sy(e, n));
        else ctx.moveTo(sx(e, n), sy(e, n));
        pen = true;
        le = e;
        ln = n;
      }
      if (extra && pen) ctx.lineTo(sx(extra.e, extra.n), sy(extra.e, extra.n));
    };
    // Only the part of the ride chosen for the maps (whole ride, clips or a stretch) is drawn.
    const span = routeSpan(ride, style, octx);
    const cur = Math.min(span.i1, s.index);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    path(span.i0, span.i1);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(235,245,255,0.55)';
    ctx.lineWidth = 4.5;
    ctx.stroke();
    if (!(s.outside && s.t < ride.startTime) && cur >= span.i0) {
      path(span.i0, cur, s.index < span.i1 ? pos : undefined);
      ctx.shadowColor = withAlpha(style.accentColor, 0.8);
      ctx.shadowBlur = 10;
      ctx.strokeStyle = style.accentColor;
      ctx.lineWidth = 5.5;
      ctx.stroke();
      ctx.shadowColor = 'rgba(0,0,0,0)';
      ctx.shadowBlur = 0;
    }
  }
  // Inner shade towards the rim.
  const shade = ctx.createRadialGradient(CX, CY, MAP_R * 0.7, CX, CY, MAP_R);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = shade;
  ctx.fillRect(CX - MAP_R, CY - MAP_R, MAP_R * 2, MAP_R * 2);
  ctx.restore();

  if (streets) drawText(ctx, STREETS_ATTRIBUTION, CX, CY + MAP_R - 12, p.ts, { size: 11, weight: 600, color: 'rgba(255,255,255,0.6)', align: 'center', tabular: false });

  // Rider arrow (always pointing up: the map turns, not the arrow).
  if (pos) {
    ctx.beginPath();
    ctx.moveTo(CX, RIDER_Y - 15);
    ctx.lineTo(CX + 11, RIDER_Y + 11);
    ctx.lineTo(CX, RIDER_Y + 5);
    ctx.lineTo(CX - 11, RIDER_Y + 11);
    ctx.closePath();
    ctx.shadowColor = 'rgba(56,189,248,0.9)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // North marker on the rim.
  const nx = CX - Math.sin(theta) * (MAP_R + 2);
  const ny = CY - Math.cos(theta) * (MAP_R + 2);
  ctx.beginPath();
  ctx.arc(nx, ny, 15, 0, Math.PI * 2);
  ctx.fillStyle = '#0d1116';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.stroke();
  drawText(ctx, 'N', nx, ny + 6, p.ts, { size: 16, weight: 800, align: 'center', tabular: false });
}

export const dialMapOverlay: OverlayDefinition = {
  id: 'dialMap',
  label: 'Round map (rotating)',
  requires: 'map',
  textOnly: false,
  size: () => ({ width: DIAL, height: DIAL }),
  draw: (ctx: Ctx2D, frame, style, octx) =>
    drawRoundMap(ctx, frame, style, octx, (c) => drawDialBase(c, { from: style.accentColor, to: style.accentColor }, dialPaint(style), true)),
};

/** Direction the round map turns to at instant t (radians clockwise from north), for tests. */
export function mapHeadingAt(ride: RideData, t: number): number {
  const l = localOf(ride);
  const s = sampleAt(ride, t);
  const pos = positionAt(ride, l, s);
  return pos ? headingAt(ride, l, s, pos) : NaN;
}
