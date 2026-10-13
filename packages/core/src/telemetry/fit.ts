import { Decoder, Stream } from '@garmin/fitsdk';
import type { RawSample, RawTelemetry } from './types.ts';

const SEMICIRCLE_TO_DEG = 180 / 2 ** 31;

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/**
 * Parses a FIT activity file. Works with Garmin, Bryton, iGPSPORT and any device that
 * writes standard `record` messages. Missing fields become unavailable metrics, never errors.
 */
export function parseFit(data: ArrayBuffer | Uint8Array, name?: string): RawTelemetry {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const stream = Stream.fromArrayBuffer(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  );
  const decoder = new Decoder(stream);
  if (!decoder.isFIT()) throw new Error('O ficheiro não é um FIT válido.');

  const { messages, errors } = decoder.read({
    applyScaleAndOffset: true,
    expandSubFields: true,
    expandComponents: true,
    convertTypesToStrings: true,
    convertDateTimesToDates: true,
    mergeHeartRates: true,
  });
  const records: Record<string, unknown>[] = (messages as any).recordMesgs ?? [];
  if (records.length === 0) {
    const reason = errors?.length ? ` (${String(errors[0])})` : '';
    throw new Error(`O ficheiro FIT não tem registos de atividade${reason}.`);
  }

  const samples: RawSample[] = [];
  for (const r of records) {
    const ts = r.timestamp;
    const t = ts instanceof Date ? ts.getTime() : undefined;
    if (t === undefined || !Number.isFinite(t)) continue;
    const latSc = num(r.positionLat);
    const lonSc = num(r.positionLong);
    const s: RawSample = { t };
    if (latSc !== undefined && lonSc !== undefined && !(latSc === 0 && lonSc === 0)) {
      s.lat = latSc * SEMICIRCLE_TO_DEG;
      s.lon = lonSc * SEMICIRCLE_TO_DEG;
    }
    s.altitude = num(r.enhancedAltitude) ?? num(r.altitude);
    s.speed = num(r.enhancedSpeed) ?? num(r.speed);
    s.distance = num(r.distance);
    s.heartRate = num(r.heartRate);
    s.cadence = num(r.cadence);
    s.power = num(r.power);
    s.temperature = num(r.temperature);
    samples.push(s);
  }

  // Local time offset: activity.localTimestamp - activity.timestamp (both "seconds since FIT epoch").
  let localOffsetMs: number | undefined;
  const activity = ((messages as any).activityMesgs ?? [])[0];
  if (activity && activity.timestamp instanceof Date && typeof activity.localTimestamp === 'number') {
    const FIT_EPOCH_MS = Date.UTC(1989, 11, 31);
    const localMs = FIT_EPOCH_MS + activity.localTimestamp * 1000;
    const off = localMs - activity.timestamp.getTime();
    if (Math.abs(off) <= 14 * 3600_000) localOffsetMs = Math.round(off / 900_000) * 900_000;
  }

  const fileId = ((messages as any).fileIdMesgs ?? [])[0];
  const device = fileId ? [fileId.manufacturer, fileId.garminProduct ?? fileId.product].filter(Boolean).join(' ') : undefined;

  return { source: 'fit', name, device: device || undefined, localOffsetMs, samples };
}
