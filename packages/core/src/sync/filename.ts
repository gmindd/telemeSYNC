/** A wall-clock date-time parsed from a file name, as "ms as if UTC" (no zone applied). */
export interface FilenameTime {
  wallMs: number;
  pattern: 'dji' | 'insta360' | 'generic';
}

function wall(y: string, mo: string, d: string, h: string, mi: string, s: string): number | undefined {
  const Y = +y;
  const M = +mo;
  const D = +d;
  const H = +h;
  const MI = +mi;
  const S = +s;
  if (Y < 2000 || Y > 2100 || M < 1 || M > 12 || D < 1 || D > 31 || H > 23 || MI > 59 || S > 59) return undefined;
  return Date.UTC(Y, M - 1, D, H, MI, S);
}

const PATTERNS: { re: RegExp; pattern: FilenameTime['pattern'] }[] = [
  // DJI Osmo Action 3/4/5: DJI_20240615093005_0001_D.MP4
  { re: /DJI_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/i, pattern: 'dji' },
  // Insta360: VID_20240615_093005_00_001.insv, LRV_…, PRO_VID_…
  { re: /(?:VID|LRV|IMG)_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/i, pattern: 'insta360' },
  // Generic: 2024-06-15 09.30.05, 20240615_093005, 2024_06_15_09_30_05 …
  { re: /(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})[-_ T]?(\d{2})[-_.h:]?(\d{2})[-_.m:]?(\d{2})/i, pattern: 'generic' },
];

export function parseFilenameTime(fileName: string): FilenameTime | undefined {
  for (const { re, pattern } of PATTERNS) {
    const m = re.exec(fileName);
    if (!m) continue;
    const w = wall(m[1], m[2], m[3], m[4], m[5], m[6]);
    if (w !== undefined) return { wallMs: w, pattern };
  }
  return undefined;
}
