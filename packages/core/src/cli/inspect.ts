/**
 * Dumps the metadata of real files so camera/device behaviour can be verified and turned into test fixtures.
 *
 *   npm run inspect -- <clip.mp4|clip.insv|volta.fit|volta.gpx> [...more] [--out fixtures/real]
 *
 * For each clip writes `<out>/<file>.json` (metadata only — a few KB, never the video).
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { readClipMetadataFromPath } from '../node/fileSource.ts';
import { parseTelemetryFile } from '../telemetry/load.ts';
import { buildRide } from '../telemetry/ride.ts';
import { detectProfile } from '../sync/profiles.ts';
import { parseFilenameTime } from '../sync/filename.ts';
import { parseGoProChapter } from '../sync/chapters.ts';
import { DEFAULT_TIME_ZONE, formatDateTime, wallToUtc } from '../util/timezone.ts';

const iso = (ms?: number) => (ms === undefined ? null : new Date(ms).toISOString());

async function inspectClip(path: string) {
  const meta = await readClipMetadataFromPath(path);
  const st = await stat(path);
  const fn = parseFilenameTime(meta.fileName);
  const tz = DEFAULT_TIME_ZONE;
  const tc = meta.timecodeStartSec;
  return {
    kind: 'clip',
    detectedProfile: detectProfile(meta),
    goproChapter: parseGoProChapter(meta.fileName) ?? null,
    file: { name: meta.fileName, sizeBytes: meta.sizeBytes, mtimeIso: st.mtime.toISOString(), birthtimeIso: st.birthtime.toISOString() },
    metadata: meta,
    interpretations: {
      creationTimeRaw: iso(meta.creationTimeRawMs),
      creationTimeIfUtc: meta.creationTimeRawMs ? formatDateTime(meta.creationTimeRawMs, tz) + ` (${tz})` : null,
      creationTimeIfLocal: meta.creationTimeRawMs ? iso(wallToUtc(meta.creationTimeRawMs, tz)) + ' (UTC)' : null,
      creationMinusDurationIfUtc: meta.creationTimeRawMs ? formatDateTime(meta.creationTimeRawMs - meta.durationMs, tz) + ` (${tz})` : null,
      filenameWallTime: fn ? new Date(fn.wallMs).toISOString().replace('Z', ' (hora local)') : null,
      timecode: tc !== undefined ? `${Math.floor(tc / 3600)}:${String(Math.floor((tc % 3600) / 60)).padStart(2, '0')}:${(tc % 60).toFixed(2).padStart(5, '0')}` : null,
      fileMtimeLocal: formatDateTime(st.mtimeMs, tz),
    },
    /** Fill in by hand: the real start time of the clip (e.g. from a photo of the cycling computer). */
    groundTruth: { realStartLocal: null as string | null, notes: '' },
  };
}

async function inspectTelemetry(path: string) {
  const raw = parseTelemetryFile(path, await readFile(path));
  const ride = buildRide(raw);
  const gaps = [];
  for (let i = 1; i < ride.t.length; i++) if (ride.t[i] - ride.t[i - 1] > ride.gapThresholdMs) gaps.push({ at: iso(ride.t[i - 1]), seconds: (ride.t[i] - ride.t[i - 1]) / 1000 });
  const dts = [];
  for (let i = 1; i < Math.min(ride.t.length, 2000); i++) dts.push(ride.t[i] - ride.t[i - 1]);
  dts.sort((a, b) => a - b);
  return {
    kind: 'telemetry',
    file: basename(path),
    source: raw.source,
    device: raw.device,
    recordFields: raw.recordFields,
    channels: [...ride.channels],
    available: [...ride.available],
    samples: ride.t.length,
    medianIntervalMs: dts[dts.length >> 1],
    start: iso(ride.startTime),
    end: iso(ride.endTime),
    localOffsetHours: raw.localOffsetMs !== undefined ? raw.localOffsetMs / 3600_000 : null,
    totals: { ...ride.totals, distanceKm: ride.totals.distanceM / 1000 },
    gaps: gaps.slice(0, 50),
    gapCount: gaps.length,
  };
}

const { values, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: 'string' } } });
if (!positionals.length) {
  console.error('Uso: npm run inspect -- <ficheiros…> [--out fixtures/real]');
  process.exit(1);
}
if (values.out) await mkdir(resolve(values.out), { recursive: true });
for (const p of positionals) {
  try {
    const isTelemetry = /\.(fit|gpx)$/i.test(p);
    const info = isTelemetry ? await inspectTelemetry(resolve(p)) : await inspectClip(resolve(p));
    const json = JSON.stringify(info, null, 2);
    if (values.out) {
      const outFile = join(resolve(values.out), `${basename(p)}.json`);
      await writeFile(outFile, json);
      console.log(`✔ ${outFile}`);
    } else console.log(json);
  } catch (e) {
    console.error(`✖ ${p}: ${e instanceof Error ? e.message : e}`);
  }
}
