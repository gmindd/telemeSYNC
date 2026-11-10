import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JavaScript module run by the site container
import { addSnapshot, assetOs, deviceSplit, mergeRefs, refName, summarizeDownloads, summarizeVisits } from '../stats-collector.mjs';

describe('stats collector', () => {
  it('counts downloads per release and per system, ignoring drafts', () => {
    const s = summarizeDownloads([
      { tag_name: 'v1.1.0', published_at: '2026-11-04T10:00:00Z', assets: [{ name: 'telemeSYNC-1.1.0-windows.zip', download_count: 37 }, { name: 'telemeSYNC-1.1.0-macos.zip', download_count: 14 }] },
      { tag_name: 'V1.0.0', published_at: '2026-10-15T10:00:00Z', assets: [{ name: 'telemeSYNC-1.0.0-windows.zip', download_count: 7 }, { name: 'telemeSYNC-1.0.0-macos.zip', download_count: 5 }] },
      { tag_name: 'v1.2.0', draft: true, published_at: null, assets: [{ name: 'x-windows.zip', download_count: 99 }] },
    ]);
    expect(s).toMatchObject({ total: 63, windows: 44, mac: 19, since: '2026-10-15' });
    expect(s.releases.map((r: { version: string }) => r.version)).toEqual(['1.0.0', '1.1.0']);
    expect(assetOs('telemeSYNC-1.1.1-macos.zip')).toBe('mac');
    expect(assetOs('Instrucoes.pdf')).toBe('other');
  });

  it('names referrers by site and merges the variants', () => {
    expect(refName('l.instagram.com')).toBe('Instagram');
    expect(refName('android-app://com.instagram.android')).toBe('Instagram');
    expect(refName('www.google.pt')).toBe('Google');
    expect(refName('www.btt.pt')).toBe('btt.pt');
    expect(refName('telemesync.pereiragabriel.com')).toBe('');
    expect(refName('(no data)')).toBe('');
    expect(mergeRefs([{ name: 'l.instagram.com', count: 5 }, { name: 'www.instagram.com', count: 3 }, { name: 'google.com', count: 4 }, { name: '(no data)', count: 50 }])).toEqual([
      { name: 'Instagram', count: 8 },
      { name: 'Google', count: 4 },
    ]);
  });

  it('builds the daily series from the site start, with empty days, and the 7 / 30 day totals', () => {
    const v = summarizeVisits(
      { total: 30, stats: [{ day: '2026-10-14', daily: 10 }, { day: '2026-11-09', daily: 5 }, { day: '2026-11-10', daily: 15 }] },
      new Date('2026-11-10T12:00:00Z'),
    );
    expect(v.daily[0]).toEqual({ day: '2026-10-14', n: 10 });
    expect(v.daily.at(-1)).toEqual({ day: '2026-11-10', n: 15 });
    expect(v.daily).toHaveLength(28);
    expect(v.last7).toBe(20);
    expect(v.last30).toBe(30);
    expect(v.monthly).toEqual([{ month: '2026-10', n: 10 }, { month: '2026-11', n: 20 }]);
  });

  it('splits phones and tablets from computers', () => {
    expect(deviceSplit([{ id: 'phone', count: 6 }, { id: 'tablet', count: 1 }, { id: 'desktop', count: 2 }, { id: 'desktophd', count: 1 }, { id: 'unknown', count: 9 }])).toEqual({ mobile: 7, computer: 3 });
  });

  it('keeps one snapshot per day', () => {
    const h = addSnapshot([{ day: '2026-11-09', downloads: 100 }, { day: '2026-11-10', downloads: 110 }], '2026-11-10', { downloads: 117 });
    expect(h).toEqual([{ day: '2026-11-09', downloads: 100 }, { day: '2026-11-10', downloads: 117 }]);
  });
});
