export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function fmtOffset(ms: number): string {
  const sign = ms < 0 ? '−' : '+';
  const a = Math.abs(ms) / 1000;
  const h = Math.floor(a / 3600);
  const m = Math.floor((a % 3600) / 60);
  const s = a % 60;
  const ss = s.toFixed(1).padStart(4, '0').replace('.', ',');
  return h ? `${sign}${h} h ${String(m).padStart(2, '0')} min ${ss} s` : m ? `${sign}${m} min ${ss} s` : `${sign}${ss} s`;
}

export function fmtFps(f?: { num: number; den: number }): string {
  if (!f) return '—';
  const v = f.num / f.den;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',');
}
