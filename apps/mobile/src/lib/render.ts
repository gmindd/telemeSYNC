// Video + overlays → MP4, entirely on the device: Mediabunny reads the clip and drives WebCodecs (hardware
// decoder and encoder); each frame is drawn on a canvas with the core's gadgets on top (the same renderers as
// the desktop preview and export), then encoded as H.264 with the clip's own audio.
import {
  compositeFrameKey,
  compositeSize,
  drawComposite,
  resolveLayout,
  type Ctx2D,
  type GadgetLayout,
  type OverlayId,
  type OverlayStyle,
  type RideData,
} from '@telemesync/core';
import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output, QUALITY_HIGH, type InputVideoTrack } from 'mediabunny';
import type { Crop } from './formats.ts';

export interface RenderSettings {
  ride: RideData;
  /** UTC ms of the clip's first frame (after the sync adjustment). */
  clipStartUtcMs: number;
  overlays: OverlayId[];
  /** Places chosen in the editor (fractions of the exported frame); the others get the default layout. */
  layout: GadgetLayout;
  style: OverlayStyle;
  /** Part of the clip kept (displayed pixels); the whole frame when absent. */
  crop?: Crop;
  /** Part of the clip to export, in seconds from its start. */
  trim: { start: number; end: number };
  /** Short side of the output (1080 = Full HD). */
  shortSide: number;
  /**
   * Social formats: their exact width / height. They are exported at the networks' standard size (1080 × 1920
   * for 9:16…) even when the crop has fewer pixels; the clip's own format never goes above its resolution.
   */
  formatAspect?: number;
}

export interface VideoInfo {
  width: number;
  height: number;
  durationS: number;
  codec: string | null;
  canDecode: boolean;
  hasAudio: boolean;
}

export interface RenderProgress {
  progress: number;
  frames: number;
  elapsedMs: number;
  /** Seconds of video processed. */
  processedS: number;
}

export interface RenderResult {
  data: Uint8Array;
  width: number;
  height: number;
  frames: number;
  elapsedMs: number;
  durationS: number;
}

function openInput(file: Blob): Input {
  return new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
}

async function videoTrack(input: Input): Promise<InputVideoTrack> {
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('O ficheiro não tem vídeo.');
  return track;
}

export async function probeVideo(file: Blob): Promise<VideoInfo> {
  const input = openInput(file);
  try {
    const track = await videoTrack(input);
    return {
      width: track.displayWidth,
      height: track.displayHeight,
      durationS: await input.computeDuration(),
      codec: await track.getCodecParameterString(),
      canDecode: await track.canDecode(),
      hasAudio: !!(await input.getPrimaryAudioTrack()),
    };
  } finally {
    input.dispose();
  }
}

/** Output size: a social format's exact shape at `shortSide`, or the kept part's shape capped at its own pixels. */
export function outputSizeFor(w: number, h: number, shortSide: number, formatAspect?: number): { width: number; height: number } {
  return formatAspect ? compositeSize(formatAspect, 1, shortSide) : compositeSize(w, h, Math.min(shortSide, Math.min(w, h)));
}

function outputSize(track: InputVideoTrack, s: RenderSettings): { width: number; height: number } {
  return outputSizeFor(s.crop?.width ?? track.displayWidth, s.crop?.height ?? track.displayHeight, s.shortSide, s.formatAspect);
}

/** Draws the chosen gadgets for an instant; redraws only when the image can change (text-rate gadgets). */
function overlayPainter(s: RenderSettings, width: number, height: number) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  const placements = resolveLayout(s.overlays, s.layout, width / height, s.style);
  const octx = { ride: s.ride, clipStart: s.clipStartUtcMs, clipEnd: s.clipStartUtcMs + s.trim.end * 1000 };
  let lastKey = Number.NaN;
  return (t: number): OffscreenCanvas => {
    const key = compositeFrameKey(s.overlays, t, s.clipStartUtcMs, s.style);
    if (key !== lastKey) {
      drawComposite(ctx as unknown as Ctx2D, s.overlays, placements, t, s.style, octx, width, height);
      lastKey = key;
    }
    return canvas;
  };
}

export async function renderVideo(file: Blob, s: RenderSettings, onProgress: (p: RenderProgress) => void, signal?: AbortSignal): Promise<RenderResult> {
  const input = openInput(file);
  try {
    const track = await videoTrack(input);
    const { width, height } = outputSize(track, s);
    const first = await track.getFirstTimestamp();
    const frame = new OffscreenCanvas(width, height);
    const fctx = frame.getContext('2d')!;
    const paint = overlayPainter(s, width, height);
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });

    const startedAt = performance.now();
    let frames = 0;
    // Whether process() gets input timestamps or output ones (starting at 0 after the trim) is found on the first frame.
    let tsShift: number | undefined;
    const conversion = await Conversion.init({
      input,
      output,
      trim: { start: first + s.trim.start, end: first + s.trim.end },
      video: {
        crop: s.crop,
        width,
        height,
        fit: 'fill',
        // Rotation baked into the pixels, so the gadgets are drawn upright over portrait phone videos
        allowTransformationMetadata: false,
        codec: 'avc',
        quality: QUALITY_HIGH,
        forceTranscode: true,
        processedWidth: width,
        processedHeight: height,
        process: (sample) => {
          if (tsShift === undefined) tsShift = sample.timestamp < first + s.trim.start - 0.25 ? s.trim.start : -first;
          const tClip = sample.timestamp + tsShift; // seconds from the clip's first frame
          fctx.clearRect(0, 0, width, height);
          sample.draw(fctx, 0, 0, width, height);
          fctx.drawImage(paint(s.clipStartUtcMs + tClip * 1000), 0, 0);
          frames++;
          return frame;
        },
      },
    });
    if (!conversion.isValid) {
      const why = conversion.discardedTracks.map((d) => `${d.track.type}: ${d.reason}`).join(', ');
      throw new Error(`Não é possível converter este vídeo neste aparelho (${why}).`);
    }
    conversion.onProgress = (progress, processedS) => onProgress({ progress, frames, elapsedMs: performance.now() - startedAt, processedS });
    const abort = () => void conversion.cancel();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      await conversion.execute();
    } finally {
      signal?.removeEventListener('abort', abort);
    }
    return {
      data: new Uint8Array(target.buffer!),
      width,
      height,
      frames,
      elapsedMs: performance.now() - startedAt,
      durationS: s.trim.end - s.trim.start,
    };
  } finally {
    input.dispose();
  }
}
