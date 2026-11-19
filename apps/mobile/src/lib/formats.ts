// Output formats: the clip's own shape or a crop for a social network. Crop rectangles are in the clip's displayed
// pixels (rotation already applied), the way Mediabunny crops.

export type FormatId = 'original' | '9:16' | '4:5' | '1:1' | '16:9';
export const FORMATS: FormatId[] = ['original', '9:16', '4:5', '1:1', '16:9'];

const RATIOS: Record<Exclude<FormatId, 'original'>, number> = { '9:16': 9 / 16, '4:5': 4 / 5, '1:1': 1, '16:9': 16 / 9 };

export interface Crop {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Width / height of the exported video. */
export function formatAspect(format: FormatId, srcW: number, srcH: number): number {
  return format === 'original' ? srcW / srcH : RATIOS[format];
}

/** Part of the clip kept for the format; `pos` (0–1) slides it across the side that is cut. */
export function cropFor(format: FormatId, srcW: number, srcH: number, pos: number): Crop {
  const even = (v: number) => Math.max(2, Math.floor(v / 2) * 2);
  const aspect = formatAspect(format, srcW, srcH);
  const src = srcW / srcH;
  if (format === 'original' || Math.abs(aspect - src) < 0.005) return { left: 0, top: 0, width: srcW, height: srcH };
  if (aspect < src) {
    const width = even(srcH * aspect);
    return { left: Math.round((srcW - width) * pos), top: 0, width, height: srcH };
  }
  const height = even(srcW / aspect);
  return { left: 0, top: Math.round((srcH - height) * pos), width: srcW, height };
}

/** The format crops the clip (the framing slider has something to move). */
export function cropsSideways(format: FormatId, srcW: number, srcH: number): 'x' | 'y' | null {
  const c = cropFor(format, srcW, srcH, 0.5);
  return c.width < srcW ? 'x' : c.height < srcH ? 'y' : null;
}

/** Social media safe zones are measured on 9:16 frames. */
export const isVertical = (aspect: number) => Math.abs(aspect - 9 / 16) < 0.02;

/** Framing keyframe: at `t` (seconds from the clip's start) the crop is at `pos` (0–1, as cropFor). */
export interface CropKey {
  t: number;
  pos: number;
}

/**
 * Framing at a moment: `pos` without keyframes; with them, held before the first and after the last, and sliding
 * from one to the next in between, easing in and out (like a camera operator panning).
 */
export function posAt(keys: CropKey[], pos: number, sec: number): number {
  if (!keys.length) return pos;
  if (sec <= keys[0].t) return keys[0].pos;
  const last = keys[keys.length - 1];
  if (sec >= last.t) return last.pos;
  let i = 0;
  while (keys[i + 1].t < sec) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const f = b.t > a.t ? (sec - a.t) / (b.t - a.t) : 1;
  const ease = (1 - Math.cos(Math.PI * f)) / 2;
  return a.pos + (b.pos - a.pos) * ease;
}

/** The framing moves during the clip (two keyframes or more with different places). */
export function framingMoves(keys: CropKey[]): boolean {
  return keys.some((k) => Math.abs(k.pos - keys[0].pos) > 1e-4);
}
