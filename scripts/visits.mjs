// Visits counted by the site's own server, from nginx's log (scripts/nginx-site.conf writes the lines
// this reads to $BMC_DATA_DIR/access.log). Used by stats-collector.mjs. Counts people who load a page,
// with or without an ad blocker, and leaves out:
//   - bots (known user agents, empty user agent, link previews such as Facebook's and WhatsApp's),
//   - page loads that never fetch script.js (crawlers that only read the HTML),
//   - prefetches, errors, redirects and anything other than GET / HEAD.
// The program's update check (data/latest.json requested from http://localhost) is counted apart as
// people using the program.
//
// Privacy: the log is emptied every time it is read (hourly). An address is only used while its line
// is read, to look up the country and to make an anonymous code (SHA-256 of a random daily salt +
// address + browser). Codes tell apart visitors of the same day (of the same week for the program);
// the salt and the codes are deleted 2 days later (2 weeks for the program), so a code can never be
// traced back to an address. Only counts are kept.
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, stat, truncate, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// ------------------------------------------------------------------------------------------- Parsing

/** Pages counted as visits, by the path nginx logs. */
const PAGES = { '/': '/', '/index.html': '/', '/stats': '/stats', '/stats.html': '/stats', '/legal.html': '/legal' };
const BOT_UA =
  /bot\b|bot\/|crawl|spider|slurp|scrap|externalhit|externalagent|facebookcatalog|whatsapp|telegram|discord|slack|skype|preview|embed|curl|wget|python|go-http|java\/|okhttp|axios|node-fetch|undici|httpclient|libwww|headless|phantom|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|scanner|zgrab|masscan|nmap|nuclei|semrush|ahrefs|mj12|dotbot|petalbot|bytespider|yandex|baidu|sogou|exabot|seznam|gptbot|chatgpt|oai-search|claude|anthropic|perplexity|cohere|ccbot|amazonbot|applebot|google-|googleother|feedfetcher|mediapartners|adsbot|bingpreview|duckduck|qwant|ia_archiver|archive\.org|validator|checker/i;

/** Fields of one line written by the "stats" log_format (tab-separated, JSON-escaped). */
export function parseLine(line) {
  const f = line.split('\t');
  if (f.length < 8) return null;
  // escape=json writes each value as the inside of a JSON string
  const unescape = (s) => {
    if (!s.includes('\\')) return s;
    try {
      return JSON.parse(`"${s}"`);
    } catch {
      return s;
    }
  };
  const [time, ip, method, status, uri, ref, ua, origin, purpose = ''] = f.map(unescape);
  return { time, ip, method, status: Number(status), uri, ref, ua, origin, purpose };
}

/** Page counted for a path: the same page in any language counts as one ("/en/index.html" → "/"). */
export function pagePath(uri) {
  return PAGES[uri] ?? PAGES[uri.replace(/^\/(en|fr|es|de)(?=\/)/, '')];
}

export const isBot = (ua) => !ua || ua === '-' || ua.length < 20 || BOT_UA.test(ua);

/** What a log line is for the statistics: 'page', 'asset' (script.js, proves a real browser), 'app' or null. */
export function classify(e) {
  if (!e || (e.method !== 'GET' && e.method !== 'HEAD')) return null;
  if (e.status !== 200 && e.status !== 304) return null;
  if (e.uri === '/data/latest.json') return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(e.origin) ? 'app' : null;
  if (isBot(e.ua) || /prefetch|prerender/i.test(e.purpose)) return null;
  if (pagePath(e.uri)) return 'page';
  if (e.uri === '/script.js') return 'asset';
  return null;
}

export function systemOf(ua) {
  if (/Windows/i.test(ua)) return 'Windows';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/CrOS/i.test(ua)) return 'ChromeOS';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return '';
}
export const isMobile = (ua) => /Mobi|Android|iPhone|iPad|iPod/i.test(ua);

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
    .split(':')[0]
    .replace(/^(www|m|l|lm|mobile|out)\./, '');
  if (!host || host === '-' || host.startsWith('(') || host.endsWith('telemesync.pereiragabriel.com') || host === 'localhost') return '';
  for (const [re, label] of KNOWN_REFS) if (re.test(host)) return label;
  return host;
}

