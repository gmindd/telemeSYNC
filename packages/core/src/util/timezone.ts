export const DEFAULT_TIME_ZONE = 'Europe/Lisbon';

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    dtfCache.set(tz, f);
  }
  return f;
}

export interface WallTime {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  ms: number;
}

/** Wall-clock time in `tz` for a UTC instant. */
export function toWallTime(utcMs: number, tz = DEFAULT_TIME_ZONE): WallTime {
  const parts = dtf(tz).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
    ms: ((utcMs % 1000) + 1000) % 1000,
  };
}

/** Offset of `tz` from UTC at a given UTC instant (ms, positive east). */
export function tzOffsetMs(utcMs: number, tz = DEFAULT_TIME_ZONE): number {
  const w = toWallTime(Math.floor(utcMs / 1000) * 1000, tz);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * Converts a wall-clock time in `tz` (expressed as "ms as if UTC") to the real UTC instant.
 * Handles DST: for the ambiguous autumn hour the first occurrence is used.
 */
export function wallToUtc(wallAsUtcMs: number, tz = DEFAULT_TIME_ZONE): number {
  const offsets = new Set([tzOffsetMs(wallAsUtcMs - 12 * 3600_000, tz), tzOffsetMs(wallAsUtcMs + 12 * 3600_000, tz)]);
  const valid = [...offsets].map((o) => wallAsUtcMs - o).filter((c) => c + tzOffsetMs(c, tz) === wallAsUtcMs);
  if (valid.length) return Math.min(...valid);
  // Non-existent wall time (spring-forward gap): use the offset in force before the change.
  return wallAsUtcMs - tzOffsetMs(wallAsUtcMs - 12 * 3600_000, tz);
}

/** Inverse of wallToUtc: UTC instant → wall clock in tz, as "ms as if UTC". */
export function utcToWall(utcMs: number, tz = DEFAULT_TIME_ZONE): number {
  return utcMs + tzOffsetMs(utcMs, tz);
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function formatTime(utcMs: number, tz = DEFAULT_TIME_ZONE, seconds = true): string {
  const w = toWallTime(utcMs, tz);
  return seconds ? `${pad(w.hour)}:${pad(w.minute)}:${pad(w.second)}` : `${pad(w.hour)}:${pad(w.minute)}`;
}

export function formatDateTime(utcMs: number, tz = DEFAULT_TIME_ZONE): string {
  const w = toWallTime(utcMs, tz);
  return `${pad(w.day)}/${pad(w.month)}/${w.year} ${pad(w.hour)}:${pad(w.minute)}:${pad(w.second)}`;
}

export function formatDuration(ms: number, withSeconds = true): string {
  const neg = ms < 0;
  const total = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return (neg ? '-' : '') + (withSeconds ? `${h}:${pad(m)}:${pad(s)}` : `${h}:${pad(m)}`);
}
