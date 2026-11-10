import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { buildRide, parseFit, parseGpx, sportFromText, type RawSample } from '../src/index.ts';
import { sportFromFit } from '../src/telemetry/fit.ts';
import { distanceAt, formatClock, formatPace, ghostAt, gradeAdjustedSpeed, runSpeedAt, splits, verticalSpeedAt } from '../src/metrics/running.ts';
import { detectRuns, runAt, slopeDegrees } from '../src/metrics/snow.ts';
import { getOverlay, overlayFileSlug, overlayLabel, overlayPixelSize, overlaySports, overlaysForSport, renderOverlayFrame } from '../src/overlays/registry.ts';
import { DEFAULT_STYLE, type Ctx2D, type OverlayId } from '../src/overlays/types.ts';
import { registerEmbeddedFonts } from '../src/node/index.ts';
import { encodeFit, encodeGpx, syntheticRide } from './helpers/synthetic.ts';

const T0 = Date.UTC(2026, 10, 8, 8, 0, 0);
const METRIC = DEFAULT_STYLE.units;

/** 5 km at a steady 4:00/km (4.1667 m/s), 1 Hz, flat. */
function steadyRun(): RawSample[] {
  const v = 1000 / 240;
  const out: RawSample[] = [];
  for (let s = 0; s <= 1260; s++) out.push({ t: T0 + s * 1000, lat: 38.7 + (s * v) / 111_000, lon: -9.15, altitude: 50, distance: s * v, speed: v, heartRate: 160, cadence: 86 });
  return out;
}

/** Three ski runs of 400 m drop, each after a lift ride up. */
function skiDay(): RawSample[] {
  const out: RawSample[] = [];
  let t = 0;
  let alt = 1800;
  let d = 0;
  const push = (v: number, dAlt: number) => {
    d += v;
    alt += dAlt;
    out.push({ t: T0 + t++ * 1000, lat: 45.3 + d / 111_000, lon: 6.5, altitude: alt, distance: d, speed: v });
  };
  for (let k = 0; k < 3; k++) {
    for (let s = 0; s < 400; s++) push(3, 1); // lift: +400 m
    for (let s = 0; s < 200; s++) push(12, -2); // run: −400 m
  }
  return out;
}

