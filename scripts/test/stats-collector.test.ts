import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JavaScript module run by the site container
import { addSnapshot, assetOs, summarizeDownloads } from '../stats-collector.mjs';

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
});
