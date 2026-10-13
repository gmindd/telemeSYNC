import { XMLParser } from 'fast-xml-parser';
import type { RawSample, RawTelemetry } from './types.ts';

function toNum(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : undefined;
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Depth-first search for the first value of any of `keys` (case-insensitive) inside an extensions node. */
function findExt(node: unknown, keys: string[]): number | undefined {
  if (node === null || typeof node !== 'object') return undefined;
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (keys.includes(k.toLowerCase())) {
      const n = toNum(typeof v === 'object' && v !== null ? (v as any)['#text'] : v);
      if (n !== undefined) return n;
    }
  }
  for (const v of Object.values(node as Record<string, unknown>)) {
    if (typeof v === 'object') {
      const n = findExt(v, keys);
      if (n !== undefined) return n;
    }
  }
  return undefined;
}

/**
 * Tolerant GPX 1.0/1.1 parser. Reads trkpt lat/lon/ele/time and the common extensions:
 * Garmin TrackPointExtension (hr, cad, atemp, speed), power (`power`, `PowerInWatts`, `watts`).
 */
export function parseGpx(xml: string, name?: string): RawTelemetry {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    removeNSPrefix: true,
    parseTagValue: false,
  });
  const doc = parser.parse(xml);
  const gpx = doc?.gpx;
  if (!gpx) throw new Error('O ficheiro não é um GPX válido.');

  const samples: RawSample[] = [];
  let trackName: string | undefined;
  for (const trk of asArray<any>(gpx.trk)) {
    trackName ??= typeof trk.name === 'string' ? trk.name : undefined;
    for (const seg of asArray<any>(trk.trkseg)) {
      for (const p of asArray<any>(seg.trkpt)) {
        const t = p.time ? Date.parse(String(p.time)) : NaN;
        if (!Number.isFinite(t)) continue;
        const s: RawSample = { t };
        const lat = toNum(p['@lat']);
        const lon = toNum(p['@lon']);
        if (lat !== undefined && lon !== undefined) {
          s.lat = lat;
          s.lon = lon;
        }
        s.altitude = toNum(p.ele);
        const ext = p.extensions;
        if (ext) {
          s.heartRate = findExt(ext, ['hr', 'heartrate']);
          s.cadence = findExt(ext, ['cad', 'cadence']);
          s.temperature = findExt(ext, ['atemp', 'temp', 'temperature']);
          s.power = findExt(ext, ['power', 'powerinwatts', 'watts', 'pwr']);
          s.speed = findExt(ext, ['speed']);
        }
        samples.push(s);
      }
    }
  }
  if (samples.length === 0) throw new Error('O ficheiro GPX não tem pontos com hora (trkpt/time).');
  samples.sort((a, b) => a.t - b.t);
  const creator = typeof gpx['@creator'] === 'string' ? gpx['@creator'] : undefined;
  return { source: 'gpx', name: trackName ?? name, device: creator, samples };
}
