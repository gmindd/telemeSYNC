import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRide, parseFit } from '../src/index.ts';
import { DEFAULT_STYLE } from '../src/overlays/types.ts';
import { changesAtTextRate, getOverlay, overlayPixelSize } from '../src/overlays/registry.ts';
import { cappedFps, outputExtension, type VideoFormat } from '../src/export/formats.ts';
import { renderOverlay } from '../src/node/index.ts';
import { encodeFit, syntheticRide } from './helpers/synthetic.ts';
import { FFMPEG, tmpDir } from './helpers/ffmpeg.ts';

const synth = syntheticRide();
const ride = buildRide(parseFit(encodeFit(synth.samples)));
const t = synth.climb.startT + 60_000;

/** First frame decoded to RGBA (libvpx decoder for WebM, the native VP9 decoder drops alpha). */
function firstFrameRgba(path: string, width: number, height: number): Buffer {
  const pre = path.endsWith('.webm') ? ['-c:v', 'libvpx-vp9'] : [];
  const out = execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', ...pre, '-i', path, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], {
    maxBuffer: 64 * 1024 * 1024,
  });
  expect(out.length).toBe(width * height * 4);
  return out;
}

describe('export formats', () => {
  const formats: VideoFormat[] = ['animation', 'prores', 'ffv1', 'webm'];
  for (const format of formats) {
    it(`${format} keeps the alpha channel and the clip duration`, async () => {
      const out = join(tmpDir(), `velocidade${outputExtension(format)}`);
      const style = { ...DEFAULT_STYLE, scale: 1 };
      const def = getOverlay('speed');
      const res = await renderOverlay({ def, style, octx: { ride, clipStart: t, clipEnd: t + 1000 }, durationMs: 1000, fps: { num: 25, den: 1 }, outPath: out, format });
      expect(res.frames).toBe(25);
      expect(existsSync(out)).toBe(true);
      let info = '';
      try {
        execFileSync(FFMPEG, ['-hide_banner', '-i', out], { stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (e: any) {
        info = String(e.stderr);
      }
      expect(info).toMatch(/Duration: 00:00:01\.0[0-9]/);
      const { width, height } = overlayPixelSize(def, style);
      const rgba = firstFrameRgba(out, width, height);
      let transparent = 0;
      let opaque = 0;
      for (let i = 3; i < rgba.length; i += 4) {
        if (rgba[i] === 0) transparent++;
        else if (rgba[i] > 250) opaque++;
      }
      expect(transparent).toBeGreaterThan(width * height * 0.3);
      expect(opaque).toBeGreaterThan(width * height * 0.02);
    });
  }

  it('caps the overlay frame rate to a whole fraction of the clip rate', () => {
    expect(cappedFps({ num: 60000, den: 1001 }, 600, 30)).toEqual({ fps: { num: 60000, den: 2002 }, frames: 300 });
    expect(cappedFps({ num: 50, den: 1 }, 101, 30)).toEqual({ fps: { num: 50, den: 2 }, frames: 51 });
    expect(cappedFps({ num: 120, den: 1 }, undefined, 30).fps).toEqual({ num: 120, den: 4 });
    expect(cappedFps({ num: 30000, den: 1001 }, 300, 30)).toEqual({ fps: { num: 30000, den: 1001 }, frames: 300 });
    expect(cappedFps({ num: 60, den: 1 }, 600, 0)).toEqual({ fps: { num: 60, den: 1 }, frames: 600 });
  });

  it('panels in "text" mode change only at the text rate', () => {
    const def = getOverlay('panelSpeed');
    expect(changesAtTextRate(def, DEFAULT_STYLE)).toBe(false);
    expect(changesAtTextRate(def, { ...DEFAULT_STYLE, panelRate: 'text' })).toBe(true);
    expect(changesAtTextRate(getOverlay('speed'), DEFAULT_STYLE)).toBe(true);
  });
});
