import { execFileSync } from 'node:child_process';
import { closeSync, openSync, readFileSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WebmWriter } from '../src/index.ts';
import { FFMPEG, tmpDir } from './helpers/ffmpeg.ts';

/** Frames of an IVF file (what libvpx writes), with VP9 key-frame flags. */
function ivfFrames(buf: Buffer): { data: Uint8Array; key: boolean }[] {
  const frames = [];
  let o = buf.readUInt16LE(6);
  while (o + 12 <= buf.length) {
    const n = buf.readUInt32LE(o);
    const data = new Uint8Array(buf.subarray(o + 12, o + 12 + n));
    // profile 0: frame_marker(2) profile(2) show_existing(1) frame_type(1, 0 = key)
    frames.push({ data, key: (data[0] & 0x0c) === 0 });
    o += 12 + n;
  }
  return frames;
}

describe('WebM VP9 alpha writer', () => {
  it('muxes colour and alpha streams into a WebM FFmpeg decodes with transparency', async () => {
    const dir = tmpDir();
    const w = 96;
    const h = 64;
    const n = 20;
    const rgba = Buffer.alloc(w * h * 4 * n);
    for (let i = 0; i < n; i++) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const o = ((i * h + y) * w + x) * 4;
          const inBox = x >= 10 + i && x < 50 + i && y >= 10 && y < 40;
          rgba.set(inBox ? [230, 90, 20, 255] : x > 80 ? [40, 200, 255, 128] : [0, 0, 0, 0], o);
        }
      }
    }
    // Alpha plane as the luma of an I420 frame (chroma neutral), as the browser exporter builds it.
    const fs = (w * h * 3) / 2;
    const alpha = Buffer.alloc(fs * n, 128);
    for (let i = 0; i < n; i++) for (let p = 0; p < w * h; p++) alpha[i * fs + p] = rgba[(i * w * h + p) * 4 + 3];
    writeFileSync(join(dir, 'rgba.raw'), rgba);
    writeFileSync(join(dir, 'alpha.raw'), alpha);
    const vp9 = ['-c:v', 'libvpx-vp9', '-lossless', '1', '-g', '10', '-keyint_min', '10', '-auto-alt-ref', '0', '-lag-in-frames', '0', '-f', 'ivf'];
    const raw = (fmt: string, file: string) => ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', fmt, '-s', `${w}x${h}`, '-framerate', '25', '-i', join(dir, file)];
    execFileSync(FFMPEG, [...raw('rgba', 'rgba.raw'), '-pix_fmt', 'yuv420p', ...vp9, join(dir, 'color.ivf')]);
    execFileSync(FFMPEG, [...raw('yuv420p', 'alpha.raw'), ...vp9, join(dir, 'alpha.ivf')]);
    const color = ivfFrames(readFileSync(join(dir, 'color.ivf')));
    const alphaFrames = ivfFrames(readFileSync(join(dir, 'alpha.ivf')));
    expect(color.length).toBe(n);
    expect(alphaFrames.length).toBe(n);

    const out = join(dir, 'out.webm');
    const fd = openSync(out, 'w');
    let pos = 0;
    const sink = {
      write(d: Uint8Array) {
        writeSync(fd, d, 0, d.byteLength, pos);
        pos += d.byteLength;
      },
      writeAt(off: number, d: Uint8Array) {
        writeSync(fd, d, 0, d.byteLength, off);
      },
    };
    const webm = new WebmWriter(sink, { width: w, height: h, fps: { num: 25, den: 1 } });
    await webm.start();
    for (let i = 0; i < n; i++) await webm.addFrame(color[i].data, alphaFrames[i].data, color[i].key);
    await webm.finish();
    closeSync(fd);

    const decoded = execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-c:v', 'libvpx-vp9', '-i', out, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 26 });
    expect(decoded.length).toBe(rgba.length);
    let colorErr = 0;
    let opaque = 0;
    for (let p = 0; p < w * h * n; p++) {
      expect(decoded[p * 4 + 3]).toBe(rgba[p * 4 + 3]);
      if (rgba[p * 4 + 3] === 255) {
        opaque++;
        for (let c = 0; c < 3; c++) colorErr += Math.abs(decoded[p * 4 + c] - rgba[p * 4 + c]);
      }
    }
    expect(colorErr / opaque / 3).toBeLessThan(6); // 4:2:0 chroma blurs only the box edges

    let log = '';
    try {
      execFileSync(FFMPEG, ['-hide_banner', '-i', out], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      log = String((e as { stderr: Buffer }).stderr);
    }
    expect(log).toMatch(/vp9/);
    expect(log).toMatch(/alpha_mode\s*: 1/);
    expect(log).toMatch(/Duration: 00:00:00\.80/);
  });
});
