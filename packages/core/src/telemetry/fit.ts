import { decodeFit } from './fitDecoder.ts';
import type { RawSample, RawTelemetry } from './types.ts';
import { LocalizedError } from '../i18n/index.ts';

const SEMICIRCLE_TO_DEG = 180 / 2 ** 31;
/** FIT timestamps are seconds since 1989-12-31T00:00:00Z. */
export const FIT_EPOCH_MS = Date.UTC(1989, 11, 31);

const MSG = { fileId: 0, record: 20, activity: 34 } as const;

/** record message field numbers and scales (FIT profile). */
const REC = {
  timestamp: 253,
  lat: 0,
  lon: 1,
  altitude: 2, // uint16, scale 5, offset 500
  heartRate: 3,
  cadence: 4,
  distance: 5, // uint32, scale 100
  speed: 6, // uint16, scale 1000
  power: 7,
  temperature: 13, // sint8
  enhancedSpeed: 73, // uint32, scale 1000
  enhancedAltitude: 78, // uint32, scale 5, offset 500
} as const;

const MANUFACTURERS: Record<number, string> = {
  1: 'garmin',
  23: 'suunto',
  32: 'wahoo',
  112: 'bryton',
  115: 'igpsport',
  255: 'development',
  260: 'zwift',
  265: 'strava',
  267: 'bryton',
  289: 'hammerhead',
  294: 'coros',
};

const num = (v: number | string | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/**
 * Parses a FIT activity file. Works with Garmin, Bryton, iGPSPORT and any device that
 * writes standard `record` messages. Missing fields become unavailable metrics, never errors.
 */
export function parseFit(data: ArrayBuffer | Uint8Array, name?: string): RawTelemetry {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const messages = decodeFit(bytes, new Set([MSG.fileId, MSG.record, MSG.activity]));
  const records = messages.filter((m) => m.num === MSG.record);
  if (records.length === 0) throw new LocalizedError('err.fitNoRecords');

  const samples: RawSample[] = [];
  const recordFields = new Set<string>();
  const names = Object.fromEntries(Object.entries(REC).map(([k, v]) => [v, k]));
  for (const r of records) {
    const f = r.fields;
    const ts = num(f.get(REC.timestamp));
    if (ts === undefined) continue;
    for (const k of f.keys()) recordFields.add(names[k] ?? `field${k}`);
    const s: RawSample = { t: FIT_EPOCH_MS + ts * 1000 };
    const lat = num(f.get(REC.lat));
    const lon = num(f.get(REC.lon));
    if (lat !== undefined && lon !== undefined && !(lat === 0 && lon === 0)) {
      s.lat = lat * SEMICIRCLE_TO_DEG;
      s.lon = lon * SEMICIRCLE_TO_DEG;
    }
    const ea = num(f.get(REC.enhancedAltitude));
    const a = num(f.get(REC.altitude));
    s.altitude = ea !== undefined ? ea / 5 - 500 : a !== undefined ? a / 5 - 500 : undefined;
    const es = num(f.get(REC.enhancedSpeed));
    const sp = num(f.get(REC.speed));
    s.speed = es !== undefined ? es / 1000 : sp !== undefined ? sp / 1000 : undefined;
    const d = num(f.get(REC.distance));
    s.distance = d !== undefined ? d / 100 : undefined;
    s.heartRate = num(f.get(REC.heartRate));
    s.cadence = num(f.get(REC.cadence));
    s.power = num(f.get(REC.power));
    s.temperature = num(f.get(REC.temperature));
    samples.push(s);
  }
  if (samples.length === 0) throw new LocalizedError('err.fitNoTime');

  // Local time offset: activity.local_timestamp (field 5) − activity.timestamp (field 253).
  let localOffsetMs: number | undefined;
  const activity = messages.find((m) => m.num === MSG.activity);
  const aTs = num(activity?.fields.get(253));
  const aLocal = num(activity?.fields.get(5));
  if (aTs !== undefined && aLocal !== undefined) {
    const off = (aLocal - aTs) * 1000;
    if (Math.abs(off) <= 14 * 3600_000) localOffsetMs = Math.round(off / 900_000) * 900_000;
  }

  const fileId = messages.find((m) => m.num === MSG.fileId);
  const manu = num(fileId?.fields.get(1));
  const product = num(fileId?.fields.get(2));
  const device = manu !== undefined ? [MANUFACTURERS[manu] ?? `manufacturer ${manu}`, product].filter((x) => x !== undefined).join(' ') : undefined;

  return { source: 'fit', name, device, localOffsetMs, samples, recordFields: [...recordFields].sort() };
}
