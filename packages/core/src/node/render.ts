import { createCanvas } from '@napi-rs/canvas';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Fps } from '../media/types.ts';
import { frameState, overlayPixelSize, textInstant } from '../overlays/registry.ts';
import type { Ctx2D, OverlayContext, OverlayDefinition, OverlayStyle } from '../overlays/types.ts';
import { FfmpegSink } from './ffmpeg.ts';
import { registerEmbeddedFonts } from './fonts.ts';

export type OutputFormat = 'prores' | 'png';

export interface RenderOverlayOptions {
  def: OverlayDefinition;
  style: OverlayStyle;
  octx: OverlayContext;
  durationMs: number;
  fps: Fps;
  /** Exact frame count of the clip, if known (overrides duration × fps). */
  frames?: number;
  /** .mov path for ProRes; directory for PNG sequence. */
  outPath: string;
  format?: OutputFormat;
  signal?: AbortSignal;
  /** Called with 0..1 at most every ~1 % of frames. */
  onProgress?: (fraction: number, frame: number, totalFrames: number) => void;
}

export function frameCountFor(durationMs: number, fps: Fps): number {
  return Math.max(1, Math.round((durationMs / 1000) * (fps.num / fps.den)));
}

const yieldToLoop = () => new Promise<void>((r) => setImmediate(r));

/** Renders one overlay for one clip: same duration and fps as the clip, transparent background. */
export async function renderOverlay(o: RenderOverlayOptions): Promise<{ frames: number; width: number; height: number }> {
  registerEmbeddedFonts();
  const { width, height } = overlayPixelSize(o.def, o.style);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d') as unknown as Ctx2D & { getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray } };
  const total = o.frames && o.frames > 0 ? o.frames : frameCountFor(o.durationMs, o.fps);
  const format = o.format ?? 'prores';
  const frameMs = (1000 * o.fps.den) / o.fps.num;

  await mkdir(format === 'png' ? o.outPath : dirname(o.outPath), { recursive: true });
  const sink = format === 'prores' ? new FfmpegSink({ width, height, fps: o.fps, outPath: o.outPath }) : undefined;

  let lastKey: number | undefined;
  let lastFrame: Uint8Array | undefined;
  const progressStep = Math.max(1, Math.floor(total / 100));
  try {
    for (let i = 0; i < total; i++) {
      if (o.signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
      const t = o.octx.clipStart + i * frameMs;
      // Text-only overlays change only at the text rate: reuse the previous frame.
      const key = o.def.textOnly ? textInstant(t, o.octx.clipStart, o.style.textRateHz) : t;
      let frame: Uint8Array;
      if (lastFrame && key === lastKey) frame = lastFrame;
      else {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.save();
        ctx.setTransform(o.style.scale, 0, 0, o.style.scale, 0, 0);
        o.def.draw(ctx, frameState(t, o.style, o.octx), o.style, o.octx);
        ctx.restore();
        const data = ctx.getImageData(0, 0, width, height).data;
        frame = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        lastFrame = frame;
        lastKey = key;
      }
      if (sink) await sink.write(frame);
      else {
        const png = await canvas.encode('png');
        await writeFile(join(o.outPath, `${String(i).padStart(6, '0')}.png`), png);
      }
      if (i % progressStep === 0 || i === total - 1) {
        o.onProgress?.((i + 1) / total, i + 1, total);
        await yieldToLoop();
      }
    }
    await sink?.finish();
  } catch (e) {
    sink?.abort();
    if (format === 'prores') await rm(o.outPath, { force: true });
    throw e;
  }
  return { frames: total, width, height };
}
