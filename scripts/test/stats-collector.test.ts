import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JavaScript module run by the site container
import { addCountsBefore, addMonthlyDownloads, addSnapshot, assetOs, summarizeDownloads } from '../stats-collector.mjs';

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

  it('keeps one snapshot per day', () => {
    const h = addSnapshot([{ day: '2026-11-09', downloads: 100 }, { day: '2026-11-10', downloads: 110 }], '2026-11-10', { downloads: 117 });
    expect(h).toEqual([{ day: '2026-11-09', downloads: 100 }, { day: '2026-11-10', downloads: 117 }]);
  });

  it('adds the counts kept from before the counter started again, per month', () => {
    const m = (key: string, visitors: number, app: number) => ({ key, visitors, views: visitors * 3, app, days: 1, countries: [], countriesCount: 0, referrers: [], systems: [], devices: { mobile: 0, computer: 0 } });
    const out = { monthly: { current: m('2026-11', 4, 1), previous: null as unknown, history: [m('2026-10', 0, 0), m('2026-11', 4, 1)] } };
    addCountsBefore(out, { months: { '2026-11': { visitors: 120, views: 300, app: 8 }, '2026-10': { visitors: 50 } } });
    expect(out.monthly.current).toMatchObject({ visitors: 124, views: 312, app: 9 });
    expect(out.monthly.history.map((h) => h.visitors)).toEqual([50, 124]);
    // October had counts only from before the restart: it still shows as the previous month.
    expect(out.monthly.previous).toMatchObject({ key: '2026-10', visitors: 50 });
    addCountsBefore(out, undefined);
  });

  it('adds hand-written countries and visitors to the month and to the all-time total', () => {
    const cur = { key: '2026-11', visitors: 3, views: 5, app: 1, days: 1, countries: [{ id: 'PT', name: 'PT', count: 2 }, { id: 'FR', name: 'FR', count: 1 }], countriesCount: 2, referrers: [], systems: [], devices: { mobile: 0, computer: 0 } };
    const out = { visits: { total: 3 }, monthly: { current: cur, previous: null, history: [{ ...cur }] } };
    addCountsBefore(out, { months: { '2026-11': { visitors: 80, app: 48, countries: { PT: 47, BE: 22, xx: 5 } } } });
    expect(out.visits.total).toBe(83);
    expect(out.monthly.current).toMatchObject({ visitors: 83, app: 49, views: null, handAdded: true, countriesCount: 3 });
    expect(out.monthly.current.countries).toEqual([
      { id: 'PT', name: 'PT', count: 49 },
      { id: 'BE', name: 'BE', count: 22 },
      { id: 'FR', name: 'FR', count: 1 },
    ]);
  });

  it('counts the downloads of each month from the daily snapshots', () => {
    const monthly = { current: { key: '2026-12' } as Record<string, unknown>, previous: { key: '2026-11' } as Record<string, unknown>, history: [{ key: '2026-11' }, { key: '2026-12' }] as Record<string, unknown>[] };
    const history = [
      { day: '2026-11-13', downloads: 131 },
      { day: '2026-11-30', downloads: 180 },
      { day: '2026-12-05', downloads: 200 },
    ];
    addMonthlyDownloads(monthly, history, 210, [{ date: '2026-10-15', windows: 7, mac: 5 }]);
    expect(monthly.current.downloads).toBe(30); // 210 now − 180 at the end of November
    expect(monthly.previous.downloads).toBe(49); // from its first snapshot
    expect(monthly.previous.downloadsSince).toBe('2026-11-13');
    // This month without a snapshot before it: the older releases stand in for its start.
    const first = { current: { key: '2026-11' } as Record<string, unknown>, previous: null, history: [] };
    addMonthlyDownloads(first, [{ day: '2026-11-13', downloads: 131 }], 131, [
      { date: '2026-10-15', windows: 7, mac: 5 },
      { date: '2026-11-04', windows: 41, mac: 17 },
    ]);
    expect(first.current.downloads).toBe(119);
    expect(first.current.downloadsSince).toBeNull();
  });
});
