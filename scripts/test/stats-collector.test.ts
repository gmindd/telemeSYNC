import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JavaScript module run by the site container
import { addCountsBefore, addSnapshot, assetOs, summarizeDownloads } from '../stats-collector.mjs';

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

  it('adds the counts kept from before the counter started again', () => {
    const out = {
      visits: { total: 4, views: 14, since: '2026-11-12' },
      app: { week: { key: '2026-W46', n: 1, complete: false } },
    };
    addCountsBefore(out, { visitors: 120, views: 300, since: '2026-11-10', appWeeks: { '2026-W46': 8 } });
    expect(out.visits).toEqual({ total: 124, views: 314, since: '2026-11-10' });
    expect(out.app.week.n).toBe(9);
    // Another week: nothing added.
    const later = { visits: null, app: { week: { key: '2026-W47', n: 3, complete: false } } };
    addCountsBefore(later, { appWeeks: { '2026-W46': 8 } });
    expect(later.app.week.n).toBe(3);
    // No program check since the restart: the earlier count on its own.
    const none = { visits: null, app: { week: null } };
    addCountsBefore(none, { appWeeks: { '2026-W46': 8 } });
    expect(none.app.week).toEqual({ key: '2026-W46', n: 8, complete: false });
    addCountsBefore(out, undefined);
  });
});
