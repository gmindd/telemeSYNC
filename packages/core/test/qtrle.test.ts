import { execFileSync } from 'node:child_process';
import { closeSync, openSync, readFileSync, statSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MovWriter, QtrleEncoder, type ByteSink } from '../src/index.ts';
import { FFMPEG, tmpDir } from './helpers/ffmpeg.ts';

function fileSink(path: string): ByteSink & { close(): void } {
  const fd = openSync(path, 'w');
  let pos = 0;
  return {
    write(d) {
      writeSync(fd, d, 0, d.byteLength, pos);
      pos += d.byteLength;
    },
    writeAt(off, d) {
      writeSync(fd, d, 0, d.byteLength, off);
    },
    close: () => closeSync(fd),
  };
}

/** Frames with every case the encoder handles: transparent areas, runs, noise, partial alpha, static frames. */
function frame(i: number, w: number, h: number): Uint8Array {
  const f = new Uint8Array(w * h * 4);
  let seed = 7 + Math.floor(i / 3);
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 24);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (x >= 10 + i && x < 40 + i && y >= 5 && y < 30) f.set([255, 120, 0, 255], o); // moving box
      else if (y > h - 12 && x < (i % 4) * 30) f.set([rnd(), rnd(), rnd(), rnd() | 1], o); // noise, changes every 3 frames
      else if (x === w - 1 - (y % 7)) f.set([20, 200, 90, 128], o); // semi-transparent diagonal
    }
  }
  return f;
}

describe('QuickTime Animation encoder', async () => {
  it('writes a .mov that FFmpeg decodes back to the exact pixels', async () => {
    const w = 300; // > 254 so skips need several codes, and > 128 so runs split
    const h = 64;
    const n = 12;
    const fps = { num: 30000, den: 1001 };
    const out = join(tmpDir(), 'anim.mov');
    const sink = fileSink(out);
    const enc = new QtrleEncoder(w, h);
    const mov = new MovWriter(sink, { width: w, height: h, fps, codec: 'rle ', depth: 32, compressorName: 'Animation' });
    const frames: Uint8Array[] = [];
    await mov.start();
    for (let i = 0; i < n; i++) {
      // frames 6 and 7 equal frame 5 (no change at all)
      const f = frame(i >= 6 && i <= 7 ? 5 : i, w, h);
      frames.push(f);
      await mov.addSample(enc.encode(f, i % 10 === 0), i % 10 === 0);
    }
    await mov.finish();
    sink.close();

    const raw = execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', out, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 28 });
    expect(raw.length).toBe(w * h * 4 * n);
    for (let i = 0; i < n; i++) {
      const got = raw.subarray(i * w * h * 4, (i + 1) * w * h * 4);
      expect(Buffer.compare(got, Buffer.from(frames[i])), `frame ${i}`).toBe(0);
    }
  });

  it('reports codec, size and frame rate like an FFmpeg qtrle file', async () => {
    const w = 64;
    const h = 32;
    const out = join(tmpDir(), 'meta.mov');
    const sink = fileSink(out);
    const enc = new QtrleEncoder(w, h);
    const mov = new MovWriter(sink, { width: w, height: h, fps: { num: 25, den: 1 }, codec: 'rle ', depth: 32, compressorName: 'Animation' });
    await mov.start();
    for (let i = 0; i < 50; i++) await mov.addSample(enc.encode(frame(i % 20, w, h), i % 25 === 0), i % 25 === 0);
    await mov.finish();
    sink.close();
    let log = '';
    try {
      execFileSync(FFMPEG, ['-hide_banner', '-i', out], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      log = String((e as { stderr: Buffer }).stderr);
    }
    expect(log).toMatch(/qtrle/);
    expect(log).toMatch(/argb/);
    expect(log).toMatch(/64x32/);
    expect(log).toMatch(/25 fps/);
    expect(log).toMatch(/Duration: 00:00:02\.00/);
    expect(statSync(out).size).toBeGreaterThan(0);
    expect(readFileSync(out).subarray(4, 8).toString()).toBe('ftyp');
  });
});
