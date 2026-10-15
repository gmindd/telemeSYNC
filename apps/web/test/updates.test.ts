import { describe, expect, it } from 'vitest';
import { isNewer, parseRelease } from '../src/lib/updates.ts';

describe('isNewer', () => {
  it('compares versions number by number', () => {
    expect(isNewer('0.4.0', '0.3.1')).toBe(true);
    expect(isNewer('0.10.0', '0.9.2')).toBe(true);
    expect(isNewer('1.0', '0.9.9')).toBe(true);
    expect(isNewer('0.3.1', '0.3.1')).toBe(false);
    expect(isNewer('0.3.0', '0.3.1')).toBe(false);
    expect(isNewer('v0.3.2', '0.3.1')).toBe(true);
    expect(isNewer('0.3.1-beta', '0.3.1')).toBe(false);
  });
});

describe('parseRelease', () => {
  const ok = { version: '0.4.0', downloadUrl: 'https://x/a.zip', changelogUrl: 'https://x/#novidades' };
  it('accepts a valid release', () => {
    expect(parseRelease({ ...ok, summary: 'Novidades' })).toMatchObject({ version: '0.4.0', summary: 'Novidades' });
  });
  it('rejects missing fields and non-https links', () => {
    expect(parseRelease(null)).toBeNull();
    expect(parseRelease({ ...ok, version: 'abc' })).toBeNull();
    expect(parseRelease({ ...ok, downloadUrl: 'http://x/a.zip' })).toBeNull();
    expect(parseRelease({ ...ok, changelogUrl: 'javascript:alert(1)' })).toBeNull();
  });
  it('picks the download for the system', () => {
    const downloads = { windows: 'https://x/w.zip', mac: 'https://x/m.zip' };
    expect(parseRelease({ ...ok, downloads }, 'mac')?.downloadUrl).toBe('https://x/m.zip');
    expect(parseRelease({ ...ok, downloads }, 'windows')?.downloadUrl).toBe('https://x/w.zip');
    expect(parseRelease(ok, 'windows')?.downloadUrl).toBe('https://x/a.zip');
    // No Mac package yet, or a bad link: the Mac version sends people to the site, never to the Windows ZIP.
    expect(parseRelease(ok, 'mac')?.downloadUrl).toBe('https://x/#novidades');
    expect(parseRelease({ ...ok, downloads: { mac: 'http://x/m.zip' } }, 'mac')?.downloadUrl).toBe('https://x/#novidades');
  });
});
