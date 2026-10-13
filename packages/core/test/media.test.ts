import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { readClipMetadataFromPath } from '../src/node/fileSource.ts';
import { fpsValue } from '../src/media/isobmff.ts';
import { makeClip, tmpDir } from './helpers/ffmpeg.ts';

const dir = tmpDir();

describe('ISO-BMFF metadata reader', () => {
  it('reads duration, fps, size and creation_time (moov at end)', async () => {
    const p = join(dir, 'a.mp4');
    makeClip(p, { seconds: 2, fps: '60000/1001', size: '640x360', creationTime: '2024-06-15T09:30:05.000000Z' });
    const m = await readClipMetadataFromPath(p);
    expect(m.fps).toEqual({ num: 60000, den: 1001 });
    expect(m.durationMs).toBeGreaterThan(1990);
    expect(m.durationMs).toBeLessThan(2030);
    expect(m.width).toBe(640);
    expect(m.height).toBe(360);
    expect(m.codec).toBe('avc1');
    expect(m.creationTimeRawMs).toBe(Date.UTC(2024, 5, 15, 9, 30, 5));
    expect(m.handlers).toContain('vide');
    expect(m.hasGpmf).toBe(false);
  });

  it('works with faststart (moov at the beginning) and 25 fps', async () => {
    const p = join(dir, 'b.mp4');
    makeClip(p, { seconds: 1, fps: '25', faststart: true });
    const m = await readClipMetadataFromPath(p);
    expect(fpsValue(m.fps!)).toBe(25);
    expect(m.frameCount).toBe(25);
  });

  it('reads a tmcd start timecode from a MOV', async () => {
    const p = join(dir, 'c.mov');
    makeClip(p, { seconds: 1, fps: '30', timecode: '10:20:30:15' });
    const m = await readClipMetadataFromPath(p);
    expect(m.handlers).toContain('tmcd');
    expect(m.timecodeStartSec).toBeCloseTo(10 * 3600 + 20 * 60 + 30.5, 2);
  });

  it('fails with a clear message when the file is not a container', async () => {
    const { writeFileSync } = await import('node:fs');
    const p = join(dir, 'bad.mp4');
    writeFileSync(p, new Uint8Array(100));
    await expect(readClipMetadataFromPath(p)).rejects.toThrow(/moov/);
  });
});
