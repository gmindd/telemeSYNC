/* ==========================================================================
   /stats page: reads data/stats.json (written every hour by scripts/stats-collector.mjs) and draws the
   this month's numbers, the previous month, the last 6 months, this month's visits per day, the
   downloads per version and this month's top countries / origins / systems.
   Uses t(), dict, currentLang and timeAgo() from script.js; redraws when the language changes.
   ========================================================================== */

const STATS_URL = '/data/stats.json';
// Chart colours (checked for colour-blind separation and contrast on the dark panel)
const STATS_COLORS = { windows: '#3a8fe0', mac: '#e8691a', visits: '#e8691a' };

// Portuguese texts written by this script (the other languages have them under the same keys in i18n/*.json)
const STATS_PT = {
  'stats.updated': 'Atualizado {time}',
  'stats.unavailable': 'Estatísticas indisponíveis de momento. Volte a tentar daqui a pouco.',
  'stats.monthTitle': 'Este mês · {month}',
  'stats.prevLead': 'Os números de {month}, o mês completo.',
  'stats.kpiVisits': 'visitas ao site',
  'stats.kpiViews': '{n} páginas vistas',
  'stats.kpiApp': 'pessoas usaram o programa',
  'stats.kpiAppSub': 'pessoas diferentes que o abriram',
  'stats.kpiMonthDownloads': 'downloads do programa',
  'stats.kpiSinceDay': 'desde {date}',
  'stats.inMonth': '{n} em {month}',
  'stats.kpiDownloads': 'downloads no total',
  'stats.kpiDownloadsSince': 'desde {date}',
  'stats.kpiCountries': 'países',
  'stats.kpiCountriesSub': 'de onde nos visitam',
  'stats.kpiMobile': 'visitam no telemóvel',
  'stats.kpiMobileSub': '{p} num computador',
  'stats.kpiSupporters': 'apoiantes',
  'stats.kpiSupportersSub': 'pagaram um café ao projeto',
  'stats.kpiReleases': 'versões lançadas',
  'stats.kpiReleasesSub': 'a mais recente é a {v}',
  'stats.visitsLead': '{n} visitas até agora, em {d} dias.',
  'stats.visitsLeadPartial': '{n} visitas este mês. O detalhe por dia só existe a partir de {date}.',
  'stats.countingNote': 'A contagem do próprio site começou a {date}.',
  'stats.visitorsOn': '{n} visitantes',
  'stats.downloadsLead': '{n} downloads no total: {w} para Windows e {m} para macOS.',
  'stats.colMonth': 'Mês',
  'stats.colViews': 'Páginas vistas',
  'stats.colApp': 'Usaram o programa',
  'stats.colDownloads': 'Downloads',
  'stats.thisMonth': '(este mês, até agora)',
  'stats.colDay': 'Dia',
  'stats.colVisitors': 'Visitantes',
  'stats.colVersion': 'Versão',
  'stats.colDate': 'Data',
  'stats.colTotal': 'Total',
  'stats.version': 'Versão {v}',
};

let statsData = null;

