import { tr, type Lang } from '../i18n/index.ts';
import type { OverlayId } from '../overlays/types.ts';
import { overlayFileSlug } from '../overlays/registry.ts';
import { outputExtension, type OutputFormat } from './formats.ts';

/** Windows-safe file/folder name. */
export function safeName(s: string, lang?: Lang): string {
  const cleaned = s
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();
  return cleaned.slice(0, 120) || tr(lang, 'file.unnamed');
}

export function clipBaseName(fileName: string, lang?: Lang): string {
  return safeName(fileName.replace(/\.[^.]+$/, ''), lang);
}

/** Exported file of one clip: `{clip}_{gadget}.mov`, or `{clip}_composite.mov` (a folder for PNG). */
export function outputFileName(clipBase: string, overlay: OverlayId | 'composite', format: OutputFormat, lang: Lang): string {
  const name = `${clipBase}_${overlay === 'composite' ? tr(lang, 'file.composite') : overlayFileSlug(overlay, lang)}`;
  return `${name}${outputExtension(format)}`;
}
