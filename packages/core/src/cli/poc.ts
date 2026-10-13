/**
 * Phase 0 proof of risk:
 *   npm run poc -- --fit volta.fit --clip GX010123.MP4 [--offset 3600] [--start 2024-06-15T09:30:00Z]
 *                  [--metric speed] [--out ./out] [--scale 2]
 *
 * Clip start = mvhd creation_time (read as UTC) + offset (s), or --start if given.
 * Without --clip, use --duration (s) and --fps (e.g. 60000/1001) with --start to test without a video.
 */
import { readFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { buildRide } from '../telemetry/ride.ts';
import { parseTelemetryFile } from '../telemetry/load.ts';
import { DEFAULT_STYLE, type OverlayId } from '../overlays/types.ts';
import { getOverlay, OVERLAY_FILE_SLUG } from '../overlays/registry.ts';
import { formatDateTime, formatDuration } from '../util/timezone.ts';
import { readClipMetadataFromPath } from '../node/fileSource.ts';
import { renderOverlay } from '../node/render.ts';
import type { Fps } from '../media/types.ts';

function parseFps(s: string): Fps {
  const [n, d] = s.split('/').map(Number);
  return { num: n, den: d || 1 };
}

async function main() {
  const { values } = parseArgs({
    options: {
      fit: { type: 'string' },
      clip: { type: 'string' },
      offset: { type: 'string', default: '0' },
      start: { type: 'string' },
      duration: { type: 'string' },
      fps: { type: 'string' },
      metric: { type: 'string', default: 'speed' },
      out: { type: 'string', default: 'out' },
      scale: { type: 'string', default: String(DEFAULT_STYLE.scale) },
      format: { type: 'string', default: 'prores' },
    },
  });
  if (!values.fit) throw new Error('Falta --fit <ficheiro FIT/GPX>');

  const telemetryPath = resolve(values.fit);
  const ride = buildRide(parseTelemetryFile(telemetryPath, await readFile(telemetryPath)));
  console.log(`Volta: ${formatDateTime(ride.startTime)} → ${formatDateTime(ride.endTime)} (${formatDuration(ride.totals.durationMs)}), ${(ride.totals.distanceM / 1000).toFixed(2)} km, D+ ${ride.totals.elevationGainM.toFixed(0)} m`);
  console.log(`Métricas: ${[...ride.available].join(', ')}`);

  let durationMs: number;
  let fps: Fps;
  let start: number;
  let clipName: string;
  if (values.clip) {
    const meta = await readClipMetadataFromPath(resolve(values.clip));
    if (!meta.fps) throw new Error('Não foi possível determinar o fps do clip.');
    durationMs = meta.durationMs;
    fps = meta.fps;
    clipName = basename(values.clip, extname(values.clip));
    const base = values.start ? Date.parse(values.start) : meta.creationTimeRawMs;
    if (base === undefined || Number.isNaN(base)) throw new Error('O clip não tem creation_time; use --start.');
    start = base + Number(values.offset) * 1000;
    console.log(`Clip: ${meta.fileName} ${meta.width}x${meta.height} ${(meta.fps.num / meta.fps.den).toFixed(3)} fps, ${(durationMs / 1000).toFixed(2)} s, creation_time=${meta.creationTimeRawMs ? new Date(meta.creationTimeRawMs).toISOString() : '—'}`);
  } else {
    if (!values.start || !values.duration || !values.fps) throw new Error('Sem --clip, indique --start, --duration e --fps.');
    durationMs = Number(values.duration) * 1000;
    fps = parseFps(values.fps);
    start = Date.parse(values.start) + Number(values.offset) * 1000;
    clipName = 'clip';
  }
  console.log(`Início do clip (UTC): ${new Date(start).toISOString()}`);

  const def = getOverlay(values.metric as OverlayId);
  if (!ride.available.has(def.requires)) throw new Error(`A métrica ${def.id} não existe neste ficheiro.`);
  const format = values.format === 'png' ? 'png' : 'prores';
  const outPath = join(resolve(values.out), format === 'png' ? `${clipName}_${OVERLAY_FILE_SLUG[def.id]}` : `${OVERLAY_FILE_SLUG[def.id]}.mov`);
  const style = { ...DEFAULT_STYLE, scale: Number(values.scale) };
  const t0 = Date.now();
  let lastPct = -1;
  const res = await renderOverlay({
    def,
    style,
    octx: { ride, clipStart: start, clipEnd: start + durationMs },
    durationMs,
    fps,
    outPath,
    format,
    onProgress: (f) => {
      const pct = Math.floor(f * 100);
      if (pct !== lastPct && pct % 10 === 0) {
        lastPct = pct;
        process.stdout.write(`  ${pct}%\n`);
      }
    },
  });
  console.log(`✔ ${outPath} (${res.width}x${res.height}, ${res.frames} frames, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

main().catch((e) => {
  console.error(`Erro: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
