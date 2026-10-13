/**
 * GoPro chapters: a long recording is split into GX01xxxx, GX02xxxx, … (same 4-digit video number).
 * Older models: GOPRxxxx (chapter 1), GP01xxxx, GP02xxxx, …
 */
export interface ChapterInfo {
  /** Group key: same recording. */
  group: string;
  /** 1-based chapter index. */
  index: number;
}

export function parseGoProChapter(fileName: string): ChapterInfo | undefined {
  const base = fileName.replace(/\.[^.]+$/, '');
  let m = /^G([HXLS])(\d{2})(\d{4})$/i.exec(base);
  if (m) return { group: `G${m[1].toUpperCase()}${m[3]}`, index: Number(m[2]) };
  m = /^GOPR(\d{4})$/i.exec(base);
  if (m) return { group: `GOPR${m[1]}`, index: 1 };
  m = /^GP(\d{2})(\d{4})$/i.exec(base);
  if (m) return { group: `GOPR${m[2]}`, index: Number(m[1]) + 1 };
  return undefined;
}

export interface ChapterClip {
  id: string;
  fileName: string;
  durationMs: number;
  /** Resolved start of this file on its own (may be missing or unreliable for chapters > 1). */
  startUtcMs?: number;
}

/**
 * Groups chapters and returns, for every chapter after the first, the start derived from the
 * previous chapter (start + duration), so the recording is continuous.
 */
export function chainChapters(clips: ChapterClip[]): Map<string, { group: string; index: number; derivedStartUtcMs?: number }> {
  const out = new Map<string, { group: string; index: number; derivedStartUtcMs?: number }>();
  const groups = new Map<string, { clip: ChapterClip; info: ChapterInfo }[]>();
  for (const c of clips) {
    const info = parseGoProChapter(c.fileName);
    if (!info) continue;
    const arr = groups.get(info.group) ?? [];
    arr.push({ clip: c, info });
    groups.set(info.group, arr);
  }
  for (const [group, arr] of groups) {
    arr.sort((a, b) => a.info.index - b.info.index);
    let prevEnd: number | undefined;
    let prevIndex: number | undefined;
    for (const { clip, info } of arr) {
      const contiguous = prevIndex !== undefined && info.index === prevIndex + 1;
      const derived = contiguous && prevEnd !== undefined ? prevEnd : undefined;
      out.set(clip.id, { group, index: info.index, derivedStartUtcMs: derived });
      const start = derived ?? clip.startUtcMs;
      prevEnd = start !== undefined ? start + clip.durationMs : undefined;
      prevIndex = info.index;
    }
  }
  return out;
}
