/** Latest release, as published by the site in data/latest.json. */
export interface Release {
  version: string;
  date?: string;
  summary?: string;
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

/** Validates data/latest.json; only https links are accepted. */
export function parseRelease(data: unknown): Release | null {
  if (!data || typeof data !== 'object') return null;
  const r = data as Record<string, unknown>;
  const https = (u: unknown) => typeof u === 'string' && /^https:\/\//.test(u);
  if (typeof r.version !== 'string' || !/^v?\d+(\.\d+)*/.test(r.version.trim())) return null;
  if (!https(r.downloadUrl) || !https(r.changelogUrl)) return null;
  return {
    version: r.version.trim().replace(/^v/i, ''),
    date: typeof r.date === 'string' ? r.date : undefined,
    summary: typeof r.summary === 'string' ? r.summary.slice(0, 200) : undefined,
    downloadUrl: r.downloadUrl as string,
    changelogUrl: r.changelogUrl as string,
  };
}

/** Asks the site for the latest release; null when there is none newer or the site can't be reached (offline, timeout). */
export async function checkForUpdate(url: string, current: string): Promise<Release | null> {
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const release = parseRelease(await res.json());
    return release && isNewer(release.version, current) ? release : null;
  } catch {
    return null;
  }
}
