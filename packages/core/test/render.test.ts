import { execFileSync } from 'node:child_process';
import { createCanvas } from '@napi-rs/canvas';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRide, parseFit } from '../src/index.ts';
import { DEFAULT_STYLE, type Ctx2D } from '../src/overlays/types.ts';
import { availableOverlays, getOverlay, overlayPixelSize, renderOverlayFrame, textInstant } from '../src/overlays/registry.ts';
import { frameCountFor, registerEmbeddedFonts, renderOverlay } from '../src/node/index.ts';
import { encodeFit, syntheticRide } from './helpers/synthetic.ts';
import { FFMPEG, tmpDir } from './helpers/ffmpeg.ts';

const synth = syntheticRide();
const ride = buildRide(parseFit(encodeFit(synth.samples)));
const t = synth.climb.startT + 60_000;

describe('overlay renderers', () => {
  registerEmbeddedFonts();
  for (const def of availableOverlays(ride)) {
    it(`${def.id} draws something with a transparent background`, () => {
      const style = { ...DEFAULT_STYLE, scale: 1 };
      const { width, height } = overlayPixelSize(def, style);
      const c = createCanvas(width, height);
      const ctx = c.getContext('2d');
      renderOverlayFrame(ctx as unknown as Ctx2D, def, t, style, { ride, clipStart: t - 1000, clipEnd: t + 10_000 });
      const data = ctx.getImageData(0, 0, width, height).data;
      let opaque = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) opaque++;
      const px = width * height;
      expect(opaque).toBeGreaterThan(px * 0.01);
      expect(opaque).toBeLessThan(px * 0.95);
      // corners are transparent
      expect(data[3]).toBe(0);
    });
  }

  it('text updates are quantised to the configured rate relative to clip start', () => {
    expect(textInstant(1000 + 260, 1000, 4)).toBe(1250);
    expect(textInstant(1000 + 249, 1000, 4)).toBe(1000);
  });

  it('frame count follows duration × fps', () => {
    expect(frameCountFor(20_000, { num: 60000, den: 1001 })).toBe(1199);
    expect(frameCountFor(10_000, { num: 25, den: 1 })).toBe(250);
  });
});

describe('ProRes 4444 export', () => {
  it('writes a .mov with alpha, the clip fps and the clip duration', async () => {
    const out = join(tmpDir(), 'velocidade.mov');
    const fps = { num: 30000, den: 1001 };
    const res = await renderOverlay({
      def: getOverlay('speed'),
      style: { ...DEFAULT_STYLE, scale: 1 },
      octx: { ride, clipStart: t, clipEnd: t + 2000 },
      durationMs: 2002,
      fps,
      outPath: out,
    });
    expect(res.frames).toBe(60);
    let info = '';
    try {
      execFileSync(FFMPEG, ['-hide_banner', '-i', out], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e: any) {
      info = String(e.stderr);
    }
    expect(info).toMatch(/prores \(4444\)/);
    expect(info).toMatch(/yuva444p/);
    expect(info).toMatch(/29\.97 fps/);
    expect(info).toMatch(/Duration: 00:00:02\.0[0-9]/);
  });

  it('can be cancelled', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(
      renderOverlay({
        def: getOverlay('map'),
        style: DEFAULT_STYLE,
        octx: { ride, clipStart: t, clipEnd: t + 5000 },
        durationMs: 5000,
        fps: { num: 30, den: 1 },
        outPath: join(tmpDir(), 'x.mov'),
        signal: ac.signal,
      }),
    ).rejects.toThrow(/Cancelado/);
  });
});
