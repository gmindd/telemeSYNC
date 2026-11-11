// Builds the site's pages in each language from the Portuguese ones and site/i18n/<lang>.json:
//   node scripts/build-langs.mjs <site folder> [<output folder>]
// writes <output>/en/index.html, <output>/en/stats.html, … (output = site folder by default). Run by the
// Dockerfile when the image is built, so the language pages always match the Portuguese ones.
//
// Each page is the Portuguese page with every element marked data-i18n="key" (and data-i18n-alt /
// data-i18n-aria-label) translated in the HTML itself, so search engines read it in that language;
// plus its own <html lang>, title, description, social card texts, canonical address, dates and the
// current flag. Every link to a file of the site is root-absolute (/style.css…), so it works from /en/.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const SITE_URL = 'https://telemesync.pereiragabriel.com';
export const LANGS = ['en', 'fr', 'es', 'de'];
/** Pages that have a version in every language: file and address of the Portuguese one. */
export const PAGES = [
  { file: 'index.html', path: '/' },
  { file: 'stats.html', path: '/stats' },
];
const OG_LOCALES = { pt: 'pt_PT', en: 'en_GB', fr: 'fr_FR', es: 'es_ES', de: 'de_DE' };

const MONTHS = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
};

/** "12 November 2026", "12 novembre 2026", "12 de noviembre de 2026", "12. November 2026". */
export function longDate(lang, y, m, d) {
  const month = MONTHS[lang][m - 1];
  if (lang === 'es') return `${d} de ${month} de ${y}`;
  if (lang === 'de') return `${d}. ${month} ${y}`;
  return `${d} ${month} ${y}`;
}

/** Address of a page in a language ("/" → "/en/", "/stats" → "/en/stats"). */
export function pageUrl(path, lang) {
  if (lang === 'pt') return SITE_URL + path;
  return `${SITE_URL}/${lang}${path === '/' ? '/' : path}`;
}

const escAttr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Index just past the end tag that closes the element whose start tag ends at `from` (elements of the
 * same name may be nested inside it).
 */
function closeOf(html, tag, from) {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = from;
  let depth = 1;
  for (let m; (m = re.exec(html)); ) {
    if (m[0].endsWith('/>')) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return { innerEnd: m.index, end: m.index + m[0].length };
  }
  throw new Error(`no </${tag}> for the element at ${from}`);
}

/** Sets (or adds) an attribute in a start tag. */
function setAttr(tag, name, value) {
  const re = new RegExp(`(\\s${name}=")[^"]*(")`);
  if (re.test(tag)) return tag.replace(re, `$1${escAttr(value)}$2`);
  return tag.replace(/\s*(\/?)>$/, ` ${name}="${escAttr(value)}"$1>`);
}

/**
 * The page in `lang`. Returns the HTML and the keys that had no translation (left in Portuguese).
 */
