import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { buildRide, getOverlay, overlayPixelSize, renderOverlayFrame, streetsBbox, streetsFromTile, tilesFor, type Ctx2D, type Streets } from '../src/index.ts';
import { DEFAULT_STYLE } from '../src/overlays/types.ts';
import { registerEmbeddedFonts } from '../src/node/index.ts';

// A ride going north for 2 min near (41.6 N, -8.8 E), 5 m/s
const t0 = Date.UTC(2026, 9, 25, 17, 0, 0);
const ride = buildRide({
  source: 'gpx',
  samples: Array.from({ length: 121 }, (_, i) => ({ t: t0 + i * 1000, lat: 41.6 + (i * 5) / 110_540, lon: -8.8 })),
});

describe('streets (OpenStreetMap)', () => {
  it('reads the roads of a vector tile (OpenMapTiles "transportation"), with their kind, in degrees', () => {
    const tile = mvtTile([
      { cls: 'track', pts: [[0, 0], [2048, 2048]] },
      { cls: 'primary', pts: [[0, 4096], [4096, 4096]] },
      { cls: 'rail', pts: [[0, 100], [100, 100]] },
    ]);
    const streets = streetsFromTile(tile, 14, 7775, 6277);
    expect(streets.map((s) => s.kind)).toEqual(['path', 'major']);
    // Tile 14/7775/6277: north-west corner at -9.16260 E, 38.73695 N; the track ends at its centre
    expect(streets[0].lon[0]).toBeCloseTo(-9.16260, 4);
    expect(streets[0].lat[0]).toBeCloseTo(38.73695, 4);
    expect(streets[0].lon[1]).toBeCloseTo(-9.16260 + 360 / 2 ** 15, 4);
    expect(tilesFor([38.715, -9.155, 38.735, -9.14])).toHaveLength(4);
  });

  it('asks for the box around the clip only, rounded so small sync changes reuse it', () => {
    const a = streetsBbox(ride, t0, t0 + 60_000, 400)!;
    const b = streetsBbox(ride, t0 + 2000, t0 + 62_000, 400)!;
    expect(a).toEqual(b);
    expect(a[0]).toBeLessThan(41.6);
    expect(a[2]).toBeGreaterThan(41.6 + 300 / 110_540);
    expect(streetsBbox(ride, t0 - 3_600_000, t0 - 60_000, 400)).toBeUndefined();
  });

  it('the round map draws them (and the attribution) when given', () => {
    registerEmbeddedFonts();
    const def = getOverlay('dialMap');
    const style = { ...DEFAULT_STYLE, mapRadiusM: 200 };
    const { width, height } = overlayPixelSize(def, style);
    const streets: Streets = { bbox: [41.59, -8.81, 41.61, -8.79], ways: [{ kind: 'road', lat: Float64Array.from([41.6005, 41.6005]), lon: Float64Array.from([-8.803, -8.797]) }] };
    const draw = (withStreets: boolean) => {
      const c = createCanvas(width, height);
      const ctx = c.getContext('2d') as unknown as Ctx2D;
      renderOverlayFrame(ctx, def, t0 + 60_000, style, { ride, clipStart: t0, clipEnd: t0 + 120_000, streets: withStreets ? streets : undefined });
      return c.toBuffer('image/png');
    };
    expect(draw(true).equals(draw(false))).toBe(false);
  });
});

// --- a tiny vector tile writer (one "transportation" layer of lines) ---
function varint(n: number): number[] {
  const out: number[] = [];
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return out;
}
const zz = (n: number) => (n < 0 ? -2 * n - 1 : 2 * n);
const field = (num: number, bytes: number[]) => [...varint((num << 3) | 2), ...varint(bytes.length), ...bytes];
const str = (s: string) => Array.from(new TextEncoder().encode(s));
function mvtTile(lines: { cls: string; pts: number[][] }[]): Uint8Array {
  const classes = [...new Set(lines.map((l) => l.cls))];
  const feats = lines.map((l) => {
    const cmds: number[] = [];
    let x = 0;
    let y = 0;
    l.pts.forEach(([px, py], i) => {
      if (i === 0) cmds.push((1 << 3) | 1);
      if (i === 1) cmds.push(((l.pts.length - 1) << 3) | 2);
      cmds.push(zz(px - x), zz(py - y));
      x = px;
      y = py;
    });
    const packed = (a: number[]) => a.flatMap(varint);
    return field(2, [...field(2, packed([0, classes.indexOf(l.cls)])), ...varint((3 << 3) | 0), 2, ...field(4, packed(cmds))]);
  });
  const layer = [...varint((15 << 3) | 0), 2, ...field(1, str('transportation')), ...feats.flat(), ...field(3, str('class')), ...classes.flatMap((c) => field(4, field(1, str(c)))), ...varint((5 << 3) | 0), ...varint(4096)];
  return Uint8Array.from(field(3, layer));
}
