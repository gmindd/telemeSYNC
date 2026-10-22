import type { Fps } from '../media/types.ts';
import { formatDateTime, formatDuration } from '../util/timezone.ts';
import { decimalSeparator, formatNumber, tr, type CoreKey, type Lang } from '../i18n/index.ts';
import { profileLabel } from './profiles.ts';
import { baseStart, clipWarnings, effectiveStart, type SyncState } from './session.ts';
import type { Camera, Clip, ResolverId } from './types.ts';

/** How each clip was placed on the ride: written next to the exported files, shown in the app. */
export interface ClipSyncInfo {
  fileName: string;
  camera: string;
  timeZone: string;
  /** Where the start before offsets came from (in the app language). */
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

const SOURCE_LABEL: Record<ResolverId, CoreKey> = {
  filename: 'source.filename',
  creationTime: 'source.creationTime',
  timecode: 'source.timecode',
  gpmf: 'source.gpmf',
  manual: 'source.manual',
};

/** Where the clip's start comes from, in words. */
export function startSource(clip: Clip, lang?: Lang): string {
  if (clip.manualStartUtcMs !== undefined) return tr(lang, SOURCE_LABEL.manual);
  if (clip.chapterStartUtcMs !== undefined) return tr(lang, 'source.chapter', { n: clip.chapter?.index ?? '?' });
  return tr(lang, clip.resolved.source ? SOURCE_LABEL[clip.resolved.source] : 'source.none');
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

export function overlapWarning(names: string[], lang?: Lang): string {
  return tr(lang, 'warn.overlap', { names: names.join(', ') });
}

export function clipSyncInfo(clip: Clip, camera: Camera, ride: { startTime: number; endTime: number } | undefined, overlaps?: string[], lang?: Lang): ClipSyncInfo {
  const warnings = ride ? clipWarnings(clip, camera, ride.startTime, ride.endTime, lang).map((w) => w.message) : [];
  if (overlaps?.length) warnings.push(overlapWarning(overlaps, lang));
  const profile = profileLabel(camera.profile, lang);
  return {
    fileName: clip.meta.fileName,
    camera: `${camera.label}${camera.label !== profile ? ` (${profile})` : ''}`,
    timeZone: camera.timeZone,
    source: startSource(clip, lang),
    baseStartUtcMs: baseStart(clip),
    cameraOffsetMs: camera.offsetMs,
    clipOffsetMs: clip.clipOffsetMs,
    startUtcMs: effectiveStart(clip, camera),
    durationMs: clip.meta.durationMs,
    fps: clip.meta.fps,
    warnings,
  };
}

/** "+1.2 s", "−2 min 03.0 s", "+1 h 00 min 00.0 s" (decimal comma except in English). */
export function formatOffset(ms: number, lang?: Lang): string {
  const sign = ms < 0 ? '−' : '+';
  const a = Math.abs(ms) / 1000;
  const h = Math.floor(a / 3600);
  const m = Math.floor((a % 3600) / 60);
  const ss = formatNumber(a % 60, 1, lang).padStart(4, '0');
  return h ? `${sign}${h} h ${String(m).padStart(2, '0')} min ${ss} s` : m ? `${sign}${m} min ${ss} s` : `${sign}${ss} s`;
}

/** Wall time with tenths of a second, e.g. "2026-10-11 09:48:17.2". */
function preciseTime(utcMs: number, tz: string, lang?: Lang): string {
  const tenths = Math.floor((((utcMs % 1000) + 1000) % 1000) / 100);
  return `${formatDateTime(Math.floor(utcMs / 1000) * 1000, tz)}${decimalSeparator(lang)}${tenths}`;
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
  lang?: Lang;
}): string {
  const { ride, timeZone, lang } = opts;
  const lines = [
    `telemeSYNC${opts.version ? ` ${opts.version}` : ''} · ${tr(lang, 'report.title')}`,
    tr(lang, 'report.ride', { name: opts.rideName }),
    tr(lang, 'report.telemetry', {
      from: formatDateTime(ride.startTime, timeZone),
      to: formatDateTime(ride.endTime, timeZone),
      tz: timeZone,
      dur: formatDuration(ride.endTime - ride.startTime),
    }),
    tr(lang, 'report.exported', { date: formatDateTime(opts.exportedAt, timeZone) }),
    '',
    tr(lang, 'report.note1'),
    tr(lang, 'report.note2'),
    '',
  ];
  opts.clips.forEach((c, i) => {
    lines.push(`${i + 1}. ${c.fileName}`);
    lines.push(`   ${tr(lang, 'report.camera', { camera: c.camera, tz: c.timeZone })}`);
    if (c.startUtcMs === undefined) {
      lines.push(`   ${tr(lang, 'report.noStart')}`);
    } else {
      const fps = c.fps ? ` · ${String(Math.round((c.fps.num / c.fps.den) * 100) / 100).replace('.', decimalSeparator(lang))} fps` : '';
      const start = preciseTime(c.startUtcMs, c.timeZone, lang);
      const end = preciseTime(c.startUtcMs + c.durationMs, c.timeZone, lang);
      lines.push(`   ${tr(lang, 'report.start', { start, end, dur: formatDuration(c.durationMs), fps })}`);
      lines.push(`   ${tr(lang, 'report.onRide', { from: rideClock(c.startUtcMs - ride.startTime), to: rideClock(c.startUtcMs + c.durationMs - ride.startTime) })}`);
      const base = c.baseStartUtcMs !== undefined ? ` (${preciseTime(c.baseStartUtcMs, c.timeZone, lang)})` : '';
      lines.push(`   ${tr(lang, 'report.source', { source: `${c.source}${base}` })}`);
      lines.push(`   ${tr(lang, 'report.offsets', { camera: formatOffset(c.cameraOffsetMs, lang), clip: formatOffset(c.clipOffsetMs, lang) })}`);
    }
    lines.push(`   ${tr(lang, 'report.warnings')}${c.warnings.length ? '' : ` ${tr(lang, 'report.none')}`}`);
    for (const w of c.warnings) lines.push(`   - ${w}`);
    lines.push('');
  });
  return lines.join('\n');
}
