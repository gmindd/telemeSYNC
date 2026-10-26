/// <reference lib="webworker" />
/**
 * Browser worker that renders one export without the server: draws each frame on an OffscreenCanvas with the
 * same renderers as the preview, encodes it (QuickTime Animation, PNG or VP9 with alpha) and hands the bytes
 * to the page, which writes them through the Android bridge. One worker per export, several in parallel.
 */
import {
  compositeFrameSource,
  frameCountFor,
  getOverlay,
  keyFrameInterval,
  MovWriter,
  overlayFrameSource,
  QtrleEncoder,
  WebmWriter,
  type ByteSink,
  type Ctx2D,
  type Fps,
} from '@telemesync/core';
import { loadEmbeddedFonts } from '../fonts.ts';
import { toBase64 } from './base64.ts';
import { VP9_CODEC } from './formats.ts';
import type { LocalTaskJob, ToMain, ToWorker, WorkerRequest } from './protocol.ts';

const scope = self as unknown as DedicatedWorkerGlobalScope;
let aborted = false;
let seq = 0;
const waiting = new Map<number, { resolve: () => void; reject: (e: Error) => void }>();

const post = (m: ToMain) => scope.postMessage(m);

scope.onmessage = (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  if (m.type === 'start') {
    run(m.job).then(
      () => post({ type: 'done' }),
      (e) => post(aborted ? { type: 'aborted' } : { type: 'error', message: e instanceof Error ? e.message : String(e) }),
    );
  } else if (m.type === 'ack') {
    const w = waiting.get(m.seq);
    waiting.delete(m.seq);
    if (m.error) w?.reject(new Error(m.error));
    else w?.resolve();
  } else if (m.type === 'abort') aborted = true;
};

/** Sends bytes to the page and waits until they are written (keeps memory flat when the disk is slower). */
function request(r: WorkerRequest): Promise<void> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    post({ ...r, seq: id });
  });
}

/** Groups small writes (a static overlay frame is a few bytes) into ~1 MB transfers. */
class BufferedSink implements ByteSink {
  private parts: Uint8Array[] = [];
  private size = 0;

  async write(data: Uint8Array) {
    this.parts.push(data.slice());
    this.size += data.byteLength;
    if (this.size >= 1 << 20) await this.flush();
  }

  async writeAt(offset: number, data: Uint8Array) {
    await this.flush();
    await request({ type: 'writeAt', offset, b64: toBase64(data) });
  }

  async flush() {
    if (!this.size) return;
    const all = new Uint8Array(this.size);
    let o = 0;
    for (const p of this.parts) {
      all.set(p, o);
      o += p.byteLength;
    }
    this.parts = [];
    this.size = 0;
    await request({ type: 'write', b64: toBase64(all) });
  }
}

interface FrameOutput {
  /** Frame `i`; `same` = identical to the previous one (nothing redrawn). */
  frame(i: number, same: boolean, key: boolean): Promise<void>;
  finish(): Promise<void>;
}

const even = (n: number) => n + (n % 2);

async function run(job: LocalTaskJob) {
  await loadEmbeddedFonts(scope.fonts);
  const octx = { ride: job.ride, clipStart: job.clipStart, clipEnd: job.clipEnd };
  const src =
    job.overlay === 'composite'
      ? compositeFrameSource({ overlays: job.overlays!, placements: job.placements!, style: job.style, octx, width: job.compositeWidth!, height: job.compositeHeight! })
      : overlayFrameSource(getOverlay(job.overlay), job.style, octx);
  // 4:2:0 video needs even sizes: VP9 gets one transparent row/column more when the gadget is odd.
  const width = job.format === 'webm' ? even(src.width) : src.width;
  const height = job.format === 'webm' ? even(src.height) : src.height;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const pixels = () => ctx.getImageData(0, 0, width, height).data;
  const total = job.frames && job.frames > 0 ? job.frames : frameCountFor(job.durationMs, job.fps);
  const frameMs = (1000 * job.fps.den) / job.fps.num;
  const gop = keyFrameInterval(job.fps);

  const out: FrameOutput =
    job.format === 'webm' ? await webmOutput(width, height, pixels, job.fps, gop) : job.format === 'png' ? pngOutput(canvas) : animationOutput(width, height, job.fps, pixels);

  let lastKey: number | undefined;
  const step = Math.max(1, Math.floor(total / 200));
  for (let i = 0; i < total; i++) {
    if (aborted) throw new DOMException('Cancelled', 'AbortError');
    const t = job.clipStart + i * frameMs;
    const k = src.key(t);
    const same = lastKey !== undefined && k === lastKey;
    if (!same) {
      src.draw(ctx as unknown as Ctx2D, t);
      lastKey = k;
    }
    await out.frame(i, same, i % gop === 0);
    if (i % step === 0) post({ type: 'progress', value: (i + 1) / total });
  }
  await out.finish();
  post({ type: 'progress', value: 1 });
}

