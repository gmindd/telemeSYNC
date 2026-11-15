// New versions: the app is installed from an APK link, so it looks for a newer one itself. Android releases are
// GitHub pre-releases tagged "mobile-v<version>" with the APK attached (pre-releases, so the desktop's "latest"
// release stays the desktop's). Publishing one is enough: nothing on the site changes.
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

const RELEASES = 'https://api.github.com/repos/gmindd/telemeSYNC/releases?per_page=30';
const DISMISSED_KEY = 'telemesync-update-dismissed';

export interface MobileRelease {
  version: string;
  apkUrl: string;
  notes?: string;
}

/** True when version `a` is newer than `b` ("0.10.0" > "0.9.2"); a pre-release suffix ("-beta") is ignored. */
export function isNewer(a: string, b: string): boolean {
  const parts = (v: string) => v.trim().replace(/^v/i, '').split('-')[0]!.split('.').map((n) => Number(n) || 0);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0;
  }
  return false;
}

/** The newest published Android release in GitHub's list (drafts and releases without an https APK are skipped). */
export function latestMobileRelease(list: unknown): MobileRelease | null {
  if (!Array.isArray(list)) return null;
  let best: MobileRelease | null = null;
  for (const r of list as Array<Record<string, any>>) {
    const m = /^mobile-v(\d+(?:\.\d+)*)$/i.exec(String(r?.tag_name ?? ''));
    if (!m || r.draft) continue;
    const apk = (Array.isArray(r.assets) ? r.assets : []).find((a: any) => /\.apk$/i.test(String(a?.name)) && /^https:\/\//.test(String(a?.browser_download_url)));
    if (!apk) continue;
    const release = { version: m[1]!, apkUrl: String(apk.browser_download_url), notes: typeof r.body === 'string' ? r.body.slice(0, 300) : undefined };
    if (!best || isNewer(release.version, best.version)) best = release;
  }
  return best;
}

/** A newer Android release than this app, unless the user already dismissed it; null offline or in the browser. */
export async function checkForUpdate(current: string): Promise<MobileRelease | null> {
  if (Capacitor.getPlatform() !== 'android') return null;
  try {
    const res = await fetch(RELEASES, { cache: 'no-store', signal: AbortSignal.timeout(8000), headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return null;
    const release = latestMobileRelease(await res.json());
    if (!release || !isNewer(release.version, current)) return null;
    return localStorage.getItem(DISMISSED_KEY) === release.version ? null : release;
  } catch {
    return null;
  }
}

export function dismissUpdate(version: string) {
  try {
    localStorage.setItem(DISMISSED_KEY, version);
  } catch {
    /* storage unavailable: asked again next time */
  }
}

const Updater = registerPlugin<{
  install(o: { url: string }): Promise<void>;
  addListener(event: 'progress', cb: (p: { fraction: number }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'permission', cb: () => void): Promise<PluginListenerHandle>;
}>('Updater');

export type UpdateStep = { kind: 'downloading'; fraction: number } | { kind: 'permission' };

/**
 * Downloads the APK inside the app and opens Android's installer over this version (android/…/UpdaterPlugin.java).
 * Rejects with "permission" when the user doesn't allow installing apps from telemeSYNC. Apps up to 0.4.1 opened the
 * link in the browser instead, which left the download for the user to open.
 */
export async function installUpdate(r: MobileRelease, onStep: (s: UpdateStep) => void): Promise<void> {
  const handles = [await Updater.addListener('progress', (p) => onStep({ kind: 'downloading', fraction: p.fraction })), await Updater.addListener('permission', () => onStep({ kind: 'permission' }))];
  try {
    onStep({ kind: 'downloading', fraction: 0 });
    await Updater.install({ url: r.apkUrl });
  } finally {
    for (const h of handles) void h.remove();
  }
}

/** Last resort: the link in the browser (the APK then shows up in the downloads, to open from there). */
export function openUpdateInBrowser(r: MobileRelease) {
  void Browser.open({ url: r.apkUrl });
}
