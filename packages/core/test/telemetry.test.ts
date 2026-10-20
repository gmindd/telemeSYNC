import { describe, expect, it } from 'vitest';
import { buildRide, parseFit, parseGpx, parseTelemetryFile, sampleAt } from '../src/index.ts';
import { encodeFit, encodeGpx, syntheticRide } from './helpers/synthetic.ts';

const ride = syntheticRide();

describe('FIT parsing', () => {
  it('reads enhanced fields', () => {
    const raw = parseFit(encodeFit(ride.samples, { enhanced: true }));
    expect(raw.samples.length).toBe(ride.samples.length);
    const s = raw.samples[10];
    expect(s.lat).toBeCloseTo(ride.samples[10].lat!, 5);
    expect(s.speed).toBeCloseTo(5, 2);
    expect(s.heartRate).toBe(ride.samples[10].heartRate);
    expect(s.altitude).toBeCloseTo(ride.samples[10].altitude!, 0);
  });

  it('reads legacy speed/altitude (older Bryton/iGPSPORT style)', () => {
    const raw = parseFit(encodeFit(ride.samples, { enhanced: false }));
    expect(raw.samples[10].speed).toBeCloseTo(5, 2);
    expect(raw.samples[10].altitude).toBeCloseTo(ride.samples[10].altitude!, 0);
  });

  it('extracts the local time offset from the activity message', () => {
    const raw = parseFit(encodeFit(ride.samples, { localOffsetMs: 3600_000 }));
    expect(raw.localOffsetMs).toBe(3600_000);
  });

  it('rejects non-FIT data', () => {
    expect(() => parseFit(new Uint8Array([1, 2, 3, 4]))).toThrow();
  });
});

describe('GPX parsing', () => {
  it('reads trkpt and Garmin extensions', () => {
    const raw = parseGpx(encodeGpx(ride.samples));
    expect(raw.samples.length).toBe(ride.samples.length);
    expect(raw.name).toBe('Volta sintética');
    expect(raw.samples[5].heartRate).toBe(ride.samples[5].heartRate);
    expect(raw.samples[5].cadence).toBe(80);
    expect(raw.samples[5].temperature).toBe(18);
    expect(raw.samples[5].power).toBe(ride.samples[5].power);
  });

  it('missing extensions mean unavailable metrics, not errors', () => {
    const r = buildRide(parseGpx(encodeGpx(ride.samples, { extensions: false })));
    expect(r.available.has('heartRate')).toBe(false);
    expect(r.available.has('speed')).toBe(true); // derived from positions
    expect(r.available.has('grade')).toBe(true);
  });

  it('detects file type by content', () => {
    const bytes = new TextEncoder().encode(encodeGpx(ride.samples.slice(0, 10)));
    expect(parseTelemetryFile('x.dat', bytes).source).toBe('gpx');
    expect(parseTelemetryFile('x.dat', encodeFit(ride.samples.slice(0, 10))).source).toBe('fit');
  });
});

describe('ride metrics and interpolation', () => {
  const r = buildRide(parseFit(encodeFit(ride.samples)));

  it('interpolates linearly between samples', () => {
    const t = ride.samples[0].t + 100_500;
    const s = sampleAt(r, t);
    const d0 = ride.samples[100].distance!;
    const d1 = ride.samples[101].distance!;
    expect(s.distance).toBeCloseTo((d0 + d1) / 2, 1);
    expect(s.inGap).toBe(false);
  });

  it('does not interpolate inside gaps > 10 s and shows 0 speed (or dash)', () => {
    const mid = (ride.gap.startT + ride.gap.endT) / 2;
    const s = sampleAt(r, mid);
    expect(s.inGap).toBe(true);
    expect(s.speed).toBe(0);
    expect(Number.isNaN(sampleAt(r, mid, { gapSpeed: 'dash' }).speed)).toBe(true);
    // position held at the last known point
    const before = sampleAt(r, ride.gap.startT);
    expect(s.lat).toBeCloseTo(before.lat, 7);
  });

  it('a pause in the recording does not shift what comes after it (matched by clock time, not by sample count)', () => {
    const resumeIdx = ride.samples.findIndex((p) => p.t >= ride.gap.endT);
    const resume = ride.samples[resumeIdx];
    for (const dt of [0, 5_000, 60_000]) {
      const s = sampleAt(r, resume.t + dt);
      const truth = ride.samples.find((p) => p.t === resume.t + dt)!;
      expect(s.inGap).toBe(false);
      expect(s.distance).toBeCloseTo(truth.distance!, 1);
    }
  });

  it('speed goes to 0 when stopped', () => {
    const s = sampleAt(r, ride.stop.startT + 30_000);
    expect(s.speed).toBeLessThan(0.05);
  });

  it('grade is stable and plausible on the 8 % climb (no spikes)', () => {
    const values: number[] = [];
    for (let t = ride.climb.startT + 30_000; t <= ride.climb.endT - 30_000; t += 1000) values.push(sampleAt(r, t).grade);
    const min = Math.min(...values);
    const max = Math.max(...values);
    expect(min).toBeGreaterThan(6);
    expect(max).toBeLessThan(10);
  });

  it('grade on the flat stays near 0 despite noise and spike', () => {
    for (let t = ride.samples[0].t + 60_000; t < ride.samples[0].t + 260_000; t += 1000) {
      expect(Math.abs(sampleAt(r, t).grade)).toBeLessThan(2.5);
    }
  });

  it('elevation gain ignores noise (hysteresis) and matches the climb', () => {
    // climb: 300 s × 3 m/s × 0.08 ≈ 71.8 m
    expect(r.totals.elevationGainM).toBeGreaterThan(65);
    expect(r.totals.elevationGainM).toBeLessThan(80);
  });

  it('cumulative values count from ride start and clamp outside', () => {
    expect(sampleAt(r, r.startTime - 5000).distance).toBe(0);
    expect(sampleAt(r, r.endTime + 5000).distance).toBeCloseTo(r.totals.distanceM, 3);
    expect(sampleAt(r, r.startTime - 5000).outside).toBe(true);
  });

  it('exposes only available metrics', () => {
    expect([...r.available].sort()).toEqual(
      ['altitude', 'cadence', 'distance', 'elapsedTime', 'elevationGain', 'elevationProfile', 'grade', 'heartRate', 'localTime', 'map', 'power', 'speed', 'temperature'].sort(),
    );
  });
});
