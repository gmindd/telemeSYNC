import type { RideData, RideSample } from '../../telemetry/ride.ts';
import { drawText } from '../draw.ts';
import { withAlpha } from '../panel/paint.ts';
import type { Ctx2D, OverlayDefinition } from '../types.ts';
import { CX, CY, DIAL, dialPaint, drawDialBase } from './common.ts';

// Round minimap, "GTA" style: centred on the rider, rotating so the direction of travel points up.
const MAP_R = 128;
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
  l = { e, n, viewM: Math.max(300, Math.min(2500, extent * 0.3)) };
  localCache.set(ride, l);
  return l;
}

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

/** Direction of travel (radians clockwise from north) over the last ~40 m, stable when stopped. */
function headingAt(ride: RideData, l: Local, s: RideSample, pos: { e: number; n: number }): number {
  for (let i = Math.min(ride.t.length - 1, s.index); i >= 0 && s.index - i < 2000; i--) {
    if (Number.isNaN(l.e[i])) continue;
    const de = pos.e - l.e[i];
    const dn = pos.n - l.n[i];
    if (de * de + dn * dn >= 40 * 40) return Math.atan2(de, dn);
  }
  // Start of the ride: look ahead instead.
  for (let i = s.index + 1; i < ride.t.length && i - s.index < 2000; i++) {
    if (Number.isNaN(l.e[i])) continue;
    const de = l.e[i] - pos.e;
    const dn = l.n[i] - pos.n;
    if (de * de + dn * dn >= 40 * 40) return Math.atan2(de, dn);
  }
  return 0;
}

export const dialMapOverlay: OverlayDefinition = {
  id: 'dialMap',
  label: 'Round map (rotating)',
  requires: 'map',
  textOnly: false,
  size: () => ({ width: DIAL, height: DIAL }),
  draw: (ctx: Ctx2D, frame, style, octx) => {
    const ride = octx.ride;
    const l = localOf(ride);
    const p = dialPaint(style);
    const s = frame.sample;
    drawDialBase(ctx, { from: style.accentColor, to: style.accentColor }, p, true);
    const pos = positionAt(ride, l, s);
    const theta = pos ? headingAt(ride, l, s, pos) : 0;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const k = (MAP_R * 1.1) / l.viewM;
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

    if (pos) {
      // World-aligned grid: shows the map turning and moving.
      const step = l.viewM / 3;
      const reach = l.viewM * 2;
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

      // Route: only points near the view, decimated to ~1.5 px.
      const near = (l.viewM * 1.8) ** 2;
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
      const last = ride.t.length - 1;
      const cur = Math.min(last, s.index);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      path(0, last);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(235,245,255,0.55)';
      ctx.lineWidth = 4.5;
      ctx.stroke();
      if (!(s.outside && s.t < ride.startTime)) {
        path(0, cur, pos);
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
  },
};
