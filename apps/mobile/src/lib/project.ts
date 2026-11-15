// Loading a clip and a ride with the shared core: the same metadata reader, sync resolvers and ride builder
// as the desktop app.
import {
  addClips,
  availableOverlays,
  candidateLabel,
  blobSource,
  buildRide,
  effectiveStart,
  parseTelemetryFile,
  readClipMetadata,
  type ClipMetadata,
  type Lang,
  type OverlayId,
  type RideData,
} from '@telemesync/core';

export interface LoadedClip {
  file: Blob;
  name: string;
  meta: ClipMetadata;
}

export async function loadClip(file: Blob, name: string, lastModifiedMs?: number): Promise<LoadedClip> {
  const meta = await readClipMetadata(blobSource(file), name, lastModifiedMs);
  return { file, name, meta };
}

export async function loadRide(file: Blob, name: string): Promise<RideData> {
  return buildRide(parseTelemetryFile(name, new Uint8Array(await file.arrayBuffer())));
}

/** The phone's time zone: phone video names carry the local time the recording started. */
function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

function resolved(clip: LoadedClip, ride?: RideData) {
  const state = addClips({ cameras: [], clips: [] }, [clip.meta], ride?.startTime, deviceTimeZone(), undefined, ride);
  return { clip: state.clips[0]!, camera: state.cameras[0]! };
}

/** Start of the clip (UTC ms) found by the core's resolvers (camera profile, GoPro GPS, creation time, file name…). */
export function detectedStart(clip: LoadedClip, ride?: RideData): number | undefined {
  const r = resolved(clip, ride);
  return effectiveStart(r.clip, r.camera);
}

/** Where that start came from, in words ("GoPro GPS (GPMF)", "Date/time in the file name"…). */
export function startSource(clip: LoadedClip, ride: RideData | undefined, lang: Lang): string | undefined {
  const c = resolved(clip, ride).clip.resolved.candidates[0];
  return c ? candidateLabel(c, lang) : undefined;
}

/** Gadgets offered first on the phone (the round dials read best on a small screen), then the rest. */
const PREFERRED: OverlayId[] = ['dialSpeed', 'dialHeartRate', 'dialMap', 'dialProfile', 'dialPower', 'dialCadence', 'dialGrade', 'dialAltitude'];

export function offeredOverlays(ride: RideData): OverlayId[] {
  const ids = availableOverlays(ride).map((o) => o.id);
  return [...PREFERRED.filter((id) => ids.includes(id)), ...ids.filter((id) => !PREFERRED.includes(id))];
}

export function defaultSelection(ride: RideData): OverlayId[] {
  return offeredOverlays(ride)
    .filter((id) => ['dialSpeed', 'dialHeartRate', 'dialMap', 'dialProfile'].includes(id))
    .slice(0, 4);
}
