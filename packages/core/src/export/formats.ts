import type { Fps } from '../media/types.ts';

/** Video codecs with alpha that the exporter can write. */
export type VideoFormat = 'animation' | 'prores' | 'ffv1' | 'webm';
export type OutputFormat = VideoFormat | 'png';

export interface OutputFormatInfo {
  id: OutputFormat;
  /** Portuguese label for the UI. */
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
    label: 'QuickTime Animation (.mov): o mais leve sem perdas',
    ext: '.mov',
    hint: 'Cerca de 10× mais pequeno do que ProRes. Transparência no Premiere Pro e no Final Cut Pro.',
  },
  {
    id: 'prores',
    label: 'ProRes 4444 (.mov): o mais compatível',
    ext: '.mov',
    hint: 'Transparência no DaVinci Resolve, Premiere Pro, Final Cut Pro e CapCut (PC). Ficheiros muito grandes.',
  },
  {
    id: 'ffv1',
    label: 'FFV1 (.mkv): para DaVinci Resolve',
    ext: '.mkv',
    hint: 'Sem perdas, cerca de 3× mais pequeno do que ProRes. Transparência no DaVinci Resolve; não abre no Premiere Pro.',
  },
  {
    id: 'webm',
    label: 'WebM VP9 (.webm): muito leve, experimental',
    ext: '.webm',
    hint: 'Centenas de vezes mais pequeno, com ligeira perda. Para editores web e CapCut; sem transparência no Premiere Pro e no DaVinci Resolve.',
  },
  {
    id: 'png',
    label: 'Sequência PNG',
    ext: '',
    hint: 'Uma pasta de imagens por gadget. Funciona em quase todos os editores, mas ocupa muito espaço.',
  },
];

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
