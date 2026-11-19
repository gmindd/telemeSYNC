import { describe, expect, it } from 'vitest';
import { checkForUpdate, isNewer, parseRelease, releaseSummary, withLang } from '../src/lib/updates.ts';

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

describe('release summary and links in the app language', () => {
  const ok = { version: '1.0.2', downloadUrl: 'https://x/a.zip', changelogUrl: 'https://telemesync.app/#novidades' };
  it('picks the summary of the language, then English, then the old one', () => {
    const r = parseRelease({ ...ok, summary: 'Antigo', summaries: { en: 'New', fr: 'Nouveau', xx: 'no' } })!;
    expect(releaseSummary(r, 'fr')).toBe('Nouveau');
    expect(releaseSummary(r, 'de')).toBe('New');
    expect(releaseSummary(r, 'pt')).toBe('Antigo');
    expect(r.summaries).not.toHaveProperty('xx');
  });
  it('adds the language to links to the site only', () => {
    expect(withLang(ok.changelogUrl, 'de')).toBe('https://telemesync.app/?lang=de#novidades');
    expect(withLang('https://telemesync.pereiragabriel.com/#novidades', 'fr')).toBe('https://telemesync.pereiragabriel.com/?lang=fr#novidades');
    expect(withLang('https://github.com/a.zip', 'de')).toBe('https://github.com/a.zip');
  });
});

describe('checkForUpdate with the new and the old address', () => {
  const NEW = 'https://telemesync.app/data/latest.json';
  const OLD = 'https://telemesync.pereiragabriel.com/data/latest.json';
  const release = { version: '1.2.2', downloadUrl: 'https://x/a.zip', changelogUrl: 'https://telemesync.app/#novidades' };
  /** A fetch that answers per address: a JSON body, an HTTP status, or a network error. */
  function fake(answers: Record<string, unknown | number | Error>) {
    const asked: string[] = [];
    const fn = (async (url: string) => {
      asked.push(url);
      const a = answers[url];
      if (a instanceof Error || a === undefined) throw a ?? new Error('offline');
      if (typeof a === 'number') return new Response('', { status: a });
      return new Response(JSON.stringify(a), { status: 200 });
    }) as unknown as typeof fetch;
    return { fn, asked };
  }
  it('reads the new address and stops there', async () => {
    const f = fake({ [NEW]: release, [OLD]: { ...release, version: '9.9.9' } });
    expect((await checkForUpdate([NEW, OLD], '1.2.1', 'windows', f.fn))?.version).toBe('1.2.2');
    expect(f.asked).toEqual([NEW]);
  });
  it('a valid answer with nothing newer ends the check', async () => {
    const f = fake({ [NEW]: release, [OLD]: { ...release, version: '9.9.9' } });
    expect(await checkForUpdate([NEW, OLD], '1.2.2', 'windows', f.fn)).toBeNull();
    expect(f.asked).toEqual([NEW]);
  });
  it('falls back to the old address when the new one fails', async () => {
    for (const broken of [new Error('dns'), 404, 502, { not: 'a release' }]) {
      const f = fake({ [NEW]: broken, [OLD]: release });
      expect((await checkForUpdate([NEW, OLD], '1.2.1', 'windows', f.fn))?.version).toBe('1.2.2');
      expect(f.asked).toEqual([NEW, OLD]);
    }
  });
  it('is null when every address fails, and still takes a single address', async () => {
    expect(await checkForUpdate([NEW, OLD], '1.2.1', 'windows', fake({}).fn)).toBeNull();
    expect((await checkForUpdate(OLD, '1.2.1', 'windows', fake({ [OLD]: release }).fn))?.version).toBe('1.2.2');
  });
});
