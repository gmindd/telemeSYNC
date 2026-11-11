import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addLine,
  buildGeo,
  classify,
  countryOf,
  emptyState,
  geoFromBuffer,
  geoToBuffer,
  isoWeek,
  parseLine,
  readLog,
  refName,
  report,
  settle,
  // @ts-expect-error plain JavaScript module run by the site container
} from '../visits.mjs';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0';
const line = (time: string, ip: string, uri: string, ua: string, { status = 200, ref = '', origin = '', method = 'GET', purpose = '' } = {}) =>
  [time, ip, method, status, uri, ref, ua, origin, purpose].join('\t');

const GEO = buildGeo('8.8.4.0,8.8.4.255,US\n34.140.0.0,34.140.255.255,BE\n89.114.0.0,89.114.255.255,PT\n', '2001:818::,2001:818:ffff:ffff:ffff:ffff:ffff:ffff,PT\n');

describe('visits from the server log', () => {
  it('reads the log fields, unescaping what nginx escaped', () => {
    const e = parseLine(line('2026-11-10T10:00:00+00:00', '89.114.0.1', '/index.html', 'Mozilla \\"x\\"', { ref: 'https://l.instagram.com/' }));
    expect(e).toMatchObject({ ip: '89.114.0.1', status: 200, uri: '/index.html', ua: 'Mozilla "x"', ref: 'https://l.instagram.com/' });
  });

  it('tells pages, script.js and the program apart, and leaves bots, errors and prefetches out', () => {
    const c = (uri: string, ua: string, o = {}) => classify(parseLine(line('2026-11-10T10:00:00+00:00', '1.1.1.1', uri, ua, o)));
    expect(c('/index.html', CHROME)).toBe('page');
    expect(c('/stats.html', IPHONE, { status: 304 })).toBe('page');
    expect(c('/script.js', CHROME)).toBe('asset');
    expect(c('/data/latest.json', CHROME, { origin: 'http://localhost:5174' })).toBe('app');
    expect(c('/data/latest.json', CHROME)).toBe(null); // the site's own banner check
    expect(c('/index.html', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)')).toBe(null);
    expect(c('/index.html', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(null);
    expect(c('/index.html', '')).toBe(null);
    expect(c('/index.html', CHROME, { status: 404 })).toBe(null);
    expect(c('/index.html', CHROME, { method: 'POST' })).toBe(null);
    expect(c('/index.html', CHROME, { purpose: 'prefetch' })).toBe(null);
  });

  it('finds the country of IPv4, IPv6 and mapped addresses, and keeps the table through its binary file', () => {
    expect(countryOf(GEO, '89.114.10.20')).toBe('PT');
    expect(countryOf(GEO, '::ffff:8.8.4.4')).toBe('US');
    expect(countryOf(GEO, '2001:818:dc00::1')).toBe('PT');
    expect(countryOf(GEO, '10.0.0.1')).toBe('');
    const again = geoFromBuffer(geoToBuffer(GEO));
    expect(countryOf(again, '34.140.0.9')).toBe('BE');
    expect(countryOf(again, '2001:818:1::1')).toBe('PT');
  });

  it('counts people per day who also fetched script.js, with country, origin, system and device', () => {
    const s = emptyState();
    const day = '2026-11-10T10:00:00+00:00';
    for (const l of [
      line(day, '89.114.0.1', '/index.html', IPHONE, { ref: 'https://l.instagram.com/' }),
      line(day, '89.114.0.1', '/script.js', IPHONE),
      line(day, '89.114.0.1', '/stats.html', IPHONE),
      line(day, '8.8.4.4', '/index.html', CHROME, { ref: 'https://www.google.com/' }),
      line(day, '8.8.4.4', '/script.js', CHROME, { status: 304 }),
      line(day, '34.140.0.1', '/index.html', CHROME), // reads the HTML only: a crawler
      line(day, '31.13.0.1', '/index.html', 'facebookexternalhit/1.1'),
      line(day, '89.114.0.2', '/data/latest.json', CHROME, { origin: 'http://localhost:5174' }),
      line(day, '89.114.0.2', '/data/latest.json', CHROME, { origin: 'http://localhost:5174' }),
    ])
      addLine(s, l, GEO);
    settle(s, '2026-11-10');
    const r = report(s, '2026-11-10');
    expect(r.visits).toMatchObject({ total: 2, views: 3, since: '2026-11-10', countriesCount: 2, devices: { mobile: 1, computer: 1 } });
    expect(r.visits.referrers).toEqual([
      { name: 'Instagram', count: 1 },
      { name: 'Google', count: 1 },
    ]);
    expect(r.visits.countries.map((c: { id: string }) => c.id).sort()).toEqual(['PT', 'US']);
    expect(r.app.week).toEqual({ key: '2026-W46', n: 1, complete: false });
    expect(r.app.daily.at(-1)).toEqual({ day: '2026-11-10', n: 1 });
  });

  it('closes old days: their counts stay, their salt and codes are deleted', () => {
    const s = emptyState();
    addLine(s, line('2026-11-01T10:00:00+00:00', '89.114.0.1', '/index.html', CHROME), GEO);
    addLine(s, line('2026-11-01T10:00:01+00:00', '89.114.0.1', '/script.js', CHROME), GEO);
    settle(s, '2026-11-10');
    expect(s.open['2026-11-01']).toBeUndefined();
    expect(s.days['2026-11-01'].visitors).toBe(1);
    expect(JSON.stringify(s)).not.toContain('89.114');
  });

  it('reads only new lines and empties the log afterwards', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'visits-'));
    const log = join(dir, 'access.log');
    writeFileSync(log, [line('2026-11-10T10:00:00+00:00', '8.8.4.4', '/index.html', CHROME), line('2026-11-10T10:00:00+00:00', '8.8.4.4', '/script.js', CHROME)].join('\n') + '\n');
    const s = emptyState();
    expect(await readLog(s, log, GEO)).toBe(2);
    expect(readFileSync(log, 'utf8')).toBe('');
    expect(await readLog(s, log, GEO)).toBe(0);
    settle(s, '2026-11-10');
    expect(s.days['2026-11-10'].visitors).toBe(1);
  });

  it('names weeks and referrers', () => {
    expect(isoWeek('2026-11-10')).toBe('2026-W46');
    expect(isoWeek('2027-01-01')).toBe('2026-W53');
    expect(refName('android-app://com.instagram.android')).toBe('Instagram');
    expect(refName('https://telemesync.pereiragabriel.com/stats')).toBe('');
    expect(refName('https://www.btt.pt/forum')).toBe('btt.pt');
  });
});

describe('visits in every language', () => {
  it('counts the pages in English, French, Spanish and German as the same pages', async () => {
    // @ts-expect-error plain JavaScript module
    const { pagePath } = await import('../visits.mjs');
    expect(pagePath('/en/index.html')).toBe('/');
    expect(pagePath('/de/stats.html')).toBe('/stats');
    expect(pagePath('/index.html')).toBe('/');
    expect(pagePath('/en/style.css')).toBeUndefined();
    const s = emptyState();
    addLine(s, line('2026-11-10T10:00:00+00:00', '8.8.4.4', '/fr/index.html', CHROME), GEO);
    addLine(s, line('2026-11-10T10:00:01+00:00', '8.8.4.4', '/script.js', CHROME), GEO);
    settle(s, '2026-11-10');
    expect(s.days['2026-11-10'].pages).toEqual({ '/': 1 });
  });
});
