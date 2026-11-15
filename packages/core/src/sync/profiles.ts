import type { ClipMetadata } from '../media/types.ts';
import { tr, type Lang } from '../i18n/index.ts';
import type { CameraProfile, CameraProfileId } from './types.ts';

/**
 * Camera profiles. The timestamp interpretations below are INITIAL ASSUMPTIONS and must be
 * validated with real files (docs/camera-timestamps.md). `verified` stays false until then.
 */
export const CAMERA_PROFILES: Record<CameraProfileId, CameraProfile> = {
  dji: {
    id: 'dji',
    label: 'DJI Osmo Action',
    resolvers: ['manual', 'filename', 'creationTime'],
    // Osmo Action (2026-10, DJI_20261011094817_0011_D.MP4): Windows shows "media created" 09:48 local
    // = creation_time 08:48 UTC → real UTC, start of recording, consistent with the file name.
    creationTime: { clock: 'utc', marks: 'start' },
    verified: false,
    color: '#e53935',
  },
  gopro: {
    id: 'gopro',
    label: 'GoPro',
    resolvers: ['manual', 'gpmf', 'creationTime', 'timecode'],
    creationTime: { clock: 'local', marks: 'start' },
    verified: false,
    color: '#1e88e5',
  },
  insta360: {
    id: 'insta360',
    label: 'Insta360',
    resolvers: ['manual', 'filename', 'creationTime'],
    creationTime: { clock: 'utc', marks: 'start' },
    verified: false,
    color: '#fdd835',
  },
  phone: {
    id: 'phone',
    label: 'Android phone',
    // Android's recorder writes creation_time when the file is closed, i.e. when recording STOPS (real UTC). The
    // file name (VID_20261115_103045, PXL_…, 20261115_103045) is the local time it started, so it goes first.
    resolvers: ['manual', 'filename', 'creationTime'],
    creationTime: { clock: 'utc', marks: 'end' },
    verified: false,
    color: '#43a047',
  },
  generic: {
    id: 'generic',
    label: 'Generic',
    resolvers: ['manual', 'creationTime', 'filename', 'timecode'],
    creationTime: { clock: 'utc', marks: 'start' },
    verified: false,
    color: '#8e24aa',
  },
};

const GOPRO_NAME = /^(G[HXLS]\d{6}|GOPR\d{4}|GP\d{6})\.(MP4|LRV|360)$/i;
const DJI_NAME = /^DJI_\d{4}/i;
const INSTA_NAME = /^(VID|LRV|PRO_VID|IMG)_\d{8}_\d{6}/i;
// Android camera apps: Pixel PXL_20261115_103045123, Xiaomi/Huawei/Motorola VID_20261115_103045, OnePlus
// VID20261115103045, Samsung 20261115_103045. Insta360 names carry a "_00_001" suffix after the time.
const PHONE_NAME = /^(PXL_\d{8}_\d{6}|VID_?\d{8}_?\d{6}(?!_\d{2}_\d{3})|\d{8}_\d{6}(?:\(\d+\))?\.(mp4|3gp)$)/i;

/** Guesses the camera profile from file name and container tags. */
export function detectProfile(meta: ClipMetadata): CameraProfileId {
  const name = meta.fileName;
  const tagText = Object.values(meta.tags).join(' ') + ' ' + meta.handlerNames.join(' ');
  if (/\.insv$/i.test(name) || /insta360/i.test(tagText)) return 'insta360';
  if (GOPRO_NAME.test(name) || /gopro/i.test(tagText) || meta.hasGpmf) return 'gopro';
  if (DJI_NAME.test(name) || /\bdji\b/i.test(tagText)) return 'dji';
  // Android writes "com.android.version" (and the capture fps) among the file's metadata keys.
  if (Object.keys(meta.tags).some((k) => /^com\.android\./i.test(k)) || PHONE_NAME.test(name)) return 'phone';
  if (INSTA_NAME.test(name)) return 'insta360';
  return 'generic';
}

/** Profile name in `lang` (only "Generic" and "Android phone" are translated; the others are brands). */
export function profileLabel(id: CameraProfileId, lang: Lang | undefined): string {
  return id === 'generic' || id === 'phone' ? tr(lang, `profile.${id}`) : CAMERA_PROFILES[id].label;
}
