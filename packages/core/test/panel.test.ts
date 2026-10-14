import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { buildRide, parseFit, sampleAt } from '../src/index.ts';
import { DEFAULT_STYLE, type Ctx2D } from '../src/overlays/types.ts';
import { getOverlay, overlayPixelSize, renderOverlayFrame } from '../src/overlays/registry.ts';
import { mixColor, parseColor } from '../src/overlays/panel/paint.ts';
import { chartRange, gaugeRange, PANEL_METRIC_INFO, panelOptions, statsUpTo, windowSeries } from '../src/overlays/panel/series.ts';
import { registerEmbeddedFonts } from '../src/node/index.ts';
import { encodeFit, syntheticRide } from './helpers/synthetic.ts';

const synth = syntheticRide();
const ride = buildRide(parseFit(encodeFit(synth.samples)));
const t = synth.climb.startT + 60_000;

describe('dashboard panels', () => {
  registerEmbeddedFonts();

  it('chart metric defaults to the panel metric and falls back when missing from the ride', () => {
    expect(panelOptions('speed', DEFAULT_STYLE, ride)).toEqual({ chart: 'speed', window: 'time' });
    const style = { ...DEFAULT_STYLE, panels: { speed: { chart: 'altitude' as const, window: 'distance' as const } } };
    expect(panelOptions('speed', style, ride)).toEqual({ chart: 'altitude', window: 'distance' });
    const noRide = { ...ride, available: new Set([...ride.available].filter((k) => k !== 'altitude')) };
    expect(panelOptions('speed', style, noRide).chart).toBe('speed');
  });

  it('time window covers the last N minutes and ends at the current instant', () => {
    const s = sampleAt(ride, t);
    const w = windowSeries(ride, PANEL_METRIC_INFO.speed, { chart: 'speed', window: 'time' }, { ...DEFAULT_STYLE, chartMinutes: 1 }, s);
    expect(w.len).toBe(60_000);
    expect(w.xs.at(-1)).toBe(1);
    expect(w.xs.filter((x) => x >= 0).length).toBeGreaterThan(10);
  });

  it('distance window is measured on ride distance', () => {
    const s = sampleAt(ride, t);
    const w = windowSeries(ride, PANEL_METRIC_INFO.altitude, { chart: 'altitude', window: 'distance' }, { ...DEFAULT_STYLE, chartDistance: 0.5 }, s);
    expect(w.len).toBe(500);
    expect(w.start).toBeCloseTo(s.distance - 500, 6);
  });

  it('ride-so-far stats only look backwards', () => {
    const i = sampleAt(ride, t).index;
    const st = statsUpTo(ride, PANEL_METRIC_INFO.speed, i);
    let max = -Infinity;
    for (let k = 0; k <= i; k++) max = Math.max(max, ride.speed[k]);
    expect(st.max).toBeCloseTo(max, 9);
    expect(st.avg).toBeGreaterThan(0);
    expect(st.avg).toBeLessThanOrEqual(st.max);
  });

  it('gauge range starts at 0 for zero-based metrics and is symmetric for grade', () => {
    expect(gaugeRange(ride, PANEL_METRIC_INFO.speed, DEFAULT_STYLE).min).toBe(0);
    const g = gaugeRange(ride, PANEL_METRIC_INFO.grade, DEFAULT_STYLE);
    expect(g.min).toBe(-g.max);
  });

  it('chart range respects the minimum span and snaps to nice steps', () => {
    const r = chartRange([100, 101], PANEL_METRIC_INFO.altitude, false);
    expect(r.hi - r.lo).toBeGreaterThanOrEqual(20);
    expect(r.lo % 5).toBe(0);
  });

  it('colours mix between the two gradient stops', () => {
    expect(parseColor('#ff0000')).toEqual([255, 0, 0, 1]);
    expect(mixColor('#000000', '#ffffff', 0.5)).toBe('rgba(128,128,128,1)');
  });

  it('panel with another chart metric and a distance window draws', () => {
    const style = { ...DEFAULT_STYLE, scale: 1, panels: { speed: { chart: 'altitude' as const, window: 'distance' as const } } };
    const def = getOverlay('panelSpeed');
    const { width, height } = overlayPixelSize(def, style);
    const c = createCanvas(width, height);
    const ctx = c.getContext('2d');
    renderOverlayFrame(ctx as unknown as Ctx2D, def, t, style, { ride, clipStart: t - 1000, clipEnd: t + 10_000 });
    const data = ctx.getImageData(0, 0, width, height).data;
    let opaque = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) opaque++;
    expect(opaque).toBeGreaterThan(width * height * 0.3);
    expect(data[3]).toBe(0);
  });
});
