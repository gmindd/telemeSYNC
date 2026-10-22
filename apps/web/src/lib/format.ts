import { decimalSeparator, formatNumber, formatOffset, type Lang } from '@telemesync/core';

export function fmtBytes(n: number, lang: Lang): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${formatNumber(n / 1024 ** 2, 1, lang)} MB`;
  return `${formatNumber(n / 1024 ** 3, 2, lang)} GB`;
}

/** Offsets are formatted the same way in the app and in the sync report. */
export function fmtOffset(ms: number, lang: Lang): string {
  return formatOffset(ms, lang);
}

export function fmtFps(f: { num: number; den: number } | undefined, lang: Lang): string {
  if (!f) return '—';
  const v = f.num / f.den;
  return Number.isInteger(v) ? String(v) : formatNumber(v, 2, lang);
}

/** Number typed with a comma or a point (and a typographic minus) → number; undefined when not a number. */
export function parseDecimal(text: string): number | undefined {
  const v = Number(text.trim().replace('−', '-').replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(v) ? v : undefined;
}

/** "0,1" or "0.1" in labels. */
export function dec(v: number, decimals: number, lang: Lang): string {
  return formatNumber(v, decimals, lang);
}

export { decimalSeparator };
