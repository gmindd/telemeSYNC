import type { Fps } from '../media/types.ts';
import { formatDateTime, formatDuration } from '../util/timezone.ts';
import { CAMERA_PROFILES } from './profiles.ts';
import { baseStart, clipWarnings, effectiveStart, type SyncState } from './session.ts';
import type { Camera, Clip, ResolverId } from './types.ts';

/** How each clip was placed on the ride: written next to the exported files, shown in the app. */
export interface ClipSyncInfo {
  fileName: string;
  camera: string;
  timeZone: string;
  /** Where the start before offsets came from (Portuguese). */
  source: string;
  baseStartUtcMs?: number;
  cameraOffsetMs: number;
  clipOffsetMs: number;
  /** Start used for the overlays (base + offsets). */
  startUtcMs?: number;
  durationMs: number;
  fps?: Fps;
  warnings: string[];
}

const SOURCE_LABEL: Record<ResolverId, string> = {
  filename: 'nome do ficheiro',
  creationTime: 'data interna do ficheiro (creation_time)',
  timecode: 'timecode do ficheiro',
  gpmf: 'GPS da GoPro (GPMF)',
  manual: 'hora indicada à mão',
};

/** Where the clip's start comes from, in words. */
export function startSource(clip: Clip): string {
  if (clip.manualStartUtcMs !== undefined) return SOURCE_LABEL.manual;
  if (clip.chapterStartUtcMs !== undefined) return `capítulo ${clip.chapter?.index} da GoPro, seguido ao anterior`;
  return clip.resolved.source ? SOURCE_LABEL[clip.resolved.source] : 'nenhuma (sem hora de início)';
}

/**
 * Clips of the same camera that overlap in time: a camera cannot record two clips at once,
 * so one of the starts is wrong. Map clip id → file names it overlaps.
 */
export function clipOverlaps(state: SyncState): Map<string, string[]> {
  const cams = new Map(state.cameras.map((c) => [c.id, c]));
  const spans = state.clips
    .map((c) => ({ c, s: effectiveStart(c, cams.get(c.cameraId)!) }))
    .filter((x): x is { c: Clip; s: number } => x.s !== undefined);
  const out = new Map<string, string[]>();
  // Half a second of tolerance: consecutive files of one recording touch at the edges.
  const tol = 500;
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      const a = spans[i];
      const b = spans[j];
      if (a.c.cameraId !== b.c.cameraId) continue;
      if (a.s < b.s + b.c.meta.durationMs - tol && b.s < a.s + a.c.meta.durationMs - tol) {
        out.set(a.c.id, [...(out.get(a.c.id) ?? []), b.c.meta.fileName]);
        out.set(b.c.id, [...(out.get(b.c.id) ?? []), a.c.meta.fileName]);
      }
    }
  }
  return out;
}

export function overlapWarning(names: string[]): string {
  return `Sobrepõe-se a ${names.join(', ')}: a mesma câmara não grava dois clips ao mesmo tempo, por isso uma das horas de início está errada.`;
}

export function clipSyncInfo(clip: Clip, camera: Camera, ride: { startTime: number; endTime: number } | undefined, overlaps?: string[]): ClipSyncInfo {
  const warnings = ride ? clipWarnings(clip, camera, ride.startTime, ride.endTime).map((w) => w.message) : [];
  if (overlaps?.length) warnings.push(overlapWarning(overlaps));
  return {
    fileName: clip.meta.fileName,
    camera: `${camera.label}${camera.label !== CAMERA_PROFILES[camera.profile].label ? ` (${CAMERA_PROFILES[camera.profile].label})` : ''}`,
    timeZone: camera.timeZone,
    source: startSource(clip),
    baseStartUtcMs: baseStart(clip),
    cameraOffsetMs: camera.offsetMs,
    clipOffsetMs: clip.clipOffsetMs,
    startUtcMs: effectiveStart(clip, camera),
    durationMs: clip.meta.durationMs,
    fps: clip.meta.fps,
    warnings,
  };
}

/** "+1,2 s", "−2 min 03,0 s", "+1 h 00 min 00,0 s". */
export function formatOffset(ms: number): string {
  const sign = ms < 0 ? '−' : '+';
  const a = Math.abs(ms) / 1000;
  const h = Math.floor(a / 3600);
  const m = Math.floor((a % 3600) / 60);
  const ss = (a % 60).toFixed(1).padStart(4, '0').replace('.', ',');
  return h ? `${sign}${h} h ${String(m).padStart(2, '0')} min ${ss} s` : m ? `${sign}${m} min ${ss} s` : `${sign}${ss} s`;
}

/** Wall time with tenths of a second, e.g. "2026-10-11 09:48:17,2". */
function preciseTime(utcMs: number, tz: string): string {
  const tenths = Math.floor((((utcMs % 1000) + 1000) % 1000) / 100);
  return `${formatDateTime(Math.floor(utcMs / 1000) * 1000, tz)},${tenths}`;
}

function rideClock(ms: number): string {
  return ms < 0 ? `−${formatDuration(-ms)}` : formatDuration(ms);
}

/** Plain-text report written as sincronizacao.txt in the export folder. */
export function syncReport(opts: {
  rideName: string;
  ride: { startTime: number; endTime: number };
  clips: ClipSyncInfo[];
  timeZone: string;
  exportedAt: number;
  version?: string;
}): string {
  const { ride, timeZone } = opts;
  const lines = [
    `telemeSYNC${opts.version ? ` ${opts.version}` : ''} · relatório de sincronização`,
    `Volta: ${opts.rideName}`,
    `Telemetria: ${formatDateTime(ride.startTime, timeZone)} a ${formatDateTime(ride.endTime, timeZone)} (${timeZone}), ${formatDuration(ride.endTime - ride.startTime)}`,
    `Exportado em: ${formatDateTime(opts.exportedAt, timeZone)}`,
    '',
    'Cada clip tem os seus próprios ficheiros, com a duração do clip e a hora de início indicada abaixo.',
    'Para cada clip, use os ficheiros da pasta com o mesmo nome do clip, alinhados ao início do clip.',
    '',
  ];
  opts.clips.forEach((c, i) => {
    lines.push(`${i + 1}. ${c.fileName}`);
    lines.push(`   Câmara: ${c.camera} · fuso ${c.timeZone}`);
    if (c.startUtcMs === undefined) {
      lines.push('   Sem hora de início: não exportado.');
    } else {
      const fps = c.fps ? ` · ${Math.round((c.fps.num / c.fps.den) * 100) / 100} fps` : '';
      lines.push(`   Início usado: ${preciseTime(c.startUtcMs, c.timeZone)} · fim ${preciseTime(c.startUtcMs + c.durationMs, c.timeZone)} · duração ${formatDuration(c.durationMs)}${fps}`);
      lines.push(`   Na volta: de ${rideClock(c.startUtcMs - ride.startTime)} a ${rideClock(c.startUtcMs + c.durationMs - ride.startTime)} desde o início da telemetria`);
      const base = c.baseStartUtcMs !== undefined ? ` (${preciseTime(c.baseStartUtcMs, c.timeZone)})` : '';
      lines.push(`   Origem da hora: ${c.source}${base}`);
      lines.push(`   Offset da câmara: ${formatOffset(c.cameraOffsetMs)} · ajuste só deste clip: ${formatOffset(c.clipOffsetMs)}`);
    }
    lines.push(`   Avisos:${c.warnings.length ? '' : ' nenhum'}`);
    for (const w of c.warnings) lines.push(`   - ${w}`);
    lines.push('');
  });
  return lines.join('\n');
}
