import type { ClipMetadata } from '../media/types.ts';
import { DEFAULT_STYLE, type OverlayId, type OverlayStyle } from '../overlays/types.ts';
import type { Camera } from '../sync/types.ts';

export const PROJECT_VERSION = 1;

/** Saved project (JSON). Video files are referenced by metadata only. */
export interface ProjectFile {
  version: number;
  name: string;
  telemetry?: { fileName: string; sizeBytes: number };
  cameras: Camera[];
  clips: {
    id: string;
    meta: ClipMetadata;
    cameraId: string;
    manualStartUtcMs?: number;
    clipOffsetMs: number;
    selected: boolean;
  }[];
  overlays: OverlayId[];
  style: OverlayStyle;
  output: { format: 'prores' | 'png' };
}

export function serializeProject(p: ProjectFile): string {
  return JSON.stringify(p, null, 2);
}

export function parseProject(json: string): ProjectFile {
  const p = JSON.parse(json);
  if (!p || typeof p !== 'object' || p.version !== PROJECT_VERSION || !Array.isArray(p.clips) || !Array.isArray(p.cameras)) {
    throw new Error('Ficheiro de projeto inválido ou de uma versão incompatível.');
  }
  return {
    ...p,
    style: { ...DEFAULT_STYLE, ...p.style, units: { ...DEFAULT_STYLE.units, ...p.style?.units } },
    overlays: Array.isArray(p.overlays) ? p.overlays : [],
    output: { format: p.output?.format === 'png' ? 'png' : 'prores' },
  };
}
