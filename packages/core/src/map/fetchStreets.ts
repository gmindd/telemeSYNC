// Reads the streets and paths around a stretch of the ride from OpenFreeMap's vector tiles (OpenStreetMap data,
// free, no key, served from a CDN). Shared by the phone app, the desktop app's preview and the desktop exporter
// (browser and Node both have fetch and DecompressionStream). Each tile read stays in memory while the program runs,
// so moving the sync or changing the zoom reuses it.
import type { RideData } from '../telemetry/ride.ts';
import { streetsBbox, streetsFromTile, tilesFor, type Bbox, type Street, type Streets } from './streets.ts';

const TILEJSON = 'https://tiles.openfreemap.org/planet';
const TIMEOUT_MS = 20_000;
/** Most tiles read for one stretch (each ~2.4 km across; streetsBbox already keeps a box under ~100). */
export const MAX_STREET_TILES = 100;

let template: Promise<string> | null = null;
const tiles = new Map<string, Promise<Street[]>>();

async function fetchBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  let b = new Uint8Array(await r.arrayBuffer());
  // Tiles are gzipped; fetch normally unpacks them already (Content-Encoding), but not always.
  if (b[0] === 0x1f && b[1] === 0x8b) b = new Uint8Array(await new Response(new Blob([b as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  return b;
}

/** The tile address template of the current OpenFreeMap build ("…/{z}/{x}/{y}.pbf"). */
function tileTemplate(): Promise<string> {
  template ??= (async () => {
    const r = await fetch(TILEJSON, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const url = (await r.json())?.tiles?.[0];
    if (typeof url !== 'string' || !url.startsWith('https://')) throw new Error('no tiles');
    return url;
  })().catch((e) => {
    template = null;
    throw e;
  });
  return template;
}

function tileStreets(z: number, x: number, y: number): Promise<Street[]> {
  const key = `${z}/${x}/${y}`;
  let p = tiles.get(key);
  if (!p) {
    p = (async () => {
      const url = (await tileTemplate()).replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
      try {
        return streetsFromTile(await fetchBytes(url), z, x, y);
      } catch {
        await new Promise((r) => setTimeout(r, 2000));
        return streetsFromTile(await fetchBytes(url), z, x, y); // one more try
      }
    })();
    p.catch(() => tiles.delete(key)); // asked again next time
    tiles.set(key, p);
  }
  return p;
}

/** The streets in a box (null when the tiles could not be read, or too many: the map then shows only the route). */
export async function fetchStreets(bbox: Bbox): Promise<Streets | null> {
  const list = tilesFor(bbox);
  if (list.length > MAX_STREET_TILES) return null;
  try {
    const parts = await Promise.all(list.map((t) => tileStreets(t.z, t.x, t.y)));
    return { bbox, ways: parts.flat() };
  } catch {
    return null;
  }
}

/**
 * Box of streets to read for a round map shown between two instants: where the ride goes then, with a margin that
 * follows the map's view radius (none of the radius = the map's automatic size). Undefined when there is nothing to
 * read: no position there, the stretch too long, or a view so wide (over 1.6 km) that streets would only be clutter.
 */
export function streetsArea(ride: RideData, fromMs: number, toMs: number, radiusM?: number): Bbox | undefined {
  if (!ride.available.has('map')) return undefined;
  if (radiusM && radiusM > 1600) return undefined;
  const margin = Math.min(1500, Math.max(400, (radiusM ?? 800) * 1.3));
  return streetsBbox(ride, fromMs - 30_000, toMs + 30_000, margin);
}

/** Gadgets that draw the streets: the round maps (chainring rim and Christmas wreath). */
export const STREET_OVERLAYS = ['dialMap', 'natalMap'] as const;

/** True when any of these gadgets draws streets. */
export function needsStreets(ids: readonly string[]): boolean {
  return ids.some((id) => (STREET_OVERLAYS as readonly string[]).includes(id));
}
