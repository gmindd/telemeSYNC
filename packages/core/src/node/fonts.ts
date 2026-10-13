import { GlobalFonts } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { EMBEDDED_FONT_FAMILY, EMBEDDED_FONT_WEIGHTS, embeddedFontFile } from '../overlays/fonts.ts';

export const FONTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'fonts', 'inter');

let registered = false;

/** Registers the embedded Inter weights with @napi-rs/canvas (idempotent). */
export function registerEmbeddedFonts(): void {
  if (registered) return;
  for (const w of EMBEDDED_FONT_WEIGHTS) {
    GlobalFonts.registerFromPath(join(FONTS_DIR, embeddedFontFile(w)), EMBEDDED_FONT_FAMILY);
  }
  registered = true;
}
