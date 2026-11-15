import { describe, expect, it } from 'vitest';
import { defaultName, fileNameFor } from '../src/lib/save.ts';

describe('export file name', () => {
  it('keeps accents and spaces, replaces folders and reserved characters, ends in .mp4', () => {
    expect(fileNameFor('Volta à Serra: dia 1/2')).toBe('Volta à Serra- dia 1-2.mp4');
    expect(fileNameFor('  passeio.mp4 ')).toBe('passeio.mp4');
    expect(fileNameFor('../..')).toBe('telemesync.mp4');
    expect(fileNameFor('')).toBe('telemesync.mp4');
    expect(fileNameFor('x'.repeat(200))).toBe(`${'x'.repeat(80)}.mp4`);
  });

  it('suggests a name from the clip time and the social format', () => {
    const at = new Date(2026, 9, 11, 9, 40).getTime();
    expect(defaultName(at, 'original')).toBe('telemesync-2026-10-11-0940');
    expect(defaultName(at, '9:16')).toBe('telemesync-2026-10-11-0940-9x16');
  });
});
