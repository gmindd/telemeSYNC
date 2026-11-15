// Streets and paths around the clip for the round map: OpenStreetMap data from OpenFreeMap's vector tiles (free, no
// key, served from a CDN). Only the few tiles around the clip's stretch are read; each one stays in memory while the
// app runs, so changing the sync or the zoom reuses them.
import { useEffect } from 'react';
import { streetsBbox, streetsFromTile, tilesFor, type Bbox, type Street, type Streets } from '@telemesync/core';
import { clipStart, useProject } from '../state.ts';

const TILEJSON = 'https://tiles.openfreemap.org/planet';
const TIMEOUT_MS = 20_000;
let template: Promise<string> | null = null;
const tiles = new Map<string, Promise<Street[]>>();

async function fetchBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  let b = new Uint8Array(await r.arrayBuffer());
  // Tiles are gzipped; the browser normally unpacks them already (Content-Encoding), but not always
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

/** The streets in a box (null when the tiles could not be read: the map then shows only the route). */
export async function fetchStreets(bbox: Bbox): Promise<Streets | null> {
  try {
    const parts = await Promise.all(tilesFor(bbox).map((t) => tileStreets(t.z, t.x, t.y)));
    return { bbox, ways: parts.flat() };
  } catch {
    return null;
  }
}

/**
 * Keeps the project's streets for the round map up to date: asked for when a round map is on screen (the gadget,
 * or the Sync tab's map), for the clip's stretch with a margin that follows the map's zoom.
 */
export function useStreets() {
  const s = useProject();
  const wanted = !!s.ride?.available.has('map') && (s.tab === 'sync' || s.overlays.includes('dialMap'));
  const start = s.ride ? clipStart(s) : 0;
  const end = start + (s.trim.end || s.info?.durationS || 60) * 1000;
  const margin = Math.min(1500, Math.max(400, s.mapZoomM * 1.3));
  const bbox = wanted && s.ride && s.mapZoomM <= 1600 ? streetsBbox(s.ride, start - 30_000, end + 30_000, margin) : undefined;
  const key = bbox?.join(',');
  useEffect(() => {
    if (!bbox) return;
    let alive = true;
    const { setStreets } = useProject.getState();
    setStreets(useProject.getState().streets, 'loading');
    void fetchStreets(bbox).then((streets) => {
      if (!alive) return;
      if (streets) setStreets(streets, 'ok');
      else setStreets(useProject.getState().streets, 'failed');
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, s.streetsRetry]);
}
