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

/** Guesses the camera profile from file name and container tags. */
export function detectProfile(meta: ClipMetadata): CameraProfileId {
  const name = meta.fileName;
  const tagText = Object.values(meta.tags).join(' ') + ' ' + meta.handlerNames.join(' ');
  if (/\.insv$/i.test(name) || INSTA_NAME.test(name) || /insta360/i.test(tagText)) return 'insta360';
  if (GOPRO_NAME.test(name) || /gopro/i.test(tagText) || meta.hasGpmf) return 'gopro';
  if (DJI_NAME.test(name) || /\bdji\b/i.test(tagText)) return 'dji';
  return 'generic';
}

/** Profile name in `lang` (only "Generic" is translated; the others are brands). */
export function profileLabel(id: CameraProfileId, lang: Lang | undefined): string {
  return id === 'generic' ? tr(lang, 'profile.generic') : CAMERA_PROFILES[id].label;
}
