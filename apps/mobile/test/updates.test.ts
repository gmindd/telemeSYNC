import { describe, expect, it } from 'vitest';
import { isNewer, latestMobileRelease } from '../src/lib/updates.ts';

const apk = (version: string) => ({ name: `telemesync-${version}.apk`, browser_download_url: `https://github.com/x/y/releases/download/mobile-v${version}/telemesync-${version}.apk` });

describe('mobile updates', () => {
  it('compares versions numerically', () => {
    expect(isNewer('0.10.0', '0.9.2')).toBe(true);
    expect(isNewer('0.4.0', '0.4.0')).toBe(false);
    expect(isNewer('0.4.0-beta', '0.3.9')).toBe(true);
  });

  it('picks the newest Android release, skipping desktop releases, drafts and releases without an APK', () => {
    const r = latestMobileRelease([
      { tag_name: 'v1.1.1', assets: [{ name: 'telemeSYNC-1.1.1-windows.zip', browser_download_url: 'https://github.com/a.zip' }] },
      { tag_name: 'mobile-v0.6.0', draft: true, assets: [apk('0.6.0')] },
      { tag_name: 'mobile-v0.5.1', assets: [] },
      { tag_name: 'mobile-v0.4.0', assets: [apk('0.4.0')] },
      { tag_name: 'mobile-v0.5.0', body: 'Novidades', assets: [apk('0.5.0')] },
    ]);
    expect(r).toEqual({ version: '0.5.0', apkUrl: apk('0.5.0').browser_download_url, notes: 'Novidades' });
  });

  it('ignores a non-https link and an unexpected reply', () => {
    expect(latestMobileRelease([{ tag_name: 'mobile-v0.5.0', assets: [{ name: 'a.apk', browser_download_url: 'http://x/a.apk' }] }])).toBeNull();
    expect(latestMobileRelease({ message: 'rate limited' })).toBeNull();
  });
});
