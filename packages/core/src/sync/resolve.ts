import type { ClipMetadata } from '../media/types.ts';
import { wallToUtc, utcToWall, formatDateTime } from '../util/timezone.ts';
import { parseFilenameTime } from './filename.ts';
import type { CameraProfile, ResolvedStart, ResolverId, TimestampCandidate } from './types.ts';

export interface ResolveContext {
  profile: CameraProfile;
  timeZone: string;
  /** Ride window, used by the timecode resolver to pick the date. */
  rideStartUtcMs?: number;
  /** Exact UTC start from GPMF GPSU, when extracted (phase 3). */
  gpmfStartUtcMs?: number;
  manualStartUtcMs?: number;
}

type Resolver = (meta: ClipMetadata, ctx: ResolveContext) => TimestampCandidate | undefined;

const RESOLVERS: Record<ResolverId, Resolver> = {
  manual: (_m, ctx) =>
    ctx.manualStartUtcMs !== undefined
      ? { resolver: 'manual', startUtcMs: ctx.manualStartUtcMs, description: 'Hora indicada manualmente' }
      : undefined,

  // Phase 3: GPMF GPSU gives true UTC. The extractor is not implemented yet; the resolver slot is ready.
  gpmf: (m, ctx) =>
    m.hasGpmf && ctx.gpmfStartUtcMs !== undefined
      ? { resolver: 'gpmf', startUtcMs: ctx.gpmfStartUtcMs, description: 'GPS da GoPro (GPMF)' }
      : undefined,

  creationTime: (m, ctx) => {
    const raw = m.creationTimeRawMs;
    if (raw === undefined || raw <= Date.UTC(2000, 0, 1)) return undefined;
    const { clock, marks } = ctx.profile.creationTime;
    let t = clock === 'local' ? wallToUtc(raw, ctx.timeZone) : raw;
    if (marks === 'end') t -= m.durationMs;
    const how = `${clock === 'local' ? 'hora local' : 'UTC'}${marks === 'end' ? ', fim da gravação' : ''}`;
    return { resolver: 'creationTime', startUtcMs: t, description: `creation_time do ficheiro (${how})` };
  },

  filename: (m, ctx) => {
    const f = parseFilenameTime(m.fileName);
    if (!f) return undefined;
    return { resolver: 'filename', startUtcMs: wallToUtc(f.wallMs, ctx.timeZone), description: 'Data/hora no nome do ficheiro' };
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
    return { resolver: 'timecode', startUtcMs: wallToUtc(wall, ctx.timeZone), description: 'Timecode da câmara (hora local)' };
  },
};

/** Runs every resolver of the profile; the first in profile order with a value is used. */
export function resolveStart(meta: ClipMetadata, ctx: ResolveContext): ResolvedStart {
  const candidates: TimestampCandidate[] = [];
  for (const id of ctx.profile.resolvers) {
    const c = RESOLVERS[id](meta, ctx);
    if (c) candidates.push(c);
  }
  const best = candidates[0];
  return { startUtcMs: best?.startUtcMs, source: best?.resolver, candidates };
}

export function describeCandidate(c: TimestampCandidate, tz: string): string {
  return `${c.description}: ${formatDateTime(c.startUtcMs, tz)}`;
}
