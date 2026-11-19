import type { ClipMetadata } from '../media/types.ts';
import { DEFAULT_TIME_ZONE } from '../util/timezone.ts';
import { chainChapters } from './chapters.ts';
import type { Lang } from '../i18n/index.ts';
import type { RideData } from '../telemetry/ride.ts';
import { CAMERA_PROFILES, detectProfile, profileLabel } from './profiles.ts';
import { movingFraction, resolveStart } from './resolve.ts';
import { sanityChecks } from './sanity.ts';
import type { Camera, CameraProfileId, Clip, SyncWarning } from './types.ts';

/** Sync state of a whole project: cameras with a global offset each, and clips. */
export interface SyncState {
  cameras: Camera[];
  clips: Clip[];
}

export function defaultCamera(profile: CameraProfileId, timeZone = DEFAULT_TIME_ZONE, lang?: Lang): Camera {
  const p = CAMERA_PROFILES[profile];
  return { id: profile, profile, label: profileLabel(profile, lang), color: p.color, offsetMs: 0, timeZone };
}

let idCounter = 0;
export function clipIdFor(meta: ClipMetadata): string {
  return `${meta.fileName}#${meta.sizeBytes}#${++idCounter}`;
}

/**
 * Re-runs resolvers and chapter chaining for every clip (call after adding clips or changing a camera/profile).
 * With the ride, a creation_time that could be local time or UTC is read the way the ride is moving in the clip.
 */
export function resolveAll(state: SyncState, rideStartUtcMs?: number, ride?: RideData): SyncState {
  const camById = new Map(state.cameras.map((c) => [c.id, c]));
  const moving = ride ? (start: number, duration: number) => movingFraction(ride, start, duration) : undefined;
  const clips = state.clips.map((clip) => {
    const cam = camById.get(clip.cameraId)!;
    const resolved = resolveStart(clip.meta, {
      profile: CAMERA_PROFILES[cam.profile],
      timeZone: cam.timeZone,
      rideStartUtcMs,
      manualStartUtcMs: clip.manualStartUtcMs,
      movingFraction: moving,
    });
    return { ...clip, resolved };
  });
  const chain = chainChapters(
    clips
      .filter((c) => camById.get(c.cameraId)?.profile === 'gopro')
      .map((c) => ({ id: c.id, fileName: c.meta.fileName, durationMs: c.meta.durationMs, startUtcMs: c.resolved.startUtcMs })),
  );
  return {
    cameras: state.cameras,
    clips: clips.map((c) => {
      const ch = chain.get(c.id);
      return ch
        ? { ...c, chapter: { group: ch.group, index: ch.index }, chapterStartUtcMs: c.manualStartUtcMs === undefined ? ch.derivedStartUtcMs : undefined }
        : { ...c, chapter: undefined, chapterStartUtcMs: undefined };
    }),
  };
}

/** Adds clips, detecting the camera profile and creating cameras as needed. */
export function addClips(state: SyncState, metas: ClipMetadata[], rideStartUtcMs?: number, timeZone = DEFAULT_TIME_ZONE, lang?: Lang, ride?: RideData): SyncState {
  const cameras = [...state.cameras];
  const clips = [...state.clips];
  for (const meta of metas) {
    const profile = detectProfile(meta);
    let cam = cameras.find((c) => c.profile === profile);
    if (!cam) {
      cam = defaultCamera(profile, timeZone, lang);
      cameras.push(cam);
    }
    clips.push({ id: clipIdFor(meta), meta, cameraId: cam.id, resolved: { candidates: [] }, clipOffsetMs: 0 });
  }
  return resolveAll({ cameras, clips }, rideStartUtcMs, ride);
}

/** Start before offsets. */
/** Size of a clip as shown and exported: a camera turned 90° or 270° swaps its width and height. */
export function shownSize(clip: Pick<Clip, 'meta'>, camera?: Pick<Camera, 'videoRotation'>): { width?: number; height?: number } {
  const quarter = camera?.videoRotation === 90 || camera?.videoRotation === 270;
  return quarter ? { width: clip.meta.height, height: clip.meta.width } : { width: clip.meta.width, height: clip.meta.height };
}

export function baseStart(clip: Clip): number | undefined {
  if (clip.manualStartUtcMs !== undefined) return clip.manualStartUtcMs;
  return clip.chapterStartUtcMs ?? clip.resolved.startUtcMs;
}

/** Effective start of a clip: base + camera offset + clip offset. */
export function effectiveStart(clip: Clip, camera: Camera): number | undefined {
  const b = baseStart(clip);
  return b === undefined ? undefined : b + camera.offsetMs + clip.clipOffsetMs;
}

export function clipWarnings(clip: Clip, camera: Camera, rideStartUtcMs: number, rideEndUtcMs: number, lang?: Lang): SyncWarning[] {
  return sanityChecks({
    meta: clip.meta,
    profile: CAMERA_PROFILES[camera.profile],
    resolved: clip.resolved,
    startUtcMs: effectiveStart(clip, camera),
    rideStartUtcMs,
    rideEndUtcMs,
    timeZone: camera.timeZone,
    lang,
  });
}
