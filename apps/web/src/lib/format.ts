export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/** Offsets are formatted the same way in the app and in the sync report. */
export { formatOffset as fmtOffset } from '@telemesync/core';

export function fmtFps(f?: { num: number; den: number }): string {
  if (!f) return '—';
  const v = f.num / f.den;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',');
}
