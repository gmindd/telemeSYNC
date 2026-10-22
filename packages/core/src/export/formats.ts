import { tr, type Lang } from '../i18n/index.ts';
import type { Fps } from '../media/types.ts';

/** Video codecs with alpha that the exporter can write. */
export type VideoFormat = 'animation' | 'prores' | 'ffv1' | 'webm';
export type OutputFormat = VideoFormat | 'png';

export interface OutputFormatInfo {
  id: OutputFormat;
  /** English label (the app shows formatLabel()). */
  label: string;
  /** File extension ('' = folder of PNG images). */
  ext: string;
  /** Which editors read it with transparency, size compared with ProRes. */
  hint: string;
}

/**
 * Sizes measured on a real ride (21 min, 1080p composite at 30 fps): ProRes 4444 ≈ 19 GB,
 * FFV1 ≈ 6.4 GB, QuickTime Animation ≈ 1.8 GB, WebM VP9 ≈ 0.1 GB.
 * Editor support from Blackmagic's Resolve 21.1 codec list (alpha: ProRes 4444, FFV1; not Animation/PNG in MOV)
 * and tests in Premiere Pro (Animation, ProRes, PNG in MOV all keep alpha).
 */
export const OUTPUT_FORMATS: OutputFormatInfo[] = [
  {
    id: 'animation',
    label: '',
    ext: '.mov',
    hint: '',
  },
  {
    id: 'prores',
    label: '',
    ext: '.mov',
    hint: '',
  },
  {
    id: 'ffv1',
    label: '',
    ext: '.mkv',
    hint: '',
  },
  {
    id: 'webm',
    label: '',
    ext: '.webm',
    hint: '',
  },
  {
    id: 'png',
    label: '',
    ext: '',
    hint: '',
  },
];

for (const f of OUTPUT_FORMATS) {
  f.label = tr('en', `format.${f.id}`);
  f.hint = tr('en', `format.${f.id}.hint`);
}

export function formatLabel(id: OutputFormat, lang: Lang | undefined): string {
  return tr(lang, `format.${id}`);
}

export function formatHint(id: OutputFormat, lang: Lang | undefined): string {
  return tr(lang, `format.${id}.hint`);
}

export const DEFAULT_OUTPUT_FORMAT: OutputFormat = 'animation';

export function isOutputFormat(v: unknown): v is OutputFormat {
  return OUTPUT_FORMATS.some((f) => f.id === v);
}

export function outputExtension(format: OutputFormat): string {
  return OUTPUT_FORMATS.find((f) => f.id === format)?.ext ?? '.mov';
}

/**
 * Overlay frame rate when capped to `maxFps` (0 = same as the clip). Divides the clip rate by a whole
 * number (59.94 → 29.97, 50 → 25, 120 → 30) so overlay frames stay aligned with clip frames.
 */
export function cappedFps(fps: Fps, frames: number | undefined, maxFps: number): { fps: Fps; frames?: number } {
  const rate = fps.num / fps.den;
  if (!(maxFps > 0) || rate <= maxFps + 0.5) return { fps, frames };
  const k = Math.ceil(rate / (maxFps + 0.5));
  return { fps: { num: fps.num, den: fps.den * k }, frames: frames ? Math.ceil(frames / k) : undefined };
}