/** QuickTime Animation in a .mov: lossless, only the changed lines of each frame are stored. */
function animationOutput(width: number, height: number, fps: Fps, pixels: () => Uint8ClampedArray): FrameOutput {
  const sink = new BufferedSink();
  const enc = new QtrleEncoder(width, height);
  const mov = new MovWriter(sink, { width, height, fps, codec: 'rle ', depth: 32, compressorName: 'Animation' });
  const unchanged = new Uint8Array([0, 0, 0, 7, 0, 0, 0]); // chunk size 7, header 0, end: "no change"
  let started = false;
  return {
    async frame(_i, same, key) {
      if (!started) {
        await mov.start();
        started = true;
      }
      if (same && !key) await mov.addSample(unchanged, false);
      else await mov.addSample(enc.encode(pixels(), key), key);
    },
    async finish() {
      await mov.finish();
      await sink.flush();
    },
  };
}

/** One PNG per frame (000000.png…), identical frames reuse the previous image. */
function pngOutput(canvas: OffscreenCanvas): FrameOutput {
  let last: string | undefined;
  return {
    async frame(i, same) {
      if (!same || !last) last = toBase64(new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer()));
      await request({ type: 'file', name: `${String(i).padStart(6, '0')}.png`, b64: last });
    },
    async finish() {},
  };
}

/**
 * WebM VP9 with alpha through WebCodecs: one encoder for the colour, another for the alpha plane (as the luma
 * of an I420 frame), muxed like FFmpeg's libvpx output.
 */
async function webmOutput(width: number, height: number, pixels: () => Uint8ClampedArray, fps: Fps, gop: number): Promise<FrameOutput> {
  const rate = fps.num / fps.den;
  const sink = new BufferedSink();
  const webm = new WebmWriter(sink, { width, height, fps });
  await webm.start();
  let failure: Error | undefined;
  const queue = (list: { data: Uint8Array; key: boolean }[]) => (chunk: EncodedVideoChunk) => {
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    list.push({ data, key: chunk.type === 'key' });
  };
  const colorOut: { data: Uint8Array; key: boolean }[] = [];
  const alphaOut: { data: Uint8Array; key: boolean }[] = [];
  const onError = (e: DOMException) => (failure = e);
  const color = new VideoEncoder({ output: queue(colorOut), error: onError });
  const alpha = new VideoEncoder({ output: queue(alphaOut), error: onError });
  const pixelsPerSecond = width * height * rate;
  color.configure({ codec: VP9_CODEC, width, height, framerate: rate, bitrate: Math.round(pixelsPerSecond * 0.15), alpha: 'discard' });
  alpha.configure({ codec: VP9_CODEC, width, height, framerate: rate, bitrate: Math.round(pixelsPerSecond * 0.05) });

  const ySize = width * height;
  const cSize = (width / 2) * (height / 2);
  const i420 = new Uint8Array(ySize + 2 * cSize).fill(128);
  let rgba: Uint8ClampedArray | undefined;
  const usec = (i: number) => Math.round((i * 1e6 * fps.den) / fps.num);

  const drain = async () => {
    while (colorOut.length && alphaOut.length) {
      const c = colorOut.shift()!;
      const a = alphaOut.shift()!;
      // A frame is a key frame only when both streams restart there.
      await webm.addFrame(c.data, a.data, c.key && a.key);
    }
  };
  const wait = async (enc: VideoEncoder) => {
    while (enc.encodeQueueSize > 3 && !failure) await new Promise((r) => setTimeout(r, 2));
  };

  return {
    async frame(i, same, key) {
      if (failure) throw failure;
      if (!same || !rgba) {
        // getImageData is straight (not premultiplied) alpha, as FFmpeg's yuva420p: a frame made from the
        // canvas itself would darken semi-transparent areas.
        rgba = pixels();
        for (let p = 0; p < ySize; p++) i420[p] = rgba[p * 4 + 3];
      }
      const timestamp = usec(i);
      const duration = usec(i + 1) - timestamp;
      const c = new VideoFrame(rgba, { format: 'RGBA', codedWidth: width, codedHeight: height, timestamp, duration });
      color.encode(c, { keyFrame: key || i % gop === 0 });
      c.close();
      const a = new VideoFrame(i420, { format: 'I420', codedWidth: width, codedHeight: height, timestamp, duration });
      alpha.encode(a, { keyFrame: key || i % gop === 0 });
      a.close();
      await wait(color);
      await wait(alpha);
      await drain();
    },
    async finish() {
      await Promise.all([color.flush(), alpha.flush()]);
      if (failure) throw failure;
      await drain();
      color.close();
      alpha.close();
      await webm.finish();
      await sink.flush();
    },
  };
}
