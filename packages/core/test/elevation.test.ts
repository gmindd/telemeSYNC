import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildRide, parseFit } from '../src/index.ts';
import { matchDeviceTotals } from '../src/metrics/elevation.ts';
import { segmentStats } from '../src/segments/segments.ts';

describe('elevation gain and loss match the bike computer', () => {
  it('uses the totals the device wrote in the FIT session (real iGPSPORT file)', () => {
    const raw = parseFit(new Uint8Array(readFileSync(new URL('../../../fixtures/real/ride-0-2026-10-11-09-00-31.fit', import.meta.url))));
    expect(raw.deviceTotals).toEqual({ ascentM: 1016, descentM: 1032 });
    const ride = buildRide(raw);
    expect(Math.round(ride.totals.elevationGainM)).toBe(1016);
    expect(Math.round(ride.totals.elevationLossM)).toBe(1032);
    // The cumulative curves only go up, and the lap (the whole ride here) says the same.
    for (let i = 1; i < ride.t.length; i++) expect(ride.elevationGain[i]).toBeGreaterThanOrEqual(ride.elevationGain[i - 1]);
    const lap = segmentStats(ride, raw.laps![0])!;
    expect(Math.round(lap.gainM)).toBe(1016);
  });

  it('matches lap by lap, then the whole; leaves out figures far from the altitude', () => {
    const t = Float64Array.from({ length: 11 }, (_, i) => i * 1000);
    const cum = Float64Array.from({ length: 11 }, (_, i) => i * 10); // 10 m per second, 100 m in all
    const laps = [
      { startMs: 0, endMs: 5000, total: 80 }, // first half: 50 m counted, the device says 80
      { startMs: 5000, endMs: 10_000, total: 40 },
    ];
    const out = matchDeviceTotals(t, cum, laps, 120);
    expect(out[5]).toBeCloseTo(80);
    expect(out[10]).toBeCloseTo(120);
    // A device figure under half or over twice what the altitude shows is not trusted.
    expect(matchDeviceTotals(t, cum, [], 1000)[10]).toBe(100);
    expect(matchDeviceTotals(t, cum, [{ startMs: 0, endMs: 10_000, total: 20 }])[10]).toBe(100);
  });
});
