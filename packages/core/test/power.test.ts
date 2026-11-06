import { describe, expect, it } from 'vitest';
import { buildRide, parseFit, sampleAt } from '../src/index.ts';
import { trailingAverageByTime } from '../src/metrics/smoothing.ts';
import { getOverlay } from '../src/overlays/registry.ts';
import { DEFAULT_STYLE } from '../src/overlays/types.ts';
import { encodeFit, syntheticRide } from './helpers/synthetic.ts';

describe('power: 3 s average and W/kg', () => {
  it('averages the last 3 seconds, never across a pause', () => {
    const t = Float64Array.from([0, 1000, 2000, 3000, 4000, 20_000, 21_000]);
    const v = Float64Array.from([100, 200, 300, 400, 500, 600, 0]);
    const avg = [...trailingAverageByTime(t, v, 3000, 10_000)];
    expect(avg.slice(0, 5)).toEqual([100, 150, 200, 300, 400]);
    // After the pause the window starts again.
    expect(avg[5]).toBe(600);
    expect(avg[6]).toBe(300);
  });

  it('a frame can show the 3 s average instead of the instantaneous power', () => {
    const synth = syntheticRide();
    // Alternate 100 W / 300 W every second: instantaneous jumps, the 3 s average stays near 200 W.
    const samples = synth.samples.map((s, i) => ({ ...s, power: i % 2 ? 300 : 100 }));
    const ride = buildRide(parseFit(encodeFit(samples)));
    const at = synth.samples[0].t + 120_000;
    expect([100, 300]).toContain(sampleAt(ride, at).power);
    const avg = sampleAt(ride, at, { power3s: true }).power;
    expect(avg).toBeGreaterThan(150);
    expect(avg).toBeLessThan(250);
  });

  it('the power gadget grows a second line for W/kg only when a weight is entered', () => {
    const def = getOverlay('power');
    const plain = def.size(DEFAULT_STYLE);
    expect(def.size({ ...DEFAULT_STYLE, powerWkg: true }).height).toBe(plain.height);
    const withWkg = def.size({ ...DEFAULT_STYLE, powerWkg: true, weightKg: 72 });
    expect(withWkg.height).toBeGreaterThan(plain.height);
    expect(withWkg.width).toBeGreaterThanOrEqual(plain.width);
  });
});