// ----------------------------------------------------------------------------------------- Countries

const ipv4ToInt = (ip) => {
  const p = ip.split('.');
  if (p.length !== 4) return null;
  let n = 0;
  for (const x of p) {
    const v = Number(x);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = n * 256 + v;
  }
  return n;
};

/** First 64 bits of an IPv6 address (enough to find its country), or null. */
const ipv6Prefix = (ip) => {
  if (!ip.includes(':')) return null;
  const [head, tail = ''] = ip.split('::');
  const a = head ? head.split(':') : [];
  const b = ip.includes('::') ? (tail ? tail.split(':') : []) : [];
  if (b.some((x) => x.includes('.')) || a.some((x) => x.includes('.'))) return null;
  const groups = ip.includes('::') ? [...a, ...Array(8 - a.length - b.length).fill('0'), ...b] : a;
  if (groups.length !== 8) return null;
  let n = 0n;
  for (const g of groups.slice(0, 4)) n = (n << 16n) | BigInt(parseInt(g || '0', 16));
  return n;
};

/**
 * Compact country table from DB-IP's "ip to country lite" CSV files (start,end,country per line,
 * sorted by start): typed arrays only, about 9 MB in memory.
 */
export function buildGeo(csv4, csv6) {
  const codes = [];
  const codeIndex = new Map();
  const idx = (cc) => {
    if (!codeIndex.has(cc)) {
      codeIndex.set(cc, codes.length);
      codes.push(cc);
    }
    return codeIndex.get(cc);
  };
  const parse = (csv, toNum, Arr) => {
    const lines = csv.split('\n');
    const starts = new Arr(lines.length);
    const ends = new Arr(lines.length);
    const cc = new Uint8Array(lines.length);
    let n = 0;
    for (const line of lines) {
      const [a, b, c] = line.trim().split(',');
      const s = toNum(a ?? '');
      const e = toNum(b ?? '');
      if (s == null || e == null || !/^[A-Z]{2}$/.test(c ?? '')) continue;
      if (n > 0 && s < starts[n - 1]) throw new Error('tabela de países fora de ordem');
      starts[n] = s;
      ends[n] = e;
      cc[n] = idx(c);
      n++;
    }
    return [starts.slice(0, n), ends.slice(0, n), cc.slice(0, n)];
  };
  const [s4, e4, c4] = parse(csv4, ipv4ToInt, Uint32Array);
  const [s6, e6, c6] = parse(csv6, ipv6Prefix, BigUint64Array);
  return { codes, s4, e4, c4, s6, e6, c6 };
}

const GEO_KEYS = [
  ['s4', Uint32Array],
  ['e4', Uint32Array],
  ['c4', Uint8Array],
  ['s6', BigUint64Array],
  ['e6', BigUint64Array],
  ['c6', Uint8Array],
];
const pad8 = (n) => Math.ceil(n / 8) * 8;

/** The table as one binary file: a 4-byte header length, a JSON header, then the six arrays (8-byte aligned). */
export function geoToBuffer(geo) {
  const header = Buffer.from(JSON.stringify({ codes: geo.codes, n4: geo.s4.length, n6: geo.s6.length }));
  const start = pad8(4 + header.length);
  let size = start;
  for (const [k] of GEO_KEYS) size = pad8(size + geo[k].byteLength);
  const out = Buffer.alloc(size);
  out.writeUInt32LE(header.length, 0);
  header.copy(out, 4);
  let at = start;
  for (const [k] of GEO_KEYS) {
    Buffer.from(geo[k].buffer, geo[k].byteOffset, geo[k].byteLength).copy(out, at);
    at = pad8(at + geo[k].byteLength);
  }
  return out;
}

export function geoFromBuffer(buf) {
  const len = buf.readUInt32LE(0);
  const { codes, n4, n6 } = JSON.parse(buf.subarray(4, 4 + len).toString('utf8'));
  const data = new Uint8Array(buf).buffer; // own, aligned copy
  const geo = { codes };
  let at = pad8(4 + len);
  for (const [k, Arr] of GEO_KEYS) {
    const n = k.endsWith('4') ? n4 : n6;
    geo[k] = new Arr(data, at, n);
    at = pad8(at + n * Arr.BYTES_PER_ELEMENT);
  }
  return geo;
}

