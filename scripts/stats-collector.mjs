// Statistics for the public /stats page (for sponsors). Runs inside the site container next to the
// Buy Me a Coffee receiver and, every STATS_INTERVAL_MIN minutes (default 60), writes
// <site>/data/stats.json from:
//   - the site's own server: visits, countries, origins, systems and people using the program, read
//     from nginx's log by visits.mjs (no third party, no cookies, ad blockers make no difference);
//   - GitHub: download counts of every release asset (public API; GITHUB_TOKEN optional);
//   - Buy Me a Coffee supporters already kept by bmc-webhook.mjs: only how many there are.
// Only aggregated numbers are published: no addresses, e-mails, names or amounts.
//
// Files (in $BMC_DATA_DIR, the persistent volume shared with the supporters):
//   access.log            lines written by nginx for the statistics (emptied once read past 2 MB)
//   visits.json           counts per day, and the codes of the last 2 days (see visits.mjs)
//   geo/                  country table (DB-IP lite), refreshed once a month
//   stats-history.json    one snapshot per day (downloads, visitors), for growth over time
// and in the site: data/stats.json (read by stats.html), data/stats-manual.json (numbers added by
// hand, e.g. Instagram followers, shown as they are).
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isPersistent, NOT_PERSISTENT, supporterList } from './bmc-webhook.mjs';
import { emptyState, loadGeo, readLog, report, settle } from './visits.mjs';

export { refName } from './visits.mjs';

const DATA_DIR = process.env.BMC_DATA_DIR ?? '/var/lib/telemesync';
const SITE_DATA = process.env.SITE_DATA_DIR ?? '/usr/share/nginx/html/data';
const REPO = process.env.STATS_GITHUB_REPO ?? 'gmindd/telemeSYNC';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN?.trim() ?? '';
const INTERVAL_MIN = Math.max(15, Number(process.env.STATS_INTERVAL_MIN) || 60);
const OUT = join(SITE_DATA, 'stats.json');
const MANUAL = join(SITE_DATA, 'stats-manual.json');
const ACCESS_LOG = join(DATA_DIR, 'access.log');
const VISITS = join(DATA_DIR, 'visits.json');
const GEO_DIR = join(DATA_DIR, 'geo');
const HISTORY = join(DATA_DIR, 'stats-history.json');
const SUPPORTERS_STORE = join(DATA_DIR, 'supporters.json');
const SUPPORTERS_MANUAL = join(SITE_DATA, 'supporters-manual.json');
const MAX_HISTORY = 1000;

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(path, value, pretty = true) {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, (pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value)) + '\n');
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

// ---------------------------------------------------------------------------------------------- Visits

async function collectVisits(today) {
  const state = { ...emptyState(), ...(await readJson(VISITS, {})) };
  const geo = await loadGeo(GEO_DIR);
  const lines = await readLog(state, ACCESS_LOG, geo);
  settle(state, today);
  await mkdir(DATA_DIR, { recursive: true });
  await writeJson(VISITS, state, false);
  return { ...report(state, today), lines, geo: !!geo };
}

// ------------------------------------------------------------------------------------- Counts before

/**
 * Counts kept from before the counter started again (e.g. a redeploy without a persistent volume),
 * written by hand in data/stats-manual.json → "before", per month:
 *   { "months": { "2026-11": { "visitors": 120, "views": 300, "app": 8, "downloads": 10 } } }
 * They are added to that month's counts made by the server. Program users are added as they are (a
 * person counted before and after the restart counts twice: write the earlier figure minus that).
 */
export function addCountsBefore(out, before) {
  const months = before && typeof before === 'object' && before.months && typeof before.months === 'object' ? before.months : null;
  if (!months || !out.monthly) return;
  const add = (m) => {
    const b = m && months[m.key];
    if (!b) return;
    for (const k of ['visitors', 'views', 'app', 'downloads']) if (Number(b[k]) > 0) m[k] = (m[k] ?? 0) + Number(b[k]);
  };
  add(out.monthly.current);
  add(out.monthly.previous);
  for (const m of out.monthly.history ?? []) add(m);
  // A month that had counts only before the restart still shows as the previous month.
  const prev = out.monthly.history?.at(-2);
  if (!out.monthly.previous && prev && months[prev.key]) out.monthly.previous = { ...prev, countries: [], countriesCount: 0, referrers: [], systems: [], devices: { mobile: 0, computer: 0 } };
}

/**
 * Downloads per month from the daily snapshots of the GitHub total: the month's last snapshot (or
 * the total now, for this month) minus the last one before the month. Without a snapshot before the
 * month, from its first snapshot ("since" says from when).
 */
