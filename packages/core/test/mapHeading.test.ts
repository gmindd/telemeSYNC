import { describe, expect, it } from 'vitest';
import { buildRide, sampleAt } from '../src/index.ts';
import { roundMapHeading } from '../src/overlays/dial/map.ts';

const t0 = Date.UTC(2026, 9, 25, 17, 0, 0);
const M_LAT = 110_540;
const M_LON = 111_320 * Math.cos((41.6 * Math.PI) / 180);
/** 2 m/s (a slow climb): 60 s north, then 60 s east, one fix a second. */
const ride = buildRide({
  source: 'gpx',
  samples: Array.from({ length: 121 }, (_, i) => {
    const north = Math.min(i, 60) * 2;
    const east = Math.max(0, i - 60) * 2;
    return { t: t0 + i * 1000, lat: 41.6 + north / M_LAT, lon: -8.8 + east / M_LON };
  }),
});
const deg = (s: number) => (roundMapHeading(ride, sampleAt(ride, t0 + s * 1000)) * 180) / Math.PI;

describe('round map heading', () => {
  it('turns with the bend, not seconds after it (slow climb)', () => {
    expect(deg(30)).toBeCloseTo(0, 0);
    expect(deg(60)).toBeGreaterThan(30);
    expect(deg(60)).toBeLessThan(60);
    expect(deg(66)).toBeGreaterThan(75);
    expect(deg(70)).toBeCloseTo(90, 0);
    expect(deg(100)).toBeCloseTo(90, 0);
  });

  it('turns smoothly between frames', () => {
    let prev = deg(50);
    for (let s = 50.04; s < 72; s += 0.04) {
      const d = deg(s);
      expect(Math.abs(d - prev)).toBeLessThan(3);
      prev = d;
    }
  });

  it('keeps the last direction while stopped', () => {
    const stop = buildRide({
      source: 'gpx',
      samples: Array.from({ length: 80 }, (_, i) => ({ t: t0 + i * 1000, lat: 41.6, lon: -8.8 + (Math.min(i, 30) * 3) / M_LON + (i > 30 ? ((i % 2) * 0.5) / M_LON : 0) })),
    });
    const at = (s: number) => (roundMapHeading(stop, sampleAt(stop, t0 + s * 1000)) * 180) / Math.PI;
    expect(at(15)).toBeCloseTo(90, 0);
    expect(at(60)).toBeCloseTo(90, 0);
  });
});