describe('sports', () => {
  it('reads the sport from FIT and GPX files, and running cadence in steps per minute', () => {
    expect(sportFromFit(1)).toBe('running');
    expect(sportFromFit(17)).toBe('running');
    expect(sportFromFit(13)).toBe('snow');
    expect(sportFromFit(2)).toBe('cycling');
    expect(sportFromFit(5)).toBeUndefined();
    expect(sportFromText('trail_running')).toBe('running');
    expect(sportFromText('resort_skiing_snowboarding_ws')).toBe('snow');
    expect(sportFromText('mountain_biking')).toBe('cycling');
    const run = steadyRun();
    const raw = parseFit(encodeFit(run, { sport: 'running' }));
    expect(raw.sport).toBe('running');
    expect(raw.samples[10].cadence).toBe(172);
    expect(parseFit(encodeFit(syntheticRide().samples)).sport).toBeUndefined();
    const gpx = encodeGpx(run).replace('<trk>', '<trk><type>running</type>');
    expect(parseGpx(gpx).sport).toBe('running');
  });

  it('gives pace from the distance, splits per km and the grade adjusted pace', () => {
    const ride = buildRide({ source: 'fit', samples: steadyRun(), sport: 'running' });
    const t = T0 + 600_000;
    expect(runSpeedAt(ride, t)).toBeCloseTo(1000 / 240, 2);
    expect(formatPace(runSpeedAt(ride, t), METRIC)).toBe('4:00');
    expect(formatPace(runSpeedAt(ride, t), { ...METRIC, system: 'imperial' })).toBe('6:26');
    expect(formatPace(0.2, METRIC)).toBe('—');
    expect(distanceAt(ride, t)).toBeCloseTo(2500, 0);
    const list = splits(ride, 1000);
    expect(list).toHaveLength(6);
    expect(list.slice(0, 5).map((s) => Math.round((s.endMs - s.startMs) / 1000))).toEqual([240, 240, 240, 240, 240]);
    expect(list[5].distanceM).toBeLessThan(1000);
    // Uphill the same speed is a faster effort, downhill a slower one.
    expect(gradeAdjustedSpeed(3, 10)).toBeGreaterThan(3 * 1.3);
    expect(gradeAdjustedSpeed(3, -10)).toBeLessThan(3);
    expect(gradeAdjustedSpeed(3, 0)).toBeCloseTo(3, 6);
    expect(formatClock(3_725_000)).toBe('1:02:05');
    expect(formatClock(-12_000)).toBe('−0:12');
  });

  it('races the PR ghost: gap, projection and the finish', () => {
    const ride = buildRide({ source: 'fit', samples: steadyRun(), sport: 'running' });
    // PR: 5 km in 21:00 (4:12/km); the runner goes at 4:00/km.
    const g = { distanceM: 5000, timeMs: 21 * 60_000, startMs: null };
    const before = ghostAt(ride, { ...g, startMs: T0 + 60_000 }, T0 + 30_000);
    expect(before.started).toBe(false);
    const mid = ghostAt(ride, g, T0 + 600_000);
    expect(mid.myM).toBeCloseTo(2500, 0);
    expect(mid.ghostM).toBeCloseTo((600 / 1260) * 5000, 0);
    expect(mid.deltaMs).toBeLessThan(-25_000); // 30 s ahead at half way
    expect(mid.projectedMs).toBeCloseTo(1_200_000, -3);
    const end = ghostAt(ride, g, T0 + 1_250_000);
    expect(end.finished).toBe(true);
    expect(end.finishMs).toBeCloseTo(1_200_000, -3);
    expect(end.deltaMs).toBeCloseTo(-60_000, -3);
  });

  it('finds the ski runs and lifts from the altitude', () => {
    const ride = buildRide({ source: 'fit', samples: skiDay(), sport: 'snow' });
    const runs = detectRuns(ride);
    expect(runs).toHaveLength(3);
    for (const r of runs) {
      expect(r.dropM).toBeGreaterThan(350);
      expect((r.endMs - r.startMs) / 1000).toBeGreaterThan(150);
      expect((r.endMs - r.startMs) / 1000).toBeLessThan(260);
    }
    expect(runAt(runs, runs[1].startMs + 10_000).phase).toBe('run');
    expect(runAt(runs, runs[1].endMs + 60_000).phase).toBe('lift');
    expect(runAt(runs, T0).phase).toBe('before');
    expect(slopeDegrees(100)).toBeCloseTo(45, 6);
    expect(verticalSpeedAt(ride, T0 + 200_000)).toBeCloseTo(3600, -2);
  });

  it('lists the gadgets per sport, with names and file slugs in every language', () => {
    expect(overlaySports('pace')).toEqual(['running']);
    expect(overlaySports('map')).toContain('snow');
    expect(overlaySports('dialSpeed')).toEqual(['cycling']);
    const run = buildRide({ source: 'fit', samples: steadyRun(), sport: 'running' });
    const ids = overlaysForSport(run, 'running').map((o) => o.id);
    expect(ids).toEqual(expect.arrayContaining(['pace', 'runDialPace', 'runSplits', 'runGhost', 'heartRate']));
    expect(ids).not.toContain('speed');
    for (const id of ['pace', 'runDialHeartRate', 'runSplits', 'runGhost', 'slope', 'snowDialSpeed', 'snowRuns'] as OverlayId[]) {
      for (const lang of ['en', 'pt', 'fr', 'es', 'de'] as const) {
        expect(overlayLabel(id, lang)).not.toMatch(/^metric\.|^overlay\./);
        expect(overlayFileSlug(id, lang)).toMatch(/^[a-z0-9-]+$/);
      }
    }
    expect(overlayFileSlug('runDialHeartRate', 'pt')).toBe('corrida-mostrador-fc');
    expect(overlayFileSlug('dialHeartRate', 'pt')).not.toBe(overlayFileSlug('runDialHeartRate', 'pt'));
  });

  it('draws the ski run gadgets on a ski day', () => {
    registerEmbeddedFonts();
    const ride = buildRide({ source: 'fit', samples: skiDay(), sport: 'snow' });
    const runs = detectRuns(ride);
    const t = runs[1].startMs + 60_000;
    for (const id of ['snowRunLive', 'snowRuns'] as OverlayId[]) {
      const def = getOverlay(id);
      const style = { ...DEFAULT_STYLE, scale: 1 };
      const { width, height } = overlayPixelSize(def, style);
      const c = createCanvas(width, height);
      const ctx = c.getContext('2d');
      renderOverlayFrame(ctx as unknown as Ctx2D, def, t, style, { ride, clipStart: t - 1000, clipEnd: t + 10_000 });
      const data = ctx.getImageData(0, 0, width, height).data;
      let opaque = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) opaque++;
      expect(opaque).toBeGreaterThan(width * height * 0.05);
    }
  });
});
