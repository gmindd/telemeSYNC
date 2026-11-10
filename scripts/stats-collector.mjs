// Statistics for the public /stats page (for sponsors). Runs inside the site container next to the
// Buy Me a Coffee receiver and, every STATS_INTERVAL_MIN minutes (default 60), writes
// <site>/data/stats.json from:
//   - GitHub: download counts of every release asset (public API; GITHUB_TOKEN optional).
//   - GoatCounter: visitors per day, countries, referrers and systems. Needs GOATCOUNTER_TOKEN (an API
//     key with "Read statistics"); without it only the public site total is shown (visitor counter).
//   - Buy Me a Coffee supporters already kept by bmc-webhook.mjs: only how many there are.
// Only aggregated numbers are published: no addresses, e-mails, names or amounts.
//
// Files:
//   $BMC_DATA_DIR/stats-history.json   one snapshot per day (downloads, visitors), for the growth chart;
//                                      on the same persistent volume as the supporters
//   <site>/data/stats.json             read by stats.html
//   <site>/data/stats-manual.json      numbers added by hand (e.g. Instagram followers), shown as they are
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { supporterList } from './bmc-webhook.mjs';

const DATA_DIR = process.env.BMC_DATA_DIR ?? '/var/lib/telemesync';
const SITE_DATA = process.env.SITE_DATA_DIR ?? '/usr/share/nginx/html/data';
const REPO = process.env.STATS_GITHUB_REPO ?? 'gmindd/telemeSYNC';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN?.trim() ?? '';
const GC_SITE = process.env.GOATCOUNTER_SITE?.trim() || 'telemesync';
const GC_TOKEN = process.env.GOATCOUNTER_TOKEN?.trim() ?? '';
const INTERVAL_MIN = Math.max(15, Number(process.env.STATS_INTERVAL_MIN) || 60);
/** First day the site counted visits (GoatCounter starts here). */
export const SITE_START = process.env.STATS_SITE_START ?? '2026-10-14';
const OUT = join(SITE_DATA, 'stats.json');
const MANUAL = join(SITE_DATA, 'stats-manual.json');
const HISTORY = join(DATA_DIR, 'stats-history.json');
const SUPPORTERS_STORE = join(DATA_DIR, 'supporters.json');
const SUPPORTERS_MANUAL = join(SITE_DATA, 'supporters-manual.json');
const DAILY_DAYS = 90;
const MAX_HISTORY = 1000;

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(path, value) {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + '\n');
  await rename(tmp, path);
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': 'telemeSYNC-stats', Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${new URL(url).host} respondeu ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------------------------- GitHub

/** OS of a release asset from its file name ("telemeSYNC-1.1.0-macos.zip" → "mac"). */
export function assetOs(name) {
  const n = String(name).toLowerCase();
  if (/mac|darwin|osx/.test(n)) return 'mac';
  if (/win/.test(n)) return 'windows';
  return 'other';
}

