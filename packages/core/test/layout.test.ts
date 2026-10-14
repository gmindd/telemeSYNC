import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { buildRide, compositeSize, DEFAULT_STYLE, drawComposite, parseFit, resolveLayout, type Ctx2D } from '../src/index.ts';
import { registerEmbeddedFonts } from '../src/node/index.ts';
import { encodeFit, syntheticRide } from './helpers/synthetic.ts';

describe('gadget layout and composite', () => {
  it('composite size keeps the clip aspect with the short side = target', () => {
    expect(compositeSize(3840, 2160)).toEqual({ width: 1920, height: 1080 });
    expect(compositeSize(2880, 2880)).toEqual({ width: 1080, height: 1080 });
    expect(compositeSize(1080, 1920, 1080)).toEqual({ width: 1080, height: 1920 });
    expect(compositeSize(undefined, undefined)).toEqual({ width: 1920, height: 1080 });
  });

  it('default layout keeps every gadget inside the frame; user placements win', () => {
    const ids = ['speed', 'grade', 'heartRate', 'map', 'elevationProfile'] as const;
    const l = resolveLayout([...ids], { speed: { x: 0.6, y: 0.7, w: 0.2 } }, 16 / 9, DEFAULT_STYLE);
    expect(l.speed).toEqual({ x: 0.6, y: 0.7, w: 0.2 });
    for (const id of ids) {
      expect(l[id].x).toBeGreaterThanOrEqual(0);
      expect(l[id].x + l[id].w).toBeLessThanOrEqual(1);
      expect(l[id].y).toBeGreaterThanOrEqual(0);
    }
    expect(l.map.x).toBeGreaterThan(0.5); // right side
    expect(l.elevationProfile.y).toBeGreaterThan(0.6); // bottom
  });

  it('draws gadgets where they were placed', () => {
    registerEmbeddedFonts();
    const synth = syntheticRide();
    const ride = buildRide(parseFit(encodeFit(synth.samples)));
    const W = 400;
    const H = 400;
    const c = createCanvas(W, H);
    const ctx = c.getContext('2d');
    const t = synth.climb.startT + 30_000;
    drawComposite(ctx as unknown as Ctx2D, ['speed'], resolveLayout(['speed'], { speed: { x: 0.5, y: 0.5, w: 0.5 } }, 1, DEFAULT_STYLE), t, DEFAULT_STYLE, { ride, clipStart: t, clipEnd: t + 1000 }, W, H);
    const data = ctx.getImageData(0, 0, W, H).data;
    let tl = 0;
    let br = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 0) (x >= 200 && y >= 200 ? br++ : tl++);
    expect(tl).toBe(0);
    expect(br).toBeGreaterThan(500);
  });
});