export function addMonthlyDownloads(monthly, history, totalNow, releases = []) {
  const snaps = (history ?? []).filter((h) => Number.isFinite(h.downloads)).sort((a, b) => a.day.localeCompare(b.day));
  const forMonth = (key, isCurrent) => {
    const before = [...snaps].reverse().find((h) => h.day < `${key}-01`);
    const inside = snaps.filter((h) => h.day.startsWith(key));
    const end = isCurrent && Number.isFinite(totalNow) ? totalNow : inside.at(-1)?.downloads;
    // No snapshot before the month: the releases published before it, at their counts now, stand in
    // for the total at the start of the month (their downloads during the month are then left out).
    const older = releases.filter((r) => r.date && r.date < `${key}-01`);
    const estimate = older.length && isCurrent ? older.reduce((n, r) => n + r.windows + r.mac + (r.other ?? 0), 0) : undefined;
    const start = before?.downloads ?? estimate ?? inside[0]?.downloads;
    if (!Number.isFinite(end) || !Number.isFinite(start)) return null;
    return { downloads: Math.max(0, end - start), since: before || estimate !== undefined ? null : inside[0]?.day ?? null };
  };
  const currentKey = monthly.current?.key;
  for (const m of [monthly.current, monthly.previous, ...(monthly.history ?? [])]) {
    if (!m) continue;
    const d = forMonth(m.key, m.key === currentKey);
    m.downloads = d?.downloads ?? 0;
    m.downloadsSince = d?.since ?? null;
  }
}

// ---------------------------------------------------------------------------------------------- History

/** Adds (or replaces) today's snapshot; keeps the newest MAX_HISTORY days. */
export function addSnapshot(history, day, snapshot) {
  const rest = (Array.isArray(history) ? history : []).filter((h) => h.day !== day);
  return [...rest, { day, ...snapshot }].sort((a, b) => a.day.localeCompare(b.day)).slice(-MAX_HISTORY);
}

// ------------------------------------------------------------------------------------------------- Main

export async function collect(now = new Date()) {
  const previous = await readJson(OUT, {});
  const status = {};
  const today = now.toISOString().slice(0, 10);
  const out = { updatedAt: now.toISOString() };

  try {
    out.downloads = await collectDownloads();
    status.downloads = 'ok';
  } catch (e) {
    out.downloads = previous.downloads ?? null;
    status.downloads = `erro: ${e.message}`;
  }

  try {
    const v = await collectVisits(today);
    out.visits = v.visits;
    out.app = v.app;
    out.monthly = v.monthly;
    status.visits = `ok · ${v.lines} linhas novas${v.geo ? '' : ' · sem tabela de países'}`;
  } catch (e) {
    out.visits = previous.visits ?? null;
    out.app = previous.app ?? null;
    out.monthly = previous.monthly ?? null;
    status.visits = `erro: ${e.message}`;
  }

  const supporters = supporterList(await readJson(SUPPORTERS_MANUAL, { supporters: [] }), (await readJson(SUPPORTERS_STORE, { supporters: [] })).supporters);
  out.supporters = { count: supporters.length };

  const releases = out.downloads?.releases ?? [];
  out.project = { releases: releases.length, latest: releases.at(-1)?.version ?? null, firstRelease: releases[0]?.date ?? null };

  const manual = await readJson(MANUAL, {});
  out.audience = Array.isArray(manual.audience) ? manual.audience.filter((a) => a && a.label && Number.isFinite(Number(a.value))) : [];

  try {
    let history = (await readJson(HISTORY, { days: [] })).days ?? [];
    // Only fresh numbers go into the history (a failed source keeps the day's earlier snapshot).
    if (status.downloads === 'ok' && status.visits.startsWith('ok')) {
      history = addSnapshot(history, today, { downloads: out.downloads.total, visitors: out.visits.total });
      await mkdir(DATA_DIR, { recursive: true });
      await writeJson(HISTORY, { days: history });
    }
    out.history = history.slice(-365);
    if (out.monthly) addMonthlyDownloads(out.monthly, history, out.downloads?.total, out.downloads?.releases ?? []);
  } catch (e) {
    out.history = previous.history ?? [];
    status.history = `erro: ${e.message}`;
  }

  addCountsBefore(out, manual.before);

  // Without a persistent volume every redeploy starts the counts again: say so where it is seen.
  if (!(await isPersistent(DATA_DIR))) status.storage = NOT_PERSISTENT(DATA_DIR);
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