export function translatePage(html, lang, texts, path) {
  const missing = new Set();
  const get = (key) => {
    if (typeof texts[key] === 'string') return texts[key];
    missing.add(key);
    return null;
  };

  // 1. Elements with data-i18n: their content; data-i18n-alt / -aria-label: that attribute.
  let out = '';
  let pos = 0;
  const startTag = /<([a-zA-Z][\w-]*)(\s[^>]*)?>/g;
  for (let m; (m = startTag.exec(html)); ) {
    let tag = m[0];
    const attrs = m[2] ?? '';
    const name = m[1].toLowerCase();
    if (!/\sdata-i18n/.test(attrs)) continue;
    for (const attr of ['alt', 'aria-label']) {
      const key = attrs.match(new RegExp(`\\sdata-i18n-${attr}="([^"]+)"`))?.[1];
      const value = key ? get(key) : null;
      if (value !== null) tag = setAttr(tag, attr, value);
    }
    const key = attrs.match(/\sdata-i18n="([^"]+)"/)?.[1];
    out += html.slice(pos, m.index) + tag;
    pos = m.index + m[0].length;
    if (key) {
      const { innerEnd } = closeOf(html, name, pos);
      const value = get(key);
      out += value ?? html.slice(pos, innerEnd);
      pos = innerEnd;
      startTag.lastIndex = innerEnd;
    }
  }
  out += html.slice(pos);

  // 2. Head: language, title, description, social card, canonical address, structured data.
  const metaKey = out.match(/<html[^>]*\sdata-i18n-meta="([^"]+)"/)?.[1] ?? 'meta';
  const title = get(`${metaKey}.title`);
  const description = get(`${metaKey}.description`);
  const url = pageUrl(path, lang);
  out = out.replace(/<html([^>]*)\slang="[^"]*"/, `<html$1 lang="${lang}"`);
  if (title) {
    out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`);
    out = out.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escAttr(title)}$2`);
  }
  if (description) {
    out = out.replace(/(<meta name="description" content=")[^"]*(")/, `$1${escAttr(description)}$2`);
    out = out.replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${escAttr(texts[`${metaKey}.ogDescription`] ?? description)}$2`);
    out = out.replace(/("@type": "SoftwareApplication",[\s\S]*?"description": )"[^"]*"/, (m0, head) => `${head}${JSON.stringify(description)}`);
  }
  // Structured data: the page's own address, and the download section of this language.
  out = out.replace(/("@type": "SoftwareApplication",[\s\S]*?"url": )"[^"]*"/, (m0, head) => `${head}${JSON.stringify(url)}`);
  out = out.replace(/("downloadUrl": )"[^"#]*(#[^"]*)?"/, (m0, head, hash) => `${head}${JSON.stringify(url + (hash ?? ''))}`);
  out = out.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`);
  out = out.replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`);
  out = out.replace(/(<meta property="og:locale" content=")[^"]*(")/, `$1${OG_LOCALES[lang]}$2`);

  // 3. The current flag.
  out = out.replace(/<a class="lang-switch__flag"[^>]*>/g, (tag) => {
    const flagLang = tag.match(/data-lang="(\w+)"/)?.[1];
    const clean = tag.replace(/\saria-current="true"/, '');
    return flagLang === lang ? clean.replace(/>$/, ' aria-current="true">') : clean;
  });

  // 4. Dates written out ("12 de novembro de 2026" → "12 November 2026"). Month names are written here,
  // not left to Intl, because the image's Node may carry only the English locale data.
  out = out.replace(/(<time class="js-date" datetime="(\d{4})-(\d{2})-(\d{2})">)[^<]*(<\/time>)/g, (m0, open, y, mo, d, close) => `${open}${longDate(lang, Number(y), Number(mo), Number(d))}${close}`);

  return { html: out, missing: [...missing] };
}

/** Links to files of the site that are relative (they would break from /en/). */
export function relativeLinks(html) {
  return [...html.matchAll(/\s(?:src|href|poster)="([^"]*)"/g)].map((m) => m[1]).filter((v) => v && !/^(https?:|mailto:|tel:|data:|#|\/|javascript:)/.test(v));
}

export async function buildLangs(siteDir, outDir = siteDir) {
  const report = [];
  for (const page of PAGES) {
    const html = await readFile(join(siteDir, page.file), 'utf8');
    const rel = relativeLinks(html);
    if (rel.length) throw new Error(`${page.file}: relative links break the language pages: ${rel.join(', ')}`);
    for (const lang of LANGS) {
      const texts = JSON.parse(await readFile(join(siteDir, 'i18n', `${lang}.json`), 'utf8'));
      const { html: out, missing } = translatePage(html, lang, texts, page.path);
      await mkdir(join(outDir, lang), { recursive: true });
      await writeFile(join(outDir, lang, page.file), out);
      report.push({ page: page.file, lang, missing });
    }
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [siteDir, outDir] = process.argv.slice(2);
  if (!siteDir) throw new Error('usage: node scripts/build-langs.mjs <site folder> [<output folder>]');
  const report = await buildLangs(siteDir, outDir ?? siteDir);
  for (const r of report) console.log(`${r.lang}/${r.page}${r.missing.length ? ` · not translated: ${r.missing.join(', ')}` : ''}`);
}
