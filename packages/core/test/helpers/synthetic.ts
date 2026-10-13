import { Encoder, Profile } from '@garmin/fitsdk';
import type { RawSample } from '../../src/telemetry/types.ts';

export interface SyntheticRide {
  samples: RawSample[];
  /** Index range of the 8 % climb. */
  climb: { startT: number; endT: number; grade: number };
  stop: { startT: number; endT: number };
  gap: { startT: number; endT: number };
}

/** Deterministic pseudo-random noise. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32 - 0.5;
  };
}

/**
 * 1 Hz synthetic ride starting 2024-06-15 08:00:00Z, heading north:
 *  - 0–300 s: flat at 5 m/s
 *  - 300–600 s: 8 % climb at 3 m/s
 *  - 600–660 s: stopped (samples present, speed 0)
 *  - 660–690 s: no samples (gap)
 *  - 690–1200 s: flat at 6 m/s
 * Altitude has ±0.6 m noise and one 15 m spike (barometric glitch).
 */
export function syntheticRide(start = Date.UTC(2024, 5, 15, 8, 0, 0)): SyntheticRide {
  const noise = rng(42);
  const samples: RawSample[] = [];
  let lat = 38.7;
  const lon = -9.15;
  let alt = 100;
  let dist = 0;
  const mPerDegLat = 111_195;
  for (let s = 0; s <= 1200; s++) {
    if (s > 660 && s < 690) continue;
    let v = 0;
    let g = 0;
    if (s < 300) v = 5;
    else if (s < 600) {
      v = 3;
      g = 0.08;
    } else if (s < 660) v = 0;
    else v = 6;
    if (s > 0) {
      const dt = s === 690 ? 30 : 1;
      const step = v * dt;
      const horiz = step / Math.sqrt(1 + g * g);
      dist += horiz;
      alt += horiz * g;
      lat += horiz / mPerDegLat;
    }
    const spike = s === 150 ? 15 : 0;
    samples.push({
      t: start + s * 1000,
      lat,
      lon,
      altitude: alt + noise() * 1.2 + spike,
      speed: v,
      distance: dist,
      heartRate: 120 + Math.round(v * 5),
      cadence: v > 0 ? 80 : 0,
      power: Math.round(v * 40 + g * 1000),
      temperature: 18,
    });
  }
  return {
    samples,
    climb: { startT: start + 300_000, endT: start + 600_000, grade: 8 },
    stop: { startT: start + 600_000, endT: start + 660_000 },
    gap: { startT: start + 660_000, endT: start + 690_000 },
  };
}

const DEG_TO_SC = 2 ** 31 / 180;

/** Encodes samples as a FIT activity. `enhanced` = write enhanced fields (Garmin) or legacy ones (older devices). */
export function encodeFit(samples: RawSample[], opts: { enhanced?: boolean; localOffsetMs?: number } = {}): Uint8Array {
  const enc = new Encoder();
  const start = new Date(samples[0].t);
  enc.writeMesg({
    mesgNum: Profile.MesgNum.FILE_ID,
    type: 'activity',
    manufacturer: 'development',
    product: 0,
    timeCreated: start,
    serialNumber: 1234,
  } as any);
  for (const s of samples) {
    const m: Record<string, unknown> = {
      mesgNum: Profile.MesgNum.RECORD,
      timestamp: new Date(s.t),
      positionLat: Math.round(s.lat! * DEG_TO_SC),
      positionLong: Math.round(s.lon! * DEG_TO_SC),
      distance: s.distance,
      heartRate: s.heartRate,
      cadence: s.cadence,
      power: s.power,
      temperature: s.temperature,
    };
    if (opts.enhanced ?? true) {
      m.enhancedAltitude = s.altitude;
      m.enhancedSpeed = s.speed;
    } else {
      m.altitude = s.altitude;
      m.speed = s.speed;
    }
    enc.writeMesg(m as any);
  }
  const last = new Date(samples[samples.length - 1].t);
  const FIT_EPOCH_MS = Date.UTC(1989, 11, 31);
  enc.writeMesg({
    mesgNum: Profile.MesgNum.ACTIVITY,
    timestamp: last,
    numSessions: 1,
    type: 'manual',
    event: 'activity',
    eventType: 'stop',
    localTimestamp: Math.round((last.getTime() + (opts.localOffsetMs ?? 3600_000) - FIT_EPOCH_MS) / 1000),
  } as any);
  return enc.close();
}

export function encodeGpx(samples: RawSample[], opts: { extensions?: boolean } = {}): string {
  const pts = samples
    .map((s) => {
      const ext = opts.extensions ?? true
        ? `<extensions><power>${s.power}</power><gpxtpx:TrackPointExtension><gpxtpx:atemp>${s.temperature}</gpxtpx:atemp><gpxtpx:hr>${s.heartRate}</gpxtpx:hr><gpxtpx:cad>${s.cadence}</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions>`
        : '';
      return `<trkpt lat="${s.lat!.toFixed(7)}" lon="${s.lon!.toFixed(7)}"><ele>${s.altitude!.toFixed(2)}</ele><time>${new Date(s.t).toISOString()}</time>${ext}</trkpt>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="Synthetic" version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
<trk><name>Volta sintética</name><trkseg>
${pts}
</trkseg></trk></gpx>`;
}
