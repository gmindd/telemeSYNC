import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { buildRide, parseFit } from '../src/index.ts';
import { routeSpan } from '../src/overlays/routeRange.ts';
import { getOverlay, overlayPixelSize, renderOverlayFrame } from '../src/overlays/registry.ts';
import { DEFAULT_STYLE, type Ctx2D, type OverlayId, type OverlayStyle } from '../src/overlays/types.ts';
import { registerEmbeddedFonts } from '../src/node/index.ts';
import { encodeFit, syntheticRide } from './helpers/synthetic.ts';

const synth = syntheticRide();
const ride = buildRide(parseFit(encodeFit(synth.samples)));
const clip = { clipStart: ride.startTime + 100_000, clipEnd: ride.startTime + 160_000 };

describe('area of the maps and profiles', () => {
  it('gives the whole ride, the clip, or the chosen stretch', () => {
    const whole = routeSpan(ride, DEFAULT_STYLE, clip);
    expect(whole.whole).toBe(true);
    expect([whole.i0, whole.i1]).toEqual([0, ride.t.length - 1]);
    const c = routeSpan(ride, { ...DEFAULT_STYLE, mapMode: 'clip' }, clip);
    expect(c.startMs).toBe(clip.clipStart);
    expect(ride.t[c.i0]).toBeLessThanOrEqual(clip.clipStart);
    expect(ride.t[c.i1]).toBeLessThanOrEqual(clip.clipEnd);
    const range = { startMs: ride.startTime + 300_000, endMs: ride.startTime + 600_000 };
    const custom = routeSpan(ride, { ...DEFAULT_STYLE, mapMode: 'custom', mapRange: range }, clip);
    expect(custom.startMs).toBe(range.startMs);
    expect(custom.whole).toBe(false);
    // "Only the clips" without the clips' span filled in falls back to the whole ride.
    expect(routeSpan(ride, { ...DEFAULT_STYLE, mapMode: 'clips', mapRange: null }, clip).whole).toBe(true);
    // A stretch past the ride is held to it.
    const past = routeSpan(ride, { ...DEFAULT_STYLE, mapMode: 'custom', mapRange: { startMs: ride.endTime - 1000, endMs: ride.endTime + 99_999 } }, clip);
    expect(past.endMs).toBe(ride.endTime);
    expect(past.i1).toBeGreaterThan(past.i0);
  });

  it('draws the maps and profiles of a stretch, before, inside and after it', () => {
    registerEmbeddedFonts();
    const style: OverlayStyle = { ...DEFAULT_STYLE, scale: 1, mapMode: 'custom', mapRange: { startMs: ride.startTime + 300_000, endMs: ride.startTime + 600_000 } };
    for (const id of ['map', 'elevationProfile', 'dialMap', 'dialProfile', 'natalMap', 'natalProfile'] as OverlayId[]) {
      for (const t of [ride.startTime + 100_000, ride.startTime + 450_000, ride.startTime + 900_000]) {
        const def = getOverlay(id);
        const { width, height } = overlayPixelSize(def, style);
        const c = createCanvas(width, height);
        const ctx = c.getContext('2d');
        renderOverlayFrame(ctx as unknown as Ctx2D, def, t, style, { ride, ...clip });
        const data = ctx.getImageData(0, 0, width, height).data;
        let opaque = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] > 0) opaque++;
        expect(opaque, `${id} at ${t - ride.startTime}`).toBeGreaterThan(width * height * 0.01);
      }
    }
  });
});
