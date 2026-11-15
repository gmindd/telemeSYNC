// Streets and paths around a ride, from OpenStreetMap through OpenFreeMap's vector tiles (OpenMapTiles schema,
// "transportation" layer), drawn under the route in the round map so a bend of the road is easy to recognise. Only
// the tiles around the clip are read. Data © OpenStreetMap contributors (ODbL), tiles © OpenMapTiles / OpenFreeMap.
import type { RideData } from '../telemetry/ride.ts';
import { readMvt } from './mvt.ts';

/** How a street is drawn: wide roads to narrow paths (MTB tracks and trails count as paths). */
export type StreetKind = 'major' | 'road' | 'minor' | 'path';

export interface Street {
  kind: StreetKind;
  lat: Float64Array;
  lon: Float64Array;
}

/** South, west, north, east (degrees). */
export type Bbox = [number, number, number, number];

export interface Streets {
  bbox: Bbox;
  ways: Street[];
}

/** Text drawn wherever the streets are shown. */
export const STREETS_ATTRIBUTION = '© OpenStreetMap';

/** OpenMapTiles transportation classes → how they are drawn; rail, ferries, lifts… are left out. */
const KIND: Record<string, StreetKind> = {
  motorway: 'major',
  trunk: 'major',
  primary: 'major',
  secondary: 'road',
  tertiary: 'road',
  minor: 'road',
  service: 'minor',
  busway: 'minor',
  track: 'path',
  path: 'path',
};

/** Zoom of the tiles read: the most detailed level, where paths and tracks are included (~2.4 km at 40° N). */
export const STREETS_ZOOM = 14;

/** The tiles (x, y at `z`) covering a box. */
export function tilesFor(b: Bbox, z = STREETS_ZOOM): { z: number; x: number; y: number }[] {
  const n = 2 ** z;
  const tx = (lon: number) => Math.floor(((lon + 180) / 360) * n);
  const ty = (lat: number) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  };
  const out: { z: number; x: number; y: number }[] = [];
  for (let x = tx(b[1]); x <= tx(b[3]); x++) for (let y = ty(b[2]); y <= ty(b[0]); y++) out.push({ z, x, y });
  return out;
}

/** The streets of one vector tile (already decompressed). */
export function streetsFromTile(bytes: Uint8Array, z: number, x: number, y: number): Street[] {
  const layer = readMvt(bytes, ['transportation'])[0];
  if (!layer) return [];
  const n = 2 ** z;
  const ext = layer.extent;
  const lonOf = (px: number) => ((x + px / ext) / n) * 360 - 180;
  const latOf = (py: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + py / ext)) / n))) * 180) / Math.PI;
  const out: Street[] = [];
  for (const f of layer.features) {
    const cls = String(f.props.class ?? '');
    const kind = KIND[cls];
    if (!kind) continue;
    for (const line of f.lines) {
      if (line.length < 2) continue;
      out.push({ kind, lat: Float64Array.from(line, (p) => latOf(p[1])), lon: Float64Array.from(line, (p) => lonOf(p[0])) });
    }
  }
  return out;
}

/**
 * Box around where the ride goes between two instants, with `marginM` around it, rounded outwards to a 0.005°
 * grid (so a small change of the sync asks for the same box again). Undefined when the ride has no position
 * there, or the stretch is too long for one request (over ~15 km across).
 */
export function streetsBbox(ride: RideData, fromMs: number, toMs: number, marginM: number): Bbox | undefined {
  let s = Infinity;
  let w = Infinity;
  let n = -Infinity;
  let e = -Infinity;
  for (let i = 0; i < ride.t.length; i++) {
    if (ride.t[i] < fromMs || ride.t[i] > toMs || Number.isNaN(ride.lat[i])) continue;
    s = Math.min(s, ride.lat[i]);
    n = Math.max(n, ride.lat[i]);
    w = Math.min(w, ride.lon[i]);
    e = Math.max(e, ride.lon[i]);
  }
  if (!Number.isFinite(s)) return undefined;
  const dLat = marginM / 110_540;
  const dLon = marginM / (111_320 * Math.cos((((s + n) / 2) * Math.PI) / 180));
  const grid = 0.005;
  const box: Bbox = [
    Math.floor((s - dLat) / grid) * grid,
    Math.floor((w - dLon) / grid) * grid,
    Math.ceil((n + dLat) / grid) * grid,
    Math.ceil((e + dLon) / grid) * grid,
  ];
  if (box[2] - box[0] > 0.15 || box[3] - box[1] > 0.2) return undefined;
  return box.map((v) => Math.round(v * 1000) / 1000) as Bbox;
}
