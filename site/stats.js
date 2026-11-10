/* ==========================================================================
   /stats page: reads data/stats.json (written every hour by scripts/stats-collector.mjs) and draws the
   summary numbers, the visits and downloads charts and the top countries / origins / systems.
   Uses t(), dict, currentLang and timeAgo() from script.js; redraws when the language changes.
   ========================================================================== */

const STATS_URL = 'data/stats.json';
// Chart colours (checked for colour-blind separation and contrast on the dark panel)
const STATS_COLORS = { windows: '#3a8fe0', mac: '#e8691a', visits: '#e8691a' };

// Portuguese texts written by this script (the other languages have them under the same keys in i18n/*.json)
const STATS_PT = {
  'stats.updated': 'Atualizado {time}',
  'stats.unavailable': 'Estatísticas indisponíveis de momento. Volte a tentar daqui a pouco.',
  'stats.kpiVisits': 'visitas ao site',
  'stats.kpiVisits30': '{n} nos últimos 30 dias',
  'stats.kpiVisitsSince': 'contadas desde {date}',
  'stats.kpiApp': 'usaram o programa esta semana',
  'stats.kpiAppLast': 'usaram o programa na semana passada',
  'stats.kpiAppSub': 'pessoas diferentes que abriram o programa',
  'stats.appLead': 'Pessoas diferentes que abriram o programa em cada dia (o programa verifica se há versão nova ao abrir).',
  'stats.usersOn': '{n} pessoas',
  'stats.kpiDownloads': 'downloads do programa',
  'stats.kpiDownloadsSince': 'desde {date}',
  'stats.kpiCountries': 'países',
  'stats.kpiCountriesSub': 'de onde nos visitam',
  'stats.kpiMobile': 'visitam no telemóvel',
  'stats.kpiMobileSub': '{p} num computador',
  'stats.kpiSupporters': 'apoiantes',
  'stats.kpiSupportersSub': 'pagaram um café ao projeto',
  'stats.kpiReleases': 'versões lançadas',
  'stats.kpiReleasesSub': 'a mais recente é a {v}',
  'stats.visitsLead': '{n} visitas nos últimos 30 dias, {w} nos últimos 7.',
  'stats.visitorsOn': '{n} visitantes',
  'stats.downloadsLead': '{n} downloads no total: {w} para Windows e {m} para macOS.',
  'stats.colDay': 'Dia',
  'stats.colVisitors': 'Visitantes',
  'stats.colUsers': 'Pessoas',
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

function renderKpis(d) {
  const box = document.querySelector('.js-kpis');
  const tiles = [];
  const v = d.visits;
  if (v?.total != null) {
    const recent = v.since && Date.now() - Date.parse(`${v.since}T00:00:00Z`) < 30 * 86_400_000;
    tiles.push({ value: fmtNum(v.total), label: st('stats.kpiVisits'), sub: recent ? st('stats.kpiVisitsSince', { date: fmtDate(v.since) }) : st('stats.kpiVisits30', { n: fmtNum(v.last30) }) });
  }
  const week = d.app?.week;
  if (week?.n) tiles.push({ value: fmtNum(week.n), label: st(week.complete ? 'stats.kpiAppLast' : 'stats.kpiApp'), sub: st('stats.kpiAppSub') });
  const dl = d.downloads;
  if (dl?.total != null) tiles.push({ value: fmtNum(dl.total), label: st('stats.kpiDownloads'), sub: dl.since ? st('stats.kpiDownloadsSince', { date: fmtDate(dl.since) }) : '' });
  if (v?.countriesCount) tiles.push({ value: fmtNum(v.countriesCount), label: st('stats.kpiCountries'), sub: st('stats.kpiCountriesSub') });
  const dev = v?.devices;
  if (dev && dev.mobile + dev.computer > 0) {
    const all = dev.mobile + dev.computer;
    tiles.push({ value: fmtPct(dev.mobile, all), label: st('stats.kpiMobile'), sub: st('stats.kpiMobileSub', { p: fmtPct(dev.computer, all) }) });
  }
  if (d.supporters?.count) tiles.push({ value: fmtNum(d.supporters.count), label: st('stats.kpiSupporters'), sub: st('stats.kpiSupportersSub') });
  if (d.project?.releases) tiles.push({ value: fmtNum(d.project.releases), label: st('stats.kpiReleases'), sub: d.project.latest ? st('stats.kpiReleasesSub', { v: d.project.latest }) : '' });
  for (const a of d.audience ?? []) {
    const label = a.labels?.[currentLang] ?? a.label;
    const value = el('span', { class: 'kpi__value', text: fmtNum(a.value) });
    tiles.push({ node: value, label, url: a.url });
  }
  box.replaceChildren(
    ...tiles.map((tile) => {
      const value = tile.node ?? el('span', { class: 'kpi__value', text: tile.value });
      const card = el(tile.url ? 'a' : 'div', tile.url ? { class: 'kpi kpi--link', href: tile.url, target: '_blank', rel: 'noopener' } : { class: 'kpi' }, [
        value,
        el('span', { class: 'kpi__label', text: tile.label }),
        tile.sub ? el('span', { class: 'kpi__sub', text: tile.sub }) : null,
      ]);
      return card;
    }),
  );
}

// -------------------------------------------------------------------------------------- Daily charts

/** Bar chart of one value per day (single series: no legend, the section title names it). */
function drawDaily(host, daily, color, tipKey, title) {
  const W = Math.max(300, host.clientWidth);
  const H = W < 560 ? 220 : 280;
  const m = { top: 12, right: 8, bottom: 28, left: 40 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;
  const { top, ticks } = niceScale(Math.max(...daily.map((x) => x.n)));
  // At least 14 slots, so the first days are not drawn as a few huge bars
  const slots = Math.max(14, daily.length);
  const slot = iw / slots;
  const gap = slot > 6 ? 2 : 1;
  const bw = Math.max(1, Math.min(28, slot - gap));
  const y = (n) => m.top + ih - (n / top) * ih;

  const chart = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': title });
  for (const tv of ticks) {
    chart.append(svg('line', { x1: m.left, x2: W - m.right, y1: y(tv), y2: y(tv), class: tv === 0 ? 'chart-axis' : 'chart-grid' }));
    const label = svg('text', { x: m.left - 8, y: y(tv) + 4, 'text-anchor': 'end', class: 'chart-tick' });
    label.textContent = fmtNum(tv);
    chart.append(label);
  }
  // Month labels at the first day of each month (and the first day shown)
  let lastMonth = '';
  daily.forEach((p, i) => {
    const month = p.day.slice(0, 7);
    if (month === lastMonth) return;
    lastMonth = month;
    if (i > daily.length - 4 && i !== 0) return;
    const label = svg('text', { x: m.left + i * slot, y: H - 8, class: 'chart-tick' });
    label.textContent = fmtDate(p.day, i === 0 ? { day: 'numeric', month: 'short' } : { month: 'short' });
    chart.append(label);
  });
  daily.forEach((p, i) => {
    const x = m.left + i * slot + (slot - bw) / 2;
    if (p.n > 0) chart.append(svg('path', { d: barPath(x, y(p.n), bw, m.top + ih - y(p.n), Math.min(4, bw / 2)), fill: color }));
    // Hover target: the whole column, wider than the bar
    const hit = svg('rect', { x: m.left + i * slot, y: m.top, width: slot, height: ih, class: 'chart-hit' });
    hit.addEventListener('pointermove', (e) => showTip(`<b>${fmtDate(p.day, { weekday: 'short', day: 'numeric', month: 'short' })}</b><br>${st(tipKey, { n: fmtNum(p.n) })}`, e));
    hit.addEventListener('pointerleave', hideTip);
    chart.append(hit);
  });
  host.replaceChildren(chart);
}

function dailyTable(host, daily, colKey) {
  const rows = [...daily].reverse().map((p) => el('tr', {}, [el('td', { text: fmtDate(p.day) }), el('td', { text: fmtNum(p.n) })]));
  host.replaceChildren(el('table', {}, [el('thead', {}, el('tr', {}, [el('th', { text: st('stats.colDay') }), el('th', { text: st(colKey) })])), el('tbody', {}, rows)]));
}

function renderVisits(d) {
  const sec = document.querySelector('.js-sec-visits');
  const daily = d.visits?.daily ?? [];
  sec.hidden = !daily.length;
  if (sec.hidden) return;
  document.querySelector('.js-visits-lead').textContent = st('stats.visitsLead', { n: fmtNum(d.visits.last30), w: fmtNum(d.visits.last7) });
  drawDaily(document.querySelector('.js-chart-visits'), daily, STATS_COLORS.visits, 'stats.visitorsOn', sec.querySelector('h2').textContent);
  dailyTable(document.querySelector('.js-table-visits'), daily, 'stats.colVisitors');
}

function renderApp(d) {
  const sec = document.querySelector('.js-sec-app');
  const daily = d.app?.daily ?? [];
  sec.hidden = !daily.some((p) => p.n > 0);
  if (sec.hidden) return;
  document.querySelector('.js-app-lead').textContent = st('stats.appLead');
  drawDaily(document.querySelector('.js-chart-app'), daily, STATS_COLORS.windows, 'stats.usersOn', sec.querySelector('h2').textContent);
  dailyTable(document.querySelector('.js-table-app'), daily, 'stats.colUsers');
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
      /* old browser: GoatCounter's English name */
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
  const v = d.visits ?? {};
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
  renderVisits(statsData);
  renderApp(statsData);
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
    resizeTimer = setTimeout(() => statsData && (renderVisits(statsData), renderApp(statsData), renderDownloads(statsData)), 150);
  });
});
