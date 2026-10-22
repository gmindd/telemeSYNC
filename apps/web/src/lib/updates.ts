import type { Lang } from '@telemesync/core';

/** Systems with a download of their own in data/latest.json. */
export type Platform = 'windows' | 'mac';

/** The system the panel is open on (the server runs on the same computer). */
export function currentPlatform(): Platform {
  return /Mac/i.test(navigator.userAgent) ? 'mac' : 'windows';
}

/** Latest release, as published by the site in data/latest.json. */
export interface Release {
  version: string;
  date?: string;
  summary?: string;
  /** Summary per language (`summaries.en`…); `summary` is the Portuguese one read by versions up to 1.0.1. */
  summaries?: Partial<Record<Lang, string>>;
  downloadUrl: string;
  changelogUrl: string;
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

/**
 * Validates data/latest.json; only https links are accepted. The download is `downloads[platform]`; `downloadUrl` is
 * the Windows package (read by versions up to 0.3.2). Without a package for this system the link goes to the site.
 */
export function parseRelease(data: unknown, platform: Platform = 'windows'): Release | null {
  if (!data || typeof data !== 'object') return null;
  const r = data as Record<string, unknown>;
  const https = (u: unknown) => typeof u === 'string' && /^https:\/\//.test(u);
  if (typeof r.version !== 'string' || !/^v?\d+(\.\d+)*/.test(r.version.trim())) return null;
  if (!https(r.downloadUrl) || !https(r.changelogUrl)) return null;
  const downloads = r.downloads && typeof r.downloads === 'object' ? (r.downloads as Record<string, unknown>) : {};
  const download = https(downloads[platform]) ? downloads[platform] : platform === 'windows' ? r.downloadUrl : r.changelogUrl;
  return {
    version: r.version.trim().replace(/^v/i, ''),
    date: typeof r.date === 'string' ? r.date : undefined,
    summary: typeof r.summary === 'string' ? r.summary.slice(0, 200) : undefined,
    summaries: summariesOf(r.summaries),
    downloadUrl: download as string,
    changelogUrl: r.changelogUrl as string,
  };
}

function summariesOf(v: unknown): Partial<Record<Lang, string>> | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const out: Partial<Record<Lang, string>> = {};
  for (const [k, text] of Object.entries(v as Record<string, unknown>)) {
    if (/^(en|pt|fr|es|de)$/.test(k) && typeof text === 'string') out[k as Lang] = text.slice(0, 200);
  }
  return out;
}

/** Summary in the app language; English, then the old Portuguese `summary`, when missing. */
export function releaseSummary(r: Release, lang: Lang): string | undefined {
  return r.summaries?.[lang] ?? (lang === 'pt' ? r.summary : undefined) ?? r.summaries?.en ?? r.summary;
}

/** Link to the site in the app language (the site reads ?lang=). */
export function withLang(url: string, lang: Lang): string {
  try {
    const u = new URL(url);
    if (!/telemesync/i.test(u.hostname)) return url;
    u.searchParams.set('lang', lang);
    return u.toString();
  } catch {
    return url;
  }
}

/** Asks the site for the latest release; null when there is none newer or the site can't be reached (offline, timeout). */
export async function checkForUpdate(url: string, current: string, platform: Platform = currentPlatform()): Promise<Release | null> {
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const release = parseRelease(await res.json(), platform);
    return release && isNewer(release.version, current) ? release : null;
  } catch {
    return null;
  }
}