function search(starts, ends, value) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= value) lo = mid + 1;
    else hi = mid - 1;
  }
  return hi >= 0 && value <= ends[hi] ? hi : -1;
}

/** Two-letter country of an address ("" when unknown). */
export function countryOf(geo, ip) {
  if (!geo || !ip) return '';
  const v4 = ipv4ToInt(ip.startsWith('::ffff:') ? ip.slice(7) : ip);
  if (v4 != null) {
    const i = search(geo.s4, geo.e4, v4);
    return i < 0 ? '' : geo.codes[geo.c4[i]];
  }
  const v6 = ipv6Prefix(ip);
  if (v6 == null) return '';
  const i = search(geo.s6, geo.e6, v6);
  return i < 0 ? '' : geo.codes[geo.c6[i]];
}

const GEO_SOURCES = [
  'https://raw.githubusercontent.com/sapics/ip-location-db/main/dbip-country/dbip-country-ipv4.csv',
  'https://raw.githubusercontent.com/sapics/ip-location-db/main/dbip-country/dbip-country-ipv6.csv',
];
const GEO_MAX_AGE = 30 * 86_400_000;

async function download(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'telemeSYNC-stats' }, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`${new URL(url).host} respondeu ${res.status}`);
  return res.text();
}

/**
 * Country table (DB-IP lite, CC BY 4.0). Rebuilt from the CSV files once a month and kept as a small
 * binary file in dir; the old table is kept when the download fails. null when there is none.
 */
export async function loadGeo(dir, now = Date.now(), fetchText = download) {
  const file = join(dir, 'dbip-country.bin');
  let age = Infinity;
  try {
    age = now - (await stat(file)).mtimeMs;
  } catch {
    /* not built yet */
  }
  if (age >= GEO_MAX_AGE) {
    try {
      const geo = buildGeo(await fetchText(GEO_SOURCES[0]), await fetchText(GEO_SOURCES[1]));
      if (geo.s4.length < 1000 || geo.s6.length < 1000) throw new Error('tabela de países incompleta');
      await mkdir(dir, { recursive: true });
      await writeFile(`${file}.tmp`, geoToBuffer(geo));
      await rename(`${file}.tmp`, file);
      return geo;
    } catch (e) {
      console.error('stats: cannot update the country table:', e.message);
    }
  }
  try {
    return geoFromBuffer(await readFile(file));
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------------------- Aggregation

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const salt = () => randomBytes(16).toString('hex');

/** ISO week of a "YYYY-MM-DD" day, as "YYYY-Www". */
export function isoWeek(day) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7)); // Thursday of the same week
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function emptyState() {
  return { version: 1, since: null, offset: 0, days: {}, open: {}, weeks: {}, openWeeks: {}, months: {}, openMonths: {} };
}

const MAX_EVENTS_PER_DAY = 100_000;

/** Adds one log line to the state (state is changed in place). */
export function addLine(state, line, geo) {
  const e = parseLine(line);
  const kind = classify(e);
  if (!kind) return;
  const day = e.time.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
  state.since ??= day;
  if (day < state.since) state.since = day;
  const open = (state.open[day] ??= { salt: salt(), events: [], assets: [], app: [] });
  const h = sha(`${open.salt}|${e.ip}|${e.ua}`);
  if (kind === 'asset') {
    if (!open.assets.includes(h)) open.assets.push(h);
  } else if (kind === 'page') {
    if (open.events.length < MAX_EVENTS_PER_DAY) {
      open.events.push({ h, p: pagePath(e.uri), r: refName(e.ref), c: countryOf(geo, e.ip), s: systemOf(e.ua), m: isMobile(e.ua) ? 1 : 0 });
    }
  } else if (kind === 'app') {
    if (!open.app.includes(h)) open.app.push(h);
    const week = isoWeek(day);
    const w = (state.openWeeks[week] ??= { salt: salt(), app: [] });
    const hw = sha(`${w.salt}|${e.ip}|${e.ua}`);
    if (!w.app.includes(hw)) w.app.push(hw);
    // And per month (people who opened the program this month), with a monthly salt.
    state.openMonths ??= {};
    const mo = (state.openMonths[day.slice(0, 7)] ??= { salt: salt(), app: [] });
    const hm = sha(`${mo.salt}|${e.ip}|${e.ua}`);
    if (!mo.app.includes(hm)) mo.app.push(hm);
  }
}

