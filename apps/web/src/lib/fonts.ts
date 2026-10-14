import { clearTextMetricsCache, EMBEDDED_FONT_FAMILY } from '@telemesync/core';
import w400 from '@telemesync/core/assets/fonts/inter/Inter-400.woff2?url';
import w600 from '@telemesync/core/assets/fonts/inter/Inter-600.woff2?url';
import w700 from '@telemesync/core/assets/fonts/inter/Inter-700.woff2?url';
import w800 from '@telemesync/core/assets/fonts/inter/Inter-800.woff2?url';

/** Loads the same embedded font files the exporter uses, so preview and export match. */
export async function loadEmbeddedFonts(): Promise<void> {
  const faces = [
    [w400, '400'],
    [w600, '600'],
    [w700, '700'],
    [w800, '800'],
  ].map(([url, weight]) => new FontFace(EMBEDDED_FONT_FAMILY, `url(${url})`, { weight }));
  await Promise.all(
    faces.map(async (f) => {
      await f.load();
      document.fonts.add(f);
    }),
  );
  clearTextMetricsCache();
}
