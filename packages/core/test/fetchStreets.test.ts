import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildRide, fetchStreets, MAX_STREET_TILES, needsStreets, streetsArea, tilesFor, type Bbox } from '../src/index.ts';

// A ride going north for 2 min near (41.6 N, -8.8 E), 5 m/s
const t0 = Date.UTC(2026, 9, 25, 17, 0, 0);
const ride = buildRide({
  source: 'gpx',
  samples: Array.from({ length: 121 }, (_, i) => ({ t: t0 + i * 1000, lat: 41.6 + (i * 5) / 110_540, lon: -8.8 })),
});

/** fetch that answers the OpenFreeMap TileJSON and every tile (an empty tile, gzipped as the CDN may send it). */
function fakeFetch(fail = false) {
  return vi.fn(async (url: string) => {
    if (url === 'https://tiles.openfreemap.org/planet') return new Response(JSON.stringify({ tiles: ['https://tiles.example/{z}/{x}/{y}.pbf'] }));
    if (fail) return new Response('busy', { status: 503 });
    return new Response(gzipSync(Buffer.alloc(0)));
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('reading the streets (OpenFreeMap tiles)', () => {
  it('reads every tile of the box once, unpacking gzip, and keeps them for the next request', async () => {
    const f = fakeFetch();
    vi.stubGlobal('fetch', f);
    const box: Bbox = [41.6, -8.81, 41.61, -8.79];
    const tiles = tilesFor(box).length;
    const a = await fetchStreets(box);
    expect(a).toEqual({ bbox: box, ways: [] });
    expect(f).toHaveBeenCalledTimes(1 + tiles); // the address template, then each tile
    expect(f.mock.calls.slice(1).every(([u]) => /^https:\/\/tiles\.example\/14\/\d+\/\d+\.pbf$/.test(u))).toBe(true);
    await fetchStreets(box);
    expect(f).toHaveBeenCalledTimes(1 + tiles); // all from memory
  });

  it('gives null (map without streets) when the tiles cannot be read or the box is too big', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    vi.stubGlobal('fetch', fakeFetch(true));
    const p = fetchStreets([40.1, -7.01, 40.11, -7]);
    await vi.runAllTimersAsync(); // the retry after 2 s
    expect(await p).toBeNull();
    vi.useRealTimers();
    const f = fakeFetch();
    vi.stubGlobal('fetch', f);
    const huge: Bbox = [30, -10, 32, -8];
    expect(tilesFor(huge).length).toBeGreaterThan(MAX_STREET_TILES);
    expect(await fetchStreets(huge)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('asks for the clip with a margin from the zoom; nothing when the view is wider than 1.6 km', () => {
    const near = streetsArea(ride, t0, t0 + 60_000, 100)!;
    const auto = streetsArea(ride, t0, t0 + 60_000)!;
    expect(near[0]).toBeLessThan(41.6);
    expect(auto[0]).toBeLessThan(near[0]); // the automatic size reads a wider margin
    expect(streetsArea(ride, t0, t0 + 60_000, 3200)).toBeUndefined();
    expect(needsStreets(['speed', 'natalMap'])).toBe(true);
    expect(needsStreets(['speed', 'map'])).toBe(false);
  });
});