function st(key, params = {}) {
  let text = (currentLang !== 'pt' && dict[key]) || STATS_PT[key] || t(key);
  for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{${k}}`, v);
  return text;
}

const fmtNum = (n) => Number(n).toLocaleString(t('locale'));
const fmtPct = (part, total) => (total > 0 ? `${Math.round((part / total) * 100)}%` : '—');
const fmtDate = (iso, opts = { day: 'numeric', month: 'long', year: 'numeric' }) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(t('locale'), opts);

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v;
    else if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c != null) node.append(c);
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/** Bar with 4 px rounded top corners, square at the baseline. */
function barPath(x, y, w, h, r = 4) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** Round axis maximum and three gridline values. */
function niceScale(max) {
  if (max <= 0) return { top: 4, ticks: [0, 2, 4] };
  const raw = max / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw);
  return { top: step * 3, ticks: [0, step, step * 2, step * 3] };
}

// ------------------------------------------------------------------------------------------- Tooltip

let tooltip;
function showTip(html, evt) {
  if (!tooltip) {
    tooltip = el('div', { class: 'chart-tip', role: 'status' });
    document.body.append(tooltip);
  }
  tooltip.innerHTML = html;
  tooltip.hidden = false;
  const pad = 12;
  const { innerWidth: vw } = window;
  const rect = tooltip.getBoundingClientRect();
  let x = evt.clientX + pad;
  if (x + rect.width > vw - 8) x = evt.clientX - rect.width - pad;
  tooltip.style.left = `${Math.max(8, x)}px`;
  tooltip.style.top = `${Math.max(8, evt.clientY - rect.height - pad)}px`;
}
function hideTip() {
  if (tooltip) tooltip.hidden = true;
}

// ---------------------------------------------------------------------------------------------- KPIs

/** "novembro de 2026" (capitalised: "Novembro de 2026"). */
function monthName(key, opts = { month: 'long', year: 'numeric' }, capital = true) {
  const text = new Date(`${key}-15T12:00:00`).toLocaleDateString(t('locale'), opts);
  return capital ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function kpiTiles(box, tiles) {
  box.replaceChildren(
    ...tiles.map((tile) => {
      const value = el('span', { class: 'kpi__value', text: tile.value });
      return el(tile.url ? 'a' : 'div', tile.url ? { class: 'kpi kpi--link', href: tile.url, target: '_blank', rel: 'noopener' } : { class: 'kpi' }, [
        value,
        el('span', { class: 'kpi__label', text: tile.label }),
        tile.sub ? el('span', { class: 'kpi__sub', text: tile.sub }) : null,
      ]);
    }),
  );
}

/** Tiles of one month: visits, people using the program, downloads, countries, phone or computer. */
function monthTiles(m, compare) {
  const tiles = [];
  const vs = (k) => (compare && compare[k] != null ? st('stats.inMonth', { n: fmtNum(compare[k]), month: monthName(compare.key, { month: 'long' }, false) }) : '');
  tiles.push({ value: fmtNum(m.visitors ?? 0), label: st('stats.kpiVisits'), sub: vs('visitors') || (m.views ? st('stats.kpiViews', { n: fmtNum(m.views) }) : '') });
  tiles.push({ value: fmtNum(m.app ?? 0), label: st('stats.kpiApp'), sub: vs('app') || st('stats.kpiAppSub') });
  if (m.downloads != null) tiles.push({ value: fmtNum(m.downloads), label: st('stats.kpiMonthDownloads'), sub: vs('downloads') || (m.downloadsSince ? st('stats.kpiSinceDay', { date: fmtDate(m.downloadsSince, { day: 'numeric', month: 'long' }) }) : '') });
  if (m.countriesCount) tiles.push({ value: fmtNum(m.countriesCount), label: st('stats.kpiCountries'), sub: st('stats.kpiCountriesSub') });
  // Phone or computer: left out when part of the month was written by hand without it.
  const dev = m.devices;
  if (!m.devicesUnknown && dev && dev.mobile + dev.computer > 0) {
    const all = dev.mobile + dev.computer;
    tiles.push({ value: fmtPct(dev.mobile, all), label: st('stats.kpiMobile'), sub: st('stats.kpiMobileSub', { p: fmtPct(dev.computer, all) }) });
  }
  return tiles;
}

function renderKpis(d) {
  const mo = d.monthly;
  const title = document.querySelector('.js-month-title');
  title.hidden = !mo?.current;
  if (mo?.current) {
    title.textContent = st('stats.monthTitle', { month: monthName(mo.current.key) });
    kpiTiles(document.querySelector('.js-kpis'), monthTiles(mo.current, mo.previous));
  }
  const note = document.querySelector('.js-counting-note');
  note.hidden = !(d.countingSince && mo?.current && d.countingSince.startsWith(mo.current.key));
  if (!note.hidden) note.textContent = st('stats.countingNote', { date: fmtDate(d.countingSince) });
  const all = [];
  if (d.visits?.total > 0) all.push({ value: fmtNum(d.visits.total), label: st('stats.kpiVisits'), sub: d.countingSince ? st('stats.kpiDownloadsSince', { date: fmtDate(d.countingSince) }) : '' });
  const dl = d.downloads;
  if (dl?.total != null) all.push({ value: fmtNum(dl.total), label: st('stats.kpiDownloads'), sub: dl.since ? st('stats.kpiDownloadsSince', { date: fmtDate(dl.since) }) : '' });
  if (d.supporters?.count) all.push({ value: fmtNum(d.supporters.count), label: st('stats.kpiSupporters'), sub: st('stats.kpiSupportersSub') });
  if (d.project?.releases) all.push({ value: fmtNum(d.project.releases), label: st('stats.kpiReleases'), sub: d.project.latest ? st('stats.kpiReleasesSub', { v: d.project.latest }) : '' });
  for (const a of d.audience ?? []) all.push({ value: fmtNum(a.value), label: a.labels?.[currentLang] ?? a.label, url: a.url });
  kpiTiles(document.querySelector('.js-kpis-all'), all);
}

function renderPrevious(d) {
  const sec = document.querySelector('.js-sec-prev');
  const prev = d.monthly?.previous;
  sec.hidden = !prev;
  if (!prev) return;
  document.querySelector('.js-prev-lead').textContent = st('stats.prevLead', { month: monthName(prev.key, undefined, false) });
  kpiTiles(document.querySelector('.js-kpis-prev'), monthTiles(prev, null));
}

// -------------------------------------------------------------------------------------- Daily charts

/** Bar chart of one value per slot (single series: no legend, the section title names it). */
function drawBars(host, points, { color, title, minSlots = 14, axisLabel, tip }) {
  const W = Math.max(300, host.clientWidth);
  const H = W < 560 ? 220 : 280;
  const m = { top: 12, right: 8, bottom: 28, left: 40 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;
  const { top, ticks } = niceScale(Math.max(...points.map((x) => x.n)));
  const slots = Math.max(minSlots, points.length);
  const slot = iw / slots;
  const gap = slot > 6 ? 2 : 1;
  const bw = Math.max(1, Math.min(minSlots > 6 ? 28 : 72, slot - gap));
  const y = (n) => m.top + ih - (n / top) * ih;

  const chart = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': title });
  for (const tv of ticks) {
    chart.append(svg('line', { x1: m.left, x2: W - m.right, y1: y(tv), y2: y(tv), class: tv === 0 ? 'chart-axis' : 'chart-grid' }));
    const label = svg('text', { x: m.left - 8, y: y(tv) + 4, 'text-anchor': 'end', class: 'chart-tick' });
    label.textContent = fmtNum(tv);
    chart.append(label);
  }
  points.forEach((p, i) => {
    const x = m.left + i * slot + (slot - bw) / 2;
    if (p.n > 0) chart.append(svg('path', { d: barPath(x, y(p.n), bw, m.top + ih - y(p.n), Math.min(4, bw / 2)), fill: color, opacity: p.partial ? 0.6 : 1 }));
    const text = axisLabel(p, i);
    if (text) {
      const label = svg('text', { x: m.left + i * slot + slot / 2, y: H - 8, 'text-anchor': 'middle', class: 'chart-tick' });
      label.textContent = text;
      chart.append(label);
    }
    const hit = svg('rect', { x: m.left + i * slot, y: m.top, width: slot, height: ih, class: 'chart-hit' });
    hit.addEventListener('pointermove', (e) => showTip(tip(p), e));
    hit.addEventListener('pointerleave', hideTip);
    chart.append(hit);
  });
  host.replaceChildren(chart);
}

/** Table; `cls` gives a class per column (e.g. one hidden on phones). */
function table(host, head, rows, cls = []) {
  const at = (i) => (cls[i] ? { class: cls[i] } : {});
  host.replaceChildren(
    el('table', {}, [
      el('thead', {}, el('tr', {}, head.map((h, i) => el('th', { ...at(i), text: h })))),
      el('tbody', {}, rows.map((r) => el('tr', {}, r.map((c, i) => el('td', { ...at(i), text: c }))))),
    ]),
  );
}

function renderVisits(d) {
  const sec = document.querySelector('.js-sec-visits');
  const daily = d.monthly?.daily ?? [];
  sec.hidden = !daily.length;
  if (sec.hidden) return;
  const cur = d.monthly.current ?? {};
  // Visits written by hand (from before a restart) have no day-by-day detail.
  const firstDay = daily.find((p) => p.n > 0)?.day ?? daily.at(-1).day;
  document.querySelector('.js-visits-lead').textContent = cur.handAdded
    ? st('stats.visitsLeadPartial', { n: fmtNum(cur.visitors ?? 0), date: fmtDate(firstDay, { day: 'numeric', month: 'long' }) })
    : st('stats.visitsLead', { n: fmtNum(cur.visitors ?? 0), d: fmtNum(daily.length) });
  // Every day of the month has a slot, so the month fills up as it goes.
  const [yy, mm] = daily[0].day.split('-').map(Number);
  const monthDays = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  drawBars(document.querySelector('.js-chart-visits'), daily, {
    color: STATS_COLORS.visits,
    title: sec.querySelector('h2').textContent,
    minSlots: monthDays,
    axisLabel: (p) => {
      const day = Number(p.day.slice(8));
      return day === 1 || day % 5 === 0 ? String(day) : '';
    },
    tip: (p) => `<b>${fmtDate(p.day, { weekday: 'short', day: 'numeric', month: 'short' })}</b><br>${st('stats.visitorsOn', { n: fmtNum(p.n) })}`,
  });
  table(document.querySelector('.js-table-visits'), [st('stats.colDay'), st('stats.colVisitors')], [...daily].reverse().map((p) => [fmtDate(p.day), fmtNum(p.n)]));
}

function renderMonths(d) {
  const sec = document.querySelector('.js-sec-months');
  const history = d.monthly?.history ?? [];
  const first = history.findIndex((h) => h.visitors || h.app || h.downloads);
  sec.hidden = first < 0;
  if (sec.hidden) return;
  const shown = history.slice(first);
  const currentKey = d.monthly.current?.key;
  const points = shown.map((h) => ({ ...h, n: h.visitors ?? 0, partial: h.key === currentKey }));
  drawBars(document.querySelector('.js-chart-months'), points, {
    color: STATS_COLORS.visits,
    title: sec.querySelector('h2').textContent,
    minSlots: 6,
    axisLabel: (p) => monthName(p.key, { month: 'short' }),
    tip: (p) =>
      `<b>${monthName(p.key)}</b>${p.partial ? ` ${st('stats.thisMonth')}` : ''}<br>${st('stats.colVisitors')} ${fmtNum(p.visitors ?? 0)}<br>` +
      `${st('stats.colApp')} ${fmtNum(p.app ?? 0)}<br>${st('stats.colDownloads')} ${fmtNum(p.downloads ?? 0)}`,
  });
  table(
    document.querySelector('.js-table-months'),
    [st('stats.colMonth'), st('stats.colVisitors'), st('stats.colViews'), st('stats.colApp'), st('stats.colDownloads')],
    [...shown].reverse().map((h) => [monthName(h.key) + (h.key === currentKey ? ` ${st('stats.thisMonth')}` : ''), fmtNum(h.visitors ?? 0), h.views == null ? '—' : fmtNum(h.views), fmtNum(h.app ?? 0), fmtNum(h.downloads ?? 0)]),
    ['', '', 'col-wide'],
  );
}

// ---------------------------------------------------------------------------------- Downloads chart

function renderDownloads(d) {
  const sec = document.querySelector('.js-sec-downloads');
  const releases = d.downloads?.releases ?? [];
  sec.hidden = !releases.length;
  if (sec.hidden) return;
  const dl = d.downloads;
  document.querySelector('.js-downloads-lead').textContent = st('stats.downloadsLead', {
    n: fmtNum(dl.total),
    w: fmtPct(dl.windows, dl.total),
    m: fmtPct(dl.mac, dl.total),
  });
  document.querySelector('.js-legend-downloads').replaceChildren(
    ...[
      ['windows', 'Windows', dl.windows],
      ['mac', 'macOS', dl.mac],
    ].map(([k, name, n]) => el('span', { class: 'legend-item' }, [el('span', { class: 'legend-swatch', style: `background:${STATS_COLORS[k]}` }), `${name} · ${fmtNum(n)}`])),
  );

  const host = document.querySelector('.js-chart-downloads');
  const W = Math.max(300, host.clientWidth);
  const H = W < 560 ? 240 : 300;
  const m = { top: 26, right: 8, bottom: 44, left: 40 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;
  const totals = releases.map((r) => r.windows + r.mac + (r.other || 0));
  const { top, ticks } = niceScale(Math.max(...totals));
  const slot = iw / releases.length;
  const bw = Math.min(72, slot * 0.6);
  const y = (n) => m.top + ih - (n / top) * ih;
  const hgt = (n) => (n / top) * ih;

  const chart = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': document.querySelector('.js-sec-downloads h2').textContent });
  for (const tv of ticks) {
    chart.append(svg('line', { x1: m.left, x2: W - m.right, y1: y(tv), y2: y(tv), class: tv === 0 ? 'chart-axis' : 'chart-grid' }));
    const label = svg('text', { x: m.left - 8, y: y(tv) + 4, 'text-anchor': 'end', class: 'chart-tick' });
    label.textContent = fmtNum(tv);
    chart.append(label);
  }
  releases.forEach((r, i) => {
    const cx = m.left + slot * i + slot / 2;
    const x = cx - bw / 2;
    const base = m.top + ih;
    const wh = hgt(r.windows);
    const mh = hgt(r.mac);
    // Windows at the bottom, macOS on top, with a 2 px gap of panel colour between them
    if (r.windows > 0) chart.append(svg('path', { d: r.mac > 0 ? `M${x},${base}V${base - wh}H${x + bw}V${base}Z` : barPath(x, base - wh, bw, wh), fill: STATS_COLORS.windows }));
    if (r.mac > 0) {
      const mTop = base - wh - mh;
      chart.append(svg('path', { d: barPath(x, mTop, bw, Math.max(0, mh - (r.windows > 0 ? 2 : 0))), fill: STATS_COLORS.mac }));
    }
    const total = svg('text', { x: cx, y: y(totals[i]) - 8, 'text-anchor': 'middle', class: 'chart-value' });
    total.textContent = fmtNum(totals[i]);
    chart.append(total);
    const v = svg('text', { x: cx, y: H - 24, 'text-anchor': 'middle', class: 'chart-cat' });
    v.textContent = r.version;
    const dt = svg('text', { x: cx, y: H - 8, 'text-anchor': 'middle', class: 'chart-tick' });
    dt.textContent = fmtDate(r.date, { day: 'numeric', month: 'short' });
    chart.append(v, dt);
    const hit = svg('rect', { x: m.left + slot * i, y: m.top, width: slot, height: ih, class: 'chart-hit' });
    hit.addEventListener('pointermove', (e) =>
      showTip(
        `<b>${st('stats.version', { v: r.version })}</b> · ${fmtDate(r.date)}<br>` +
          `<span class="tip-swatch" style="background:${STATS_COLORS.windows}"></span>Windows ${fmtNum(r.windows)}<br>` +
          `<span class="tip-swatch" style="background:${STATS_COLORS.mac}"></span>macOS ${fmtNum(r.mac)}<br>` +
          `${st('stats.colTotal')} ${fmtNum(totals[i])}`,
        e,
      ),
    );
    hit.addEventListener('pointerleave', hideTip);
    chart.append(hit);
  });
  host.replaceChildren(chart);

  const head = el('tr', {}, [st('stats.colVersion'), st('stats.colDate'), 'Windows', 'macOS', st('stats.colTotal')].map((h) => el('th', { text: h })));
  const rows = releases.map((r, i) =>
    el('tr', {}, [r.version, fmtDate(r.date), fmtNum(r.windows), fmtNum(r.mac), fmtNum(totals[i])].map((c) => el('td', { text: c }))),
  );
  document.querySelector('.js-table-downloads').replaceChildren(el('table', {}, [el('thead', {}, head), el('tbody', {}, rows)]));
}

// --------------------------------------------------------------------------------------- Top lists

const flagEmoji = (code) =>
  /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '';

function countryName(item) {
  const code = String(item.id || '').toUpperCase();
  if (/^[A-Z]{2}$/.test(code)) {
    try {
      return new Intl.DisplayNames([t('locale')], { type: 'region' }).of(code) ?? item.name;
    } catch {
      /* old browser: the country code */
    }
  }
  return item.name;
}

function renderRank(selector, cardSelector, items, label) {
  const card = document.querySelector(cardSelector);
  card.hidden = !items?.length;
  if (card.hidden) return false;
  const max = Math.max(...items.map((x) => x.count));
  document.querySelector(selector).replaceChildren(
    ...items.map((item) =>
      el('li', { class: 'rank__item' }, [
        el('span', { class: 'rank__name', text: label(item) }),
        el('span', { class: 'rank__count', text: fmtNum(item.count) }),
        el('span', { class: 'rank__bar', 'aria-hidden': 'true' }, el('span', { style: `width:${Math.max(2, (item.count / max) * 100)}%` })),
      ]),
    ),
  );
  return true;
}

function renderAudience(d) {
  const v = d.monthly?.current ?? {};
  const shown = [
    renderRank('.js-list-countries', '.js-rank-countries', v.countries, (c) => `${flagEmoji(String(c.id || '').toUpperCase())} ${countryName(c)}`.trim()),
    renderRank('.js-list-referrers', '.js-rank-referrers', v.referrers, (r) => r.name),
    renderRank('.js-list-systems', '.js-rank-systems', v.systems, (s) => s.name),
  ];
  document.querySelector('.js-sec-audience').hidden = !shown.some(Boolean);
}

// -------------------------------------------------------------------------------------------- Main

function renderStats() {
  const updated = document.querySelector('.js-stats-updated');
  if (!statsData) return;
  updated.textContent = st('stats.updated', { time: timeAgo(statsData.updatedAt) });
  renderKpis(statsData);
  renderPrevious(statsData);
  renderMonths(statsData);
  renderVisits(statsData);
  renderDownloads(statsData);
  renderAudience(statsData);
}

document.addEventListener('DOMContentLoaded', () => {
  fetch(STATS_URL, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((d) => {
      statsData = d;
      renderStats();
    })
    .catch(() => {
      document.querySelector('.js-stats-updated').textContent = st('stats.unavailable');
    });
  document.addEventListener('site:language', renderStats);
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => statsData && (renderMonths(statsData), renderVisits(statsData), renderDownloads(statsData)), 150);
  });
});
