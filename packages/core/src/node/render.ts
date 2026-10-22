import { createCanvas } from '@napi-rs/canvas';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { OutputFormat } from '../export/formats.ts';
import type { Fps } from '../media/types.ts';
import { changesAtTextRate, frameState, overlayPixelSize, textInstant } from '../overlays/registry.ts';
import { compositeFrameKey, drawComposite, type GadgetPlacement } from '../overlays/layout.ts';
import type { Ctx2D, OverlayContext, OverlayDefinition, OverlayId, OverlayStyle } from '../overlays/types.ts';
import { setNumberLang } from '../overlays/units.ts';
import { FfmpegSink } from './ffmpeg.ts';
import { registerEmbeddedFonts } from './fonts.ts';

export type { OutputFormat } from '../export/formats.ts';

export interface RenderOverlayOptions {
  def: OverlayDefinition;
  style: OverlayStyle;
  octx: OverlayContext;
  durationMs: number;
  fps: Fps;
  /** Exact frame count of the clip, if known (overrides duration × fps). */
  frames?: number;
  /** Video file path; directory for a PNG sequence. */
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

interface FrameSource {
  width: number;
  height: number;
  /** Frames with the same key are identical (allows reuse). */
  key(t: number): number;
  draw(ctx: Ctx2D, t: number): void;
}

type SinkOptions = Omit<RenderOverlayOptions, 'def' | 'style'>;

/** Shared frame loop: draws each frame, reads RGBA and pipes it to FFmpeg (or writes PNGs). */
async function renderFrames(src: FrameSource, o: SinkOptions): Promise<{ frames: number; width: number; height: number }> {
  registerEmbeddedFonts();
  const { width, height } = src;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d') as unknown as Ctx2D & { getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray } };
  const total = o.frames && o.frames > 0 ? o.frames : frameCountFor(o.durationMs, o.fps);
  const format = o.format ?? 'prores';
  const frameMs = (1000 * o.fps.den) / o.fps.num;

  await mkdir(format === 'png' ? o.outPath : dirname(o.outPath), { recursive: true });
  const sink = format !== 'png' ? new FfmpegSink({ width, height, fps: o.fps, outPath: o.outPath, format }) : undefined;

  let lastKey: number | undefined;
  let lastFrame: Uint8Array | undefined;
  const progressStep = Math.max(1, Math.floor(total / 100));
  try {
    for (let i = 0; i < total; i++) {
      if (o.signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
      const t = o.octx.clipStart + i * frameMs;
      const key = src.key(t);
      let frame: Uint8Array;
      if (lastFrame && key === lastKey) frame = lastFrame;
      else {
        src.draw(ctx, t);
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
    if (format !== 'png') await rm(o.outPath, { force: true });
    throw e;
  }
  return { frames: total, width, height };
}

/** Renders one overlay for one clip: same duration and fps as the clip, transparent background. */
export function renderOverlay(o: RenderOverlayOptions): Promise<{ frames: number; width: number; height: number }> {
  const { width, height } = overlayPixelSize(o.def, o.style);
  return renderFrames(
    {
      width,
      height,
      // Overlays that change only at the text rate reuse the previous frame.
      key: (t) => (changesAtTextRate(o.def, o.style) ? textInstant(t, o.octx.clipStart, o.style.textRateHz) : t),
      draw: (ctx, t) => {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.save();
        ctx.setTransform(o.style.scale, 0, 0, o.style.scale, 0, 0);
        setNumberLang(o.style.language);
        o.def.draw(ctx, frameState(t, o.style, o.octx), o.style, o.octx);
        ctx.restore();
      },
    },
    o,
  );
}

export interface RenderCompositeOptions extends SinkOptions {
  overlays: OverlayId[];
  placements: Record<OverlayId, GadgetPlacement>;
  style: OverlayStyle;
  width: number;
  height: number;
}

/** Renders all gadgets in their positions into one transparent video the size of the frame. */
export function renderComposite(o: RenderCompositeOptions): Promise<{ frames: number; width: number; height: number }> {
  return renderFrames(
    {
      width: o.width,
      height: o.height,
      key: (t) => compositeFrameKey(o.overlays, t, o.octx.clipStart, o.style),
      draw: (ctx, t) => drawComposite(ctx, o.overlays, o.placements, t, o.style, o.octx, o.width, o.height),
    },
    o,
  );
}
