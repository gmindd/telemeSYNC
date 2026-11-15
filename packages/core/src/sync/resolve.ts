import type { ClipMetadata } from '../media/types.ts';
import { tr, type Lang } from '../i18n/index.ts';
import { wallToUtc, utcToWall, formatDateTime } from '../util/timezone.ts';
import { parseFilenameTime } from './filename.ts';
import { sampleAt, type RideData } from '../telemetry/ride.ts';
import type { CameraProfile, ResolvedStart, ResolverId, TimestampCandidate } from './types.ts';

export interface ResolveContext {
  profile: CameraProfile;
  timeZone: string;
  /** Ride window, used by the timecode resolver to pick the date. */
  rideStartUtcMs?: number;
  /** Exact UTC start from GPMF GPSU, when extracted (phase 3). */
  gpmfStartUtcMs?: number;
  manualStartUtcMs?: number;
  /** Share (0–1) of a span of the ride spent moving: settles a creation_time that could be local time or UTC. */
  movingFraction?: (startUtcMs: number, durationMs: number) => number;
}

type Resolver = (meta: ClipMetadata, ctx: ResolveContext) => TimestampCandidate | TimestampCandidate[] | undefined;

/**
 * GoPro model from the firmware tag the camera writes (udta FIRM): "HD8.01…" → 8, "HD9…" → 9, "H21…" → 10,
 * "H22…" → 11, "H23…" → 12, "H24…" → 13. Undefined when the file has no such tag (e.g. re-encoded by an editor).
 */
export function goproModel(meta: ClipMetadata): number | undefined {
  const m = /^H(D)?(\d+)\./i.exec(meta.tags.FIRM ?? '');
  if (!m) return undefined;
  const n = Number(m[2]);
  return m[1] ? n : n >= 19 ? n - 11 : undefined;
}

/**
 * How a camera that writes local time wrote this file's creation_time. GoPros up to the HERO10 write local time,
 * the HERO11 and later write UTC (exiftool forum, 2024). Undefined = can't tell (GoPro file without its model).
 */
function localClockOf(meta: ClipMetadata, profile: CameraProfile): 'utc' | 'local' | undefined {
  if (profile.id !== 'gopro') return 'local';
  const model = goproModel(meta);
  return model === undefined ? undefined : model >= 11 ? 'utc' : 'local';
}

/** Share of the clip's span the ride is moving (above 5.4 km/h), sampled about every second. */
export function movingFraction(ride: RideData, startUtcMs: number, durationMs: number): number {
  const step = Math.max(1000, durationMs / 120);
  let n = 0;
  let moving = 0;
  for (let t = startUtcMs; t <= startUtcMs + Math.max(durationMs, 0); t += step) {
    const s = sampleAt(ride, t);
    n++;
    if (!s.outside && !s.inGap && s.speed > 1.5) moving++;
  }
  return n ? moving / n : 0;
}

const RESOLVERS: Record<ResolverId, Resolver> = {
  manual: (_m, ctx) =>
    ctx.manualStartUtcMs !== undefined
      ? { resolver: 'manual', startUtcMs: ctx.manualStartUtcMs }
      : undefined,

  // GoPro GPS time (media/gpmf.ts): true UTC, whatever the camera's clock and time zone say.
  gpmf: (m, ctx) => {
    const t = m.gpmfStartUtcMs ?? ctx.gpmfStartUtcMs;
    return m.hasGpmf && t !== undefined ? { resolver: 'gpmf', startUtcMs: t } : undefined;
  },

  creationTime: (m, ctx) => {
    const raw = m.creationTimeRawMs;
    if (raw === undefined || raw <= Date.UTC(2000, 0, 1)) return undefined;
    const { marks } = ctx.profile.creationTime;
    const at = (clock: 'utc' | 'local'): TimestampCandidate => {
      let t = clock === 'local' ? wallToUtc(raw, ctx.timeZone) : raw;
      if (marks === 'end') t -= m.durationMs;
      return { resolver: 'creationTime', startUtcMs: t, clock, marks };
    };
    if (ctx.profile.creationTime.clock === 'utc') return at('utc');
    const clock = localClockOf(m, ctx.profile);
    if (clock) return at(clock);
    // Can't tell: both readings, the one with the ride moving first (a clip is filmed riding, not stopped).
    const local = at('local');
    const utc = at('utc');
    if (local.startUtcMs === utc.startUtcMs) return local;
    if (!ctx.movingFraction) return [local, utc];
    const fl = ctx.movingFraction(local.startUtcMs, m.durationMs);
    const fu = ctx.movingFraction(utc.startUtcMs, m.durationMs);
    return fu > fl + 0.25 ? [utc, local] : [local, utc];
  },

  filename: (m, ctx) => {
    const f = parseFilenameTime(m.fileName);
    if (!f) return undefined;
    return { resolver: 'filename', startUtcMs: wallToUtc(f.wallMs, ctx.timeZone) };
  },

  // Start timecode = local time of day. Date taken from creation_time, or from the ride.
  timecode: (m, ctx) => {
    if (m.timecodeStartSec === undefined) return undefined;
    const ref = m.creationTimeRawMs ?? (ctx.rideStartUtcMs !== undefined ? utcToWall(ctx.rideStartUtcMs, ctx.timeZone) : undefined);
    if (ref === undefined) return undefined;
    const day = Math.floor(ref / 86_400_000) * 86_400_000;
    let wall = day + m.timecodeStartSec * 1000;
    // Pick the day closest to the reference (recording that crosses midnight).
    if (wall - ref > 12 * 3600_000) wall -= 86_400_000;
    if (ref - wall > 12 * 3600_000) wall += 86_400_000;
    return { resolver: 'timecode', startUtcMs: wallToUtc(wall, ctx.timeZone) };
  },
};

/** Runs every resolver of the profile; the first in profile order with a value is used. */
export function resolveStart(meta: ClipMetadata, ctx: ResolveContext): ResolvedStart {
  const candidates: TimestampCandidate[] = [];
  for (const id of ctx.profile.resolvers) {
    const c = RESOLVERS[id](meta, ctx);
    if (c) candidates.push(...(Array.isArray(c) ? c : [c]));
  }
  const best = candidates[0];
  return { startUtcMs: best?.startUtcMs, source: best?.resolver, candidates };
}

/** Where a candidate start comes from, in `lang`. */
export function candidateLabel(c: TimestampCandidate, lang: Lang | undefined): string {
  if (c.resolver === 'creationTime') {
    const how = `${c.clock === 'local' ? tr(lang, 'cand.localTime') : 'UTC'}${c.marks === 'end' ? tr(lang, 'cand.endOfRecording') : ''}`;
    return tr(lang, 'cand.creationTime', { how });
  }
  return tr(lang, `cand.${c.resolver}`);
}

export function describeCandidate(c: TimestampCandidate, tz: string, lang?: Lang): string {
  return `${candidateLabel(c, lang)}: ${formatDateTime(c.startUtcMs, tz)}`;
}