/** Counts of one day from its open record: only page loads whose visitor also fetched script.js. */
export function summarizeDay(open) {
  const real = new Set(open.assets);
  const out = { views: 0, visitors: 0, pages: {}, countries: {}, refs: {}, systems: {}, mobile: 0, computer: 0, app: open.app.length };
  const seen = new Set();
  const refSeen = new Set();
  for (const ev of open.events) {
    if (!real.has(ev.h)) continue;
    out.views++;
    out.pages[ev.p] = (out.pages[ev.p] ?? 0) + 1;
    if (ev.r && !refSeen.has(`${ev.h}|${ev.r}`)) {
      refSeen.add(`${ev.h}|${ev.r}`);
      out.refs[ev.r] = (out.refs[ev.r] ?? 0) + 1;
    }
    if (seen.has(ev.h)) continue;
    seen.add(ev.h);
    out.visitors++;
    if (ev.c) out.countries[ev.c] = (out.countries[ev.c] ?? 0) + 1;
    if (ev.s) out.systems[ev.s] = (out.systems[ev.s] ?? 0) + 1;
    if (ev.m) out.mobile++;
    else out.computer++;
  }
  return out;
}

/**
 * Brings the counts up to date: every open day gets its totals; days older than yesterday (and weeks
 * older than last week) are closed, which deletes their salt and codes for good.
 */
