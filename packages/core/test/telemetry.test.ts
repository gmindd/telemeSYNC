import { describe, expect, it } from 'vitest';
import { buildRide, holdLast, parseFit, parseGpx, parseTelemetryFile, sampleAt } from '../src/index.ts';
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

  it('a sensor that reads every few seconds keeps its last value until the next reading (no dashes in between)', () => {
    // Heart rate only every 5th record, as some watches write it.
    const sparse = ride.samples.map((p, i) => (i % 5 === 0 ? p : { ...p, heartRate: undefined }));
    const rr = buildRide(parseFit(encodeFit(sparse)));
    for (let k = 101; k < 105; k++) {
      const s = sampleAt(rr, ride.samples[0].t + k * 1000 + 300);
      expect(s.heartRate).toBe(ride.samples[100].heartRate);
    }
    // Every instant of the climb and the flat parts has a value (no dashes between readings).
    for (let ms = 20_000; ms < 590_000; ms += 250) expect(Number.isNaN(sampleAt(rr, ride.samples[0].t + ms).heartRate)).toBe(false);
    // Readings further apart than the hold leave a dash once the hold runs out.
    const sparser = ride.samples.map((p, i) => (i % 10 === 0 ? p : { ...p, heartRate: undefined }));
    const r10 = buildRide(parseFit(encodeFit(sparser)));
    expect(Number.isNaN(sampleAt(r10, ride.samples[0].t + 103_000).heartRate)).toBe(false);
    expect(Number.isNaN(sampleAt(r10, ride.samples[0].t + 106_000).heartRate)).toBe(true);
  });

  it('a held reading expires after the hold time and never crosses a pause', () => {
    const t = Float64Array.from([0, 1000, 4000, 5000, 20_000, 21_000]);
    const v = Float64Array.from([150, NaN, NaN, NaN, 160, NaN]);
    expect([...holdLast(t, v, 4_000, 10_000)].map((x) => (Number.isNaN(x) ? null : x))).toEqual([150, 150, 150, null, 160, 160]);
    const t2 = Float64Array.from([0, 1000, 12_000, 13_000]);
    const v2 = Float64Array.from([150, NaN, NaN, NaN]);
    expect([...holdLast(t2, v2, 30_000, 10_000)].map((x) => (Number.isNaN(x) ? null : x))).toEqual([150, 150, null, null]);
  });

  it('records with the same timestamp are merged (GPS in one, heart rate in the other)', () => {
    const base = ride.samples.slice(0, 50);
    const split = base.flatMap((p) => [{ ...p, heartRate: undefined }, { t: p.t, heartRate: p.heartRate }]);
    const rr = buildRide({ ...parseFit(encodeFit(base)), samples: split });
    expect(rr.t.length).toBe(50);
    const s = sampleAt(rr, base[20].t);
    expect(s.heartRate).toBe(base[20].heartRate);
    expect(s.lat).toBeCloseTo(base[20].lat!, 6);
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
