import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE, type Ctx2D } from '../src/overlays/types.ts';
import { getOverlay, overlayPixelSize, renderOverlayFrame } from '../src/overlays/registry.ts';
import { registerEmbeddedFonts } from '../src/node/index.ts';
import { bestBefore, buildRide, formatLapTime, parseFit, segmentAt, segmentStats, type Segment } from '../src/index.ts';
import { encodeFit, syntheticRide } from './helpers/synthetic.ts';

const synth = syntheticRide();
const ride = buildRide(parseFit(encodeFit(synth.samples)));
const climb: Segment = { id: 'c', name: 'Climb', kind: 'segment', startMs: synth.climb.startT, endMs: synth.climb.endT };

describe('segments', () => {
  it('measures a segment: time, distance, climb and averages', () => {
    const s = segmentStats(ride, climb)!;
    expect(s.done).toBe(true);
    expect(s.elapsedMs).toBe(synth.climb.endT - synth.climb.startT);
    // 3 m/s for the whole climb, 8 % gradient.
    expect(s.avgSpeed).toBeCloseTo(3, 0);
    expect(Math.abs(s.distanceM - (s.elapsedMs / 1000) * 3)).toBeLessThan(20);
    expect(s.gainM).toBeGreaterThan(60);
    expect(s.gainM).toBeLessThan(80);
    expect(s.lossM).toBeLessThan(5);
    expect(s.avgGrade).toBeGreaterThan(6);
    expect(s.avgGrade).toBeLessThan(10);
    expect(s.avgHeartRate).toBeGreaterThan(0);
    expect(s.maxHeartRate).toBeGreaterThanOrEqual(s.avgHeartRate);
    expect(s.avgPower).toBeGreaterThan(0);
    expect(s.avgCadence).toBeGreaterThan(0);
  });

  it('while riding, counts only the part done so far; nothing before the start', () => {
    expect(segmentStats(ride, climb, climb.startMs - 1)).toBeNull();
    const s = segmentStats(ride, climb, climb.startMs + 100_000)!;
    expect(s.done).toBe(false);
    expect(s.elapsedMs).toBe(100_000);
    expect(s.distanceM).toBeCloseTo(300, -1);
  });

  it('shows the segment being ridden, then holds the result for a while', () => {
    const laps: Segment[] = [
      { id: 'a', name: 'Lap 1', kind: 'lap', startMs: 0, endMs: 60_000 },
      { id: 'b', name: 'Lap 2', kind: 'lap', startMs: 60_000, endMs: 110_000 },
    ];
    expect(segmentAt(laps, -1)).toBeUndefined();
    expect(segmentAt(laps, 30_000)).toMatchObject({ index: 0, running: true });
    // At the line the new lap starts, but the result of the lap just finished stays up for a few seconds.
    expect(segmentAt(laps, 60_000)).toMatchObject({ index: 0, running: false });
    expect(segmentAt(laps, 67_000)).toMatchObject({ index: 0, running: false });
    expect(segmentAt(laps, 69_000)).toMatchObject({ index: 1, running: true });
    expect(segmentAt(laps, 115_000)).toMatchObject({ index: 1, running: false });
    expect(segmentAt(laps, 110_000 + 20_000)).toBeUndefined();
    expect(bestBefore(ride, laps, 'lap', 120_000)?.seg.id).toBe('b');
    expect(bestBefore(ride, laps, 'lap', 100_000)?.seg.id).toBe('a');
    expect(bestBefore(ride, laps, 'segment', 120_000)).toBeUndefined();
  });

  it('formats times with tenths', () => {
    expect(formatLapTime(42_340)).toBe('42.3');
    expect(formatLapTime(245_200, ',')).toBe('4:05,2');
    expect(formatLapTime(3_723_400)).toBe('1:02:03.4');
  });

  it('reads the laps recorded by the bike computer from the FIT file', () => {
    const t0 = synth.samples[0].t;
    const laps = [
      { startMs: t0, endMs: t0 + 200_000 },
      { startMs: t0 + 200_000, endMs: t0 + 450_000 },
    ];
    const r = buildRide(parseFit(encodeFit(synth.samples, { laps })));
    expect(r.laps).toEqual(laps);
    expect(buildRide(parseFit(encodeFit(synth.samples))).laps).toBeUndefined();
  });

  it('the segment gadgets show only inside segments (and the result for a few seconds after)', () => {
    registerEmbeddedFonts();
    const style = { ...DEFAULT_STYLE, scale: 1, segments: [climb] };
    const inked = (id: 'segmentLive' | 'segmentLaps', at: number) => {
      const def = getOverlay(id);
      const { width, height } = overlayPixelSize(def, style);
      const c = createCanvas(width, height);
      const ctx = c.getContext('2d');
      renderOverlayFrame(ctx as unknown as Ctx2D, def, at, style, { ride, clipStart: at, clipEnd: at + 1000 });
      const d = ctx.getImageData(0, 0, width, height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
      return n;
    };
    expect(inked('segmentLive', climb.startMs - 5000)).toBe(0);
    expect(inked('segmentLive', climb.startMs + 5000)).toBeGreaterThan(1000);
    expect(inked('segmentLive', climb.endMs + 5000)).toBeGreaterThan(1000);
    expect(inked('segmentLive', climb.endMs + 60_000)).toBe(0);
    expect(inked('segmentLaps', climb.startMs - 5000)).toBe(0);
    expect(inked('segmentLaps', climb.endMs + 60_000)).toBeGreaterThan(1000);
  });
});