export function settle(state, today) {
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  for (const [day, open] of Object.entries(state.open)) {
    state.days[day] = summarizeDay(open);
    if (day < yesterday) delete state.open[day];
  }
  const thisWeek = isoWeek(today);
  const lastWeek = isoWeek(new Date(Date.parse(`${today}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10));
  // Months: the codes of this month and the previous one are kept, older ones deleted for good.
  state.months ??= {};
  state.openMonths ??= {};
  const thisMonth = today.slice(0, 7);
  const prevMonth = previousMonth(thisMonth);
  for (const [month, m] of Object.entries(state.openMonths)) {
    state.months[month] = { app: m.app.length };
    if (month !== thisMonth && month !== prevMonth) delete state.openMonths[month];
  }
  for (const [week, w] of Object.entries(state.openWeeks)) {
    state.weeks[week] = { app: w.app.length };
    if (week !== thisWeek && week !== lastWeek) delete state.openWeeks[week];
  }
  return state;
}

const top = (counts, limit, mapName = (k) => k) =>
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k, count]) => ({ id: k, name: mapName(k), count }));

const sumInto = (target, src) => {
  for (const [k, v] of Object.entries(src ?? {})) target[k] = (target[k] ?? 0) + v;
  return target;
};

/** "2026-11" → "2026-10". */
export function previousMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** This month and the five before it, oldest first. */
export function lastMonths(today, n = 6) {
  const out = [today.slice(0, 7)];
  while (out.length < n) out.unshift(previousMonth(out[0]));
  return out;
}

/** Counts of one month from the daily counts: visitors, views, countries, origins, systems, devices. */
export function monthSummary(state, month) {
  const countries = {};
  const refs = {};
  const systems = {};
  let visitors = 0;
  let views = 0;
  let mobile = 0;
  let computer = 0;
  let days = 0;
  for (const [day, d] of Object.entries(state.days)) {
    if (!day.startsWith(month)) continue;
    days++;
    visitors += d.visitors ?? 0;
    views += d.views ?? 0;
    sumInto(countries, d.countries);
    sumInto(refs, d.refs);
    sumInto(systems, d.systems);
    mobile += d.mobile ?? 0;
    computer += d.computer ?? 0;
  }
  return {
    key: month,
    days,
    visitors,
    views,
    app: state.months?.[month]?.app ?? 0,
    countries: top(countries, 10),
    countriesCount: Object.keys(countries).length,
    referrers: top(refs, 8).map(({ name, count }) => ({ name, count })),
    systems: top(systems, 6),
    devices: { mobile, computer },
  };
}

/** The "visits" and "app" parts of stats.json. */
export function report(state, today, dailyDays = 90) {
  const end = Date.parse(`${today}T00:00:00Z`);
  const daily = [];
  const app = [];
  for (let i = dailyDays - 1; i >= 0; i--) {
    const day = new Date(end - i * 86_400_000).toISOString().slice(0, 10);
    if (!state.since || day < state.since) continue;
    const d = state.days[day];
    daily.push({ day, n: d?.visitors ?? 0, views: d?.views ?? 0 });
    app.push({ day, n: d?.app ?? 0 });
  }
  const all = Object.values(state.days);
  const countries = {};
  const refs = {};
  const systems = {};
  let mobile = 0;
  let computer = 0;
  for (const d of all) {
    sumInto(countries, d.countries);
    sumInto(refs, d.refs);
    sumInto(systems, d.systems);
    mobile += d.mobile ?? 0;
    computer += d.computer ?? 0;
  }
  const lastN = (arr, n) => arr.slice(-n).reduce((s, x) => s + x.n, 0);
  const thisWeek = isoWeek(today);
  const lastWeek = isoWeek(new Date(end - 7 * 86_400_000).toISOString().slice(0, 10));
  const complete = state.weeks[lastWeek] && state.since && state.since <= new Date(end - 7 * 86_400_000).toISOString().slice(0, 10);
  const weekKey = complete ? lastWeek : thisWeek;
  const months = lastMonths(today);
  const current = monthSummary(state, months[5]);
  const previous = monthSummary(state, months[4]);
  return {
    monthly: {
      current,
      previous: previous.days || previous.app ? previous : null,
      history: months.map((m) => {
        const x = monthSummary(state, m);
        return { key: m, visitors: x.visitors, views: x.views, app: x.app, days: x.days };
      }),
      // This month's days (days without visits included).
      daily: daily.filter((d) => d.day.startsWith(months[5])),
    },
    visits: {
      source: 'server',
      since: state.since,
      total: all.reduce((s, d) => s + (d.visitors ?? 0), 0),
      views: all.reduce((s, d) => s + (d.views ?? 0), 0),
      last7: lastN(daily, 7),
      last30: lastN(daily, 30),
      daily,
      countries: top(countries, 10),
      countriesCount: Object.keys(countries).length,
      referrers: top(refs, 8).map(({ name, count }) => ({ name, count })),
      systems: top(systems, 6),
      devices: { mobile, computer },
    },
    app: {
      since: state.since,
      daily: app,
      week: state.weeks[weekKey] ? { key: weekKey, n: state.weeks[weekKey].app, complete: !!complete } : null,
    },
  };
}

// ------------------------------------------------------------------------------------------ Log file

/**
 * Reads the new lines of the log since the last run into the state, then empties the log, so an
 * address stays in it for one collection interval at most (nginx appends, so it carries on at the start).
 */
export async function readLog(state, logPath, geo) {
  let size;
  try {
    size = (await stat(logPath)).size;
  } catch {
    return 0;
  }
  if (size < state.offset) state.offset = 0;
  if (size === state.offset) return 0;
  let count = 0;
  let consumed = state.offset;
  const stream = createReadStream(logPath, { start: state.offset, end: size - 1, encoding: 'utf8' });
  let pending = '';
  for await (const chunk of stream) {
    pending += chunk;
    let nl;
    while ((nl = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, nl);
      pending = pending.slice(nl + 1);
      consumed += Buffer.byteLength(line, 'utf8') + 1;
      if (line) {
        addLine(state, line, geo);
        count++;
      }
    }
  }
  state.offset = consumed;
  try {
    await truncate(logPath, 0);
    state.offset = 0;
  } catch (e) {
    console.error('stats: cannot empty the access log:', e.message);
  }
  return count;
}