/** Downloads per release and in total, from GitHub's releases list. Drafts are ignored. */
export function summarizeDownloads(releases) {
  const list = releases
    .filter((r) => !r.draft)
    .map((r) => {
      const row = { version: String(r.tag_name ?? '').replace(/^v/i, ''), date: String(r.published_at ?? '').slice(0, 10), windows: 0, mac: 0, other: 0 };
      for (const a of r.assets ?? []) row[assetOs(a.name)] += Number(a.download_count) || 0;
      return row;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  const sum = (k) => list.reduce((n, r) => n + r[k], 0);
  const windows = sum('windows');
  const mac = sum('mac');
  const other = sum('other');
  return { total: windows + mac + other, windows, mac, other, since: list[0]?.date ?? null, releases: list };
}

async function collectDownloads() {
  const headers = GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {};
  const all = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await getJson(`https://api.github.com/repos/${REPO}/releases?per_page=100&page=${page}`, headers);
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return summarizeDownloads(all);
}

// ------------------------------------------------------------------------------------------ GoatCounter

const isoHour = (d) => `${d.toISOString().slice(0, 13)}:00:00Z`;

const KNOWN_REFS = [
  [/instagram/, 'Instagram'],
  [/facebook|(^|\.)fb\.(com|me)$|com\.facebook/, 'Facebook'],
  [/youtube|youtu\.be/, 'YouTube'],
  [/tiktok/, 'TikTok'],
  [/(^|\.)x\.com$|twitter|^t\.co$/, 'X'],
  [/strava/, 'Strava'],
  [/reddit/, 'Reddit'],
  [/linkedin|lnkd\.in/, 'LinkedIn'],
  [/whatsapp/, 'WhatsApp'],
  [/telegram|t\.me$/, 'Telegram'],
  [/(^|\.)google\.|googlequicksearchbox/, 'Google'],
  [/(^|\.)bing\.com$/, 'Bing'],
  [/duckduckgo/, 'DuckDuckGo'],
  [/chatgpt|openai/, 'ChatGPT'],
  [/github/, 'GitHub'],
  [/buymeacoffee/, 'Buy Me a Coffee'],
];

/**
 * Display name of a referrer: known sites by name (Instagram, Google…, whatever subdomain or app sent
 * the visit), others by host without "www.", "m." or "l.". "" for no referrer and for the site itself.
 */
export function refName(name) {
  const host = String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z-]+:\/\//, '')
    .split('/')[0]
    .replace(/^(www|m|l|lm|mobile|out)\./, '');
  if (!host || host.startsWith('(') || host.endsWith('telemesync.pereiragabriel.com')) return '';
  for (const [re, label] of KNOWN_REFS) if (re.test(host)) return label;
  return host;
}

/** Merges referrers that name the same site and keeps the top `limit`. */
export function mergeRefs(stats, limit = 8) {
  const counts = new Map();
  for (const s of stats ?? []) {
    const name = refName(s.name);
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + (Number(s.count) || 0));
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Visitor totals from /api/v0/stats/total (one entry per day): total, last 7 and 30 days, the daily
 * series of the last DAILY_DAYS days (days without visits included) and the monthly series.
 */
export function summarizeVisits(total, today = new Date()) {
  const byDay = new Map((total?.stats ?? []).map((s) => [String(s.day).slice(0, 10), Number(s.daily) || 0]));
  const end = new Date(`${today.toISOString().slice(0, 10)}T00:00:00Z`);
  const daily = [];
  for (let i = DAILY_DAYS - 1; i >= 0; i--) {
    const d = new Date(end.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    if (d >= SITE_START) daily.push({ day: d, n: byDay.get(d) ?? 0 });
  }
  const lastN = (n) => daily.slice(-n).reduce((s, d) => s + d.n, 0);
  const months = new Map();
  for (const [d, n] of byDay) months.set(d.slice(0, 7), (months.get(d.slice(0, 7)) ?? 0) + n);
  const monthly = [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, n]) => ({ month, n }));
  return { total: Number(total?.total) || [...byDay.values()].reduce((s, n) => s + n, 0), last7: lastN(7), last30: lastN(30), daily, monthly };
}

/** Visitors on phones and tablets vs computers, from GoatCounter's screen sizes. */
export function deviceSplit(sizes) {
  const split = { mobile: 0, computer: 0 };
  for (const s of sizes ?? []) {
    if (s.id === 'phone' || s.id === 'tablet') split.mobile += Number(s.count) || 0;
    else if (s.id === 'desktop' || s.id === 'desktophd') split.computer += Number(s.count) || 0;
  }
  return split;
}

/** A GoatCounter stats list (countries, systems…) as {id, name, count}, top `limit`. */
export function topList(stats, limit = 8) {
  return (stats ?? [])
    .filter((s) => s.name && s.name !== '(unknown)' && Number(s.count) > 0)
    .slice(0, limit)
    .map((s) => ({ id: s.id ?? '', name: s.name, count: Number(s.count) }));
}

async function collectVisitsApi() {
  const base = `https://${GC_SITE}.goatcounter.com/api/v0`;
  const headers = { Authorization: `Bearer ${GC_TOKEN}`, 'Content-Type': 'application/json' };
  const range = `start=${encodeURIComponent(`${SITE_START}T00:00:00Z`)}&end=${encodeURIComponent(isoHour(new Date(Date.now() + 3_600_000)))}`;
  const total = await getJson(`${base}/stats/total?${range}`, headers);
  const page = async (name, limit) => (await getJson(`${base}/stats/${name}?limit=${limit}&${range}`, headers)).stats;
  // One at a time: GoatCounter allows 4 requests per second.
  const locations = await page('locations', 12);
  const toprefs = await page('toprefs', 20);
  const systems = await page('systems', 6);
  const sizes = await page('sizes', 6);
  return {
    source: 'api',
    ...summarizeVisits(total),
    countries: topList(locations, 10),
    countriesCount: locations.filter((s) => s.name && s.name !== '(unknown)').length,
    referrers: mergeRefs(toprefs, 8),
    systems: topList(systems, 6),
    devices: deviceSplit(sizes),
  };
}

/** Without an API key: the public visitor counter (site total, and the last 30 days). */
async function collectVisitsCounter() {
  const counter = async (q = '') => {
    const d = await getJson(`https://${GC_SITE}.goatcounter.com/counter/TOTAL.json${q}`);
    return Number(String(d.count).replace(/\D/g, '')) || 0;
  };
  const total = await counter();
  const start = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  let last30 = null;
  try {
    last30 = await counter(`?start=${start}`);
  } catch {
    /* only the total */
  }
  return { source: 'counter', total, last30 };
}

// ---------------------------------------------------------------------------------------------- History

/** Adds (or replaces) today's snapshot; keeps the newest MAX_HISTORY days. */
export function addSnapshot(history, day, snapshot) {
  const rest = (Array.isArray(history) ? history : []).filter((h) => h.day !== day);
  return [...rest, { day, ...snapshot }].sort((a, b) => a.day.localeCompare(b.day)).slice(-MAX_HISTORY);
}

// ------------------------------------------------------------------------------------------------- Main

export async function collect() {
  const previous = await readJson(OUT, {});
  const status = {};
  const out = { updatedAt: new Date().toISOString(), siteStart: SITE_START };

  try {
    out.downloads = await collectDownloads();
    status.downloads = 'ok';
  } catch (e) {
    out.downloads = previous.downloads ?? null;
    status.downloads = `erro: ${e.message}`;
  }

  try {
    out.visits = GC_TOKEN ? await collectVisitsApi() : await collectVisitsCounter();
    status.visits = GC_TOKEN ? 'ok' : 'só o total público: falta GOATCOUNTER_TOKEN para países, origens e gráfico diário';
  } catch (e) {
    out.visits = previous.visits ?? null;
    status.visits = `erro: ${e.message}`;
  }

  const supporters = supporterList(await readJson(SUPPORTERS_MANUAL, { supporters: [] }), (await readJson(SUPPORTERS_STORE, { supporters: [] })).supporters);
  out.supporters = { count: supporters.length };

  const releases = out.downloads?.releases ?? [];
  out.project = { releases: releases.length, latest: releases.at(-1)?.version ?? null, firstRelease: releases[0]?.date ?? null };

  const manual = await readJson(MANUAL, {});
  out.audience = Array.isArray(manual.audience) ? manual.audience.filter((a) => a && a.label && Number.isFinite(Number(a.value))) : [];

  try {
    const day = out.updatedAt.slice(0, 10);
    let history = (await readJson(HISTORY, { days: [] })).days ?? [];
    // Only fresh numbers go into the history (a failed source keeps the day's earlier snapshot).
    if (status.downloads === 'ok' && out.visits && !status.visits.startsWith('erro')) {
      history = addSnapshot(history, day, { downloads: out.downloads.total, visitors: out.visits.total });
      await mkdir(DATA_DIR, { recursive: true });
      await writeJson(HISTORY, { days: history });
    }
    out.history = history.slice(-365);
  } catch (e) {
    out.history = previous.history ?? [];
    status.history = `erro: ${e.message}`;
  }

  out.status = status;
  await mkdir(SITE_DATA, { recursive: true });
  await writeJson(OUT, out);
  return out;
}

async function main() {
  for (;;) {
    try {
      const s = await collect();
      console.log(`stats: ${s.downloads?.total ?? '?'} downloads · ${s.visits?.total ?? '?'} visitors · ${JSON.stringify(s.status)}`);
    } catch (e) {
      console.error('stats: failed:', e.message);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MIN * 60_000));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
