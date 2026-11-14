// Loading a clip and a ride with the shared core: the same metadata reader, sync resolvers and ride builder
// as the desktop app.
import {
  addClips,
  availableOverlays,
  blobSource,
  buildRide,
  effectiveStart,
  parseTelemetryFile,
  readClipMetadata,
  type ClipMetadata,
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

/** Start of the clip (UTC ms) found by the core's resolvers (camera profile, creation time, file name…). */
export function detectedStart(clip: LoadedClip, ride?: RideData): number | undefined {
  const state = addClips({ cameras: [], clips: [] }, [clip.meta], ride?.startTime);
  return effectiveStart(state.clips[0], state.cameras[0]);
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
