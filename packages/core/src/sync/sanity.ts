import type { ClipMetadata } from '../media/types.ts';
import { tr, type Lang } from '../i18n/index.ts';
import { formatDateTime } from '../util/timezone.ts';
import { candidateLabel } from './resolve.ts';
import type { CameraProfile, ResolvedStart, SyncWarning } from './types.ts';

export interface SanityInput {
  meta: ClipMetadata;
  profile: CameraProfile;
  resolved: ResolvedStart;
  /** Effective start after offsets. */
  startUtcMs?: number;
  rideStartUtcMs: number;
  rideEndUtcMs: number;
  timeZone: string;
  /** Language of the warning texts. */
  lang?: Lang;
}

const HOUR = 3600_000;

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

export function sanityChecks(i: SanityInput): SyncWarning[] {
  const w: SyncWarning[] = [];
  const lang = i.lang;
  if (i.startUtcMs === undefined) {
    w.push({ code: 'noTimestamp', message: tr(lang, 'warn.noTimestamp') });
    return w;
  }
  const s = i.startUtcMs;
  const e = s + i.meta.durationMs;
  const ov = overlap(s, e, i.rideStartUtcMs, i.rideEndUtcMs);
  if (ov === 0) {
    w.push({ code: 'outsideRide', message: tr(lang, 'warn.outsideRide', { date: formatDateTime(s, i.timeZone) }) });
    // Exact 1 h / 2 h shift that puts the clip inside the ride → probably a time zone mistake.
    for (const k of [-1, 1, -2, 2]) {
      const shift = k * HOUR;
      if (overlap(s + shift, e + shift, i.rideStartUtcMs, i.rideEndUtcMs) > 0) {
        w.push({
          code: 'timezoneSuspect',
          message: tr(lang, 'warn.timezoneSuspect', { h: Math.abs(k), sign: k > 0 ? '+' : '−' }),
          suggestedOffsetMs: shift,
        });
        break;
      }
    }
  } else if (ov < i.meta.durationMs - 1000) {
    w.push({ code: 'partiallyOutside', message: tr(lang, 'warn.partiallyOutside') });
  }

  // Insta360 Studio export: creation_time is the export date, well after the ride.
  const ct = i.resolved.candidates.find((c) => c.resolver === 'creationTime');
  if (ct && ct.startUtcMs > i.rideEndUtcMs + 2 * HOUR && (i.profile.id === 'insta360' || /\.mp4$/i.test(i.meta.fileName))) {
    w.push({
      code: 'exportedSuspect',
      message: tr(lang, 'warn.exportedSuspect'),
    });
  }

  const c = i.resolved.candidates;
  if (c.length >= 2) {
    const spread = Math.max(...c.map((x) => x.startUtcMs)) - Math.min(...c.map((x) => x.startUtcMs));
    if (spread > 5000 && !w.some((x) => x.code === 'exportedSuspect')) {
      w.push({ code: 'resolversDisagree', message: tr(lang, 'warn.resolversDisagree', { s: Math.round(spread / 1000), source: candidateLabel(c[0], lang) }) });
    }
  }
  return w;
}
