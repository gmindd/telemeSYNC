import type { ClipMetadata } from '../media/types.ts';

export type CameraProfileId = 'dji' | 'gopro' | 'insta360' | 'generic';
export type ResolverId = 'gpmf' | 'creationTime' | 'filename' | 'timecode' | 'manual';

export interface CameraProfile {
  id: CameraProfileId;
  label: string;
  /** Resolvers tried in this order; the first that yields a timestamp wins. */
  resolvers: ResolverId[];
  /** How this camera writes mvhd creation_time. */
  creationTime: {
    /** 'local' = local wall time stored as if it were UTC (GoPro quirk). */
    clock: 'utc' | 'local';
    /** Whether the value marks the start or the end (file close) of recording. */
    marks: 'start' | 'end';
  };
  /** True once validated with real files (see docs/camera-timestamps.md). */
  verified: boolean;
  /** Timeline colour. */
  color: string;
}

export interface TimestampCandidate {
  resolver: ResolverId;
  startUtcMs: number;
  /** Short Portuguese description for the UI. */
  description: string;
}

export type SyncWarningCode =
  | 'noTimestamp'
  | 'outsideRide'
  | 'partiallyOutside'
  | 'timezoneSuspect'
  | 'exportedSuspect'
  | 'resolversDisagree'
  | 'profileUnverified';

export interface SyncWarning {
  code: SyncWarningCode;
  message: string;
  /** For timezoneSuspect: offset (ms) that would fix it, to apply with one click. */
  suggestedOffsetMs?: number;
}

export interface ResolvedStart {
  startUtcMs?: number;
  source?: ResolverId;
  candidates: TimestampCandidate[];
}

export interface Camera {
  id: string;
  profile: CameraProfileId;
  label: string;
  color: string;
  /** Global offset applied to every clip of this camera (ms). */
  offsetMs: number;
  /** Time zone used to interpret local wall-clock timestamps. */
  timeZone: string;
}

export interface Clip {
  id: string;
  meta: ClipMetadata;
  cameraId: string;
  resolved: ResolvedStart;
  /** User-entered start (UTC ms) — overrides everything else except offsets. */
  manualStartUtcMs?: number;
  /** Fine adjustment for this clip only (ms). */
  clipOffsetMs: number;
  /** GoPro chapter grouping. */
  chapter?: { group: string; index: number };
  /** Start derived from the previous chapter's end (ms, before offsets). */
  chapterStartUtcMs?: number;
}
