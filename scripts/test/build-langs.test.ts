import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JavaScript module run when the site image is built
import { buildLangs, LANGS, pageUrl, PAGES, relativeLinks } from '../build-langs.mjs';

const SITE = join(__dirname, '../../site');
const out = mkdtempSync(join(tmpdir(), 'langs-'));
const report: { page: string; lang: string; missing: string[] }[] = await buildLangs(SITE, out);

const downloads = (html: string) => [...html.matchAll(/href="(https:\/\/github\.com\/[^"]+\.zip)"/g)].map((m) => m[1]);

describe('site in every language', () => {
  it('translates every marked text of every page', () => {
    expect(report).toHaveLength(PAGES.length * LANGS.length);
    for (const r of report) expect(r.missing, `${r.lang}/${r.page}`).toEqual([]);
  });

  for (const page of PAGES as { file: string; path: string }[]) {
    const pt = readFileSync(join(SITE, page.file), 'utf8');
    it(`${page.file}: the Portuguese page links every language and has no relative links`, () => {
      expect(relativeLinks(pt)).toEqual([]);
      for (const lang of ['pt', ...LANGS]) expect(pt).toContain(`<link rel="alternate" hreflang="${lang}" href="${pageUrl(page.path, lang)}">`);
      expect(pt).toContain('hreflang="x-default"');
    });
    for (const lang of LANGS as string[]) {
      it(`${lang}/${page.file}: language, addresses, flag, dates and download links`, () => {
        const html = readFileSync(join(out, lang, page.file), 'utf8');
        expect(html).toMatch(new RegExp(`<html[^>]* lang="${lang}"`));
        expect(html).toContain(`<link rel="canonical" href="${pageUrl(page.path, lang)}">`);
        expect(html).toContain(`<meta property="og:url" content="${pageUrl(page.path, lang)}">`);
        expect(html.match(/<title>(.*?)<\/title>/)![1]).not.toBe(pt.match(/<title>(.*?)<\/title>/)![1]);
        // Same alternates as the Portuguese page.
        expect(html.match(/<link rel="alternate"[^>]*>/g)).toEqual(pt.match(/<link rel="alternate"[^>]*>/g));
        // Only this language's flag is the current one.
        const current = [...html.matchAll(/<a class="lang-switch__flag"[^>]*aria-current="true"[^>]*>/g)].map((m) => m[0].match(/data-lang="(\w+)"/)![1]);
        expect(current).toEqual([lang]);
        expect(relativeLinks(html)).toEqual([]);
        expect(html).not.toMatch(/de (outubro|novembro|dezembro) de 20/);
        expect(downloads(html)).toEqual(downloads(pt));
        const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
        if (ld) {
          const data = JSON.parse(ld[1]);
          expect(data.url).toBe(pageUrl(page.path, lang));
          expect(data.downloadUrl.startsWith(pageUrl(page.path, lang))).toBe(true);
        }
      });
    }
  }
});
