import { describe, expect, it } from 'vitest';
import { mimeOf, normalizeOutputDir } from '../src/lib/local/android.ts';

describe('Android output folder', () => {
  it('accepts folders inside Documents or Download, tidied up', () => {
    expect(normalizeOutputDir('Documents/telemeSYNC')).toBe('Documents/telemeSYNC');
    expect(normalizeOutputDir(' documents\\telemeSYNC\\Voltas/ ')).toBe('Documents/telemeSYNC/Voltas');
    expect(normalizeOutputDir('Download')).toBe('Download');
    expect(normalizeOutputDir('Documents/a:b')).toBe('Documents/a_b');
  });

  it('refuses other places and relative tricks', () => {
    expect(normalizeOutputDir('Movies/telemeSYNC')).toBeUndefined();
    expect(normalizeOutputDir('Documents/../Android/data')).toBeUndefined();
    expect(normalizeOutputDir('')).toBeUndefined();
  });

  it('gives each export the MIME type MediaStore expects', () => {
    expect(mimeOf('a/b_speed.mov')).toBe('video/quicktime');
    expect(mimeOf('a/b.webm')).toBe('video/webm');
    expect(mimeOf('a/000001.png')).toBe('image/png');
    expect(mimeOf('a/sync-report.txt')).toBe('text/plain');
  });
});
