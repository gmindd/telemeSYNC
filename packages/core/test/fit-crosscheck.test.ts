// Cross-check of the own FIT decoder against the official Garmin SDK (dev dependency only, never shipped).
import { readFileSync } from 'node:fs';
import { Decoder, Stream } from '@garmin/fitsdk';
import { describe, expect, it } from 'vitest';
import { parseFit } from '../src/telemetry/fit.ts';

const SC = 180 / 2 ** 31;

describe('own FIT decoder matches the Garmin SDK', () => {
  for (const file of ['fixtures/real/ride-0-2026-10-11-09-00-31.fit', 'fixtures/synthetic/synthetic.fit']) {
    it(file, () => {
      const bytes = readFileSync(file);
      const own = parseFit(new Uint8Array(bytes));
      const { messages } = new Decoder(Stream.fromBuffer(bytes)).read();
      const ref = (messages as any).recordMesgs as any[];
      expect(own.samples.length).toBe(ref.length);
      ref.forEach((r, i) => {
        const s = own.samples[i];
        expect(s.t).toBe(r.timestamp.getTime());
        if (r.positionLat !== undefined) expect(s.lat).toBeCloseTo(r.positionLat * SC, 9);
        expect(s.altitude ?? NaN).toBeCloseTo(r.enhancedAltitude ?? r.altitude ?? NaN, 6);
        expect(s.speed ?? NaN).toBeCloseTo(r.enhancedSpeed ?? r.speed ?? NaN, 6);
        expect(s.distance ?? NaN).toBeCloseTo(r.distance ?? NaN, 6);
        expect(s.heartRate).toBe(r.heartRate);
        expect(s.temperature).toBe(r.temperature);
      });
    });
  }
});
