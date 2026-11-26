import { buildRide, gadgetStyle } from '@telemesync/core';
import { beforeAll, describe, expect, it } from 'vitest';

// The phone's storage, kept in memory
const store = new Map<string, string>();
const memory = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };

const t0 = Date.UTC(2026, 9, 25, 17, 0, 0);
const ride = (hr: boolean) =>
  buildRide({
    source: 'gpx',
    samples: Array.from({ length: 60 }, (_, i) => ({ t: t0 + i * 1000, lat: 41.6 + i * 1e-5, lon: -8.8, speed: 5, ...(hr ? { heartRate: 140 } : {}) })),
  });

let state: typeof import('../src/state.ts');
beforeAll(async () => {
  Object.defineProperty(globalThis, 'localStorage', { value: memory, configurable: true });
  store.set('telemesync-mobile-prefs', JSON.stringify({ overlays: ['dialSpeed', 'dialHeartRate'], look: { panelOpacity: 0.3, hrZones: [110, 130, 150, 165], hrMax: 0, colorByZone: false, ftp: 280 } }));
  state = await import('../src/state.ts');
});

describe('choices remembered for the next video', () => {
  it('restores the gadgets and the look (background, zones, FTP) saved last time', () => {
    const p = state.useProject.getState();
    p.setRide(ride(true));
    expect(state.useProject.getState().overlays).toEqual(['dialSpeed', 'dialHeartRate']);
    const style = state.styleOf(state.useProject.getState());
    expect(style.panelOpacity).toBe(0.3);
    expect(style.hrZones).toEqual([110, 130, 150, 165]);
    expect(style.ftp).toBe(280);
    expect(style.colorByZone).toBe(false);
  });

  it('a ride without heart rate hides that gadget but keeps it for the next ride', () => {
    state.useProject.getState().setRide(ride(false));
    expect(state.useProject.getState().overlays).toEqual(['dialSpeed']);
    expect(JSON.parse(store.get('telemesync-mobile-prefs')!).overlays).toEqual(['dialSpeed', 'dialHeartRate']);
    state.useProject.getState().setRide(ride(true));
    expect(state.useProject.getState().overlays).toEqual(['dialSpeed', 'dialHeartRate']);
  });

  it('saves changes to the look', () => {
    state.useProject.getState().setLook({ panelOpacity: 0 });
    expect(JSON.parse(store.get('telemesync-mobile-prefs')!).look.panelOpacity).toBe(0);
  });

  it('power shown as the 3 s average, as on the desktop, and kept for the next videos', () => {
    expect(state.styleOf(state.useProject.getState()).powerSmoothing).toBe('instant');
    state.useProject.getState().setLook({ powerSmoothing: '3s' });
    expect(state.styleOf(state.useProject.getState()).powerSmoothing).toBe('3s');
    expect(JSON.parse(store.get('telemesync-mobile-prefs')!).look.powerSmoothing).toBe('3s');
    state.useProject.getState().setLook({ powerSmoothing: 'instant' });
  });

  it('one gadget can have its own background; moving the shared one changes them all again', () => {
    const p = () => state.useProject.getState();
    p().setLook({ panelOpacity: 0.6 });
    p().setGadgetOpacity('dialSpeed', 0.1);
    expect(gadgetStyle(state.styleOf(p()), 'dialSpeed').panelOpacity).toBe(0.1);
    expect(gadgetStyle(state.styleOf(p()), 'dialHeartRate').panelOpacity).toBe(0.6);
    expect(JSON.parse(store.get('telemesync-mobile-prefs')!).look.gadgetOpacity).toEqual({ dialSpeed: 0.1 });
    p().setGadgetOpacity('dialSpeed', undefined);
    expect(gadgetStyle(state.styleOf(p()), 'dialSpeed').panelOpacity).toBe(0.6);
    p().setGadgetOpacity('dialSpeed', 0.1);
    p().setLook({ panelOpacity: 0.4 });
    expect(gadgetStyle(state.styleOf(p()), 'dialSpeed').panelOpacity).toBe(0.4);
    expect(p().look.gadgetOpacity).toEqual({});
  });

  it('units, W/kg and when each gadget appears are kept for the next videos', () => {
    const p = () => state.useProject.getState();
    p().setLook({ units: { system: 'imperial', temperature: 'F' }, powerWkg: true, weightKg: 72 });
    p().setCondition('dialSpeed', { metric: 'speed', above: 30 / 3.6, below: null, hideAfterS: 3 });
    const style = state.styleOf(p());
    expect(style.units).toEqual({ system: 'imperial', temperature: 'F' });
    expect(style.powerWkg).toBe(true);
    expect(style.weightKg).toBe(72);
    expect(style.conditions.dialSpeed?.above).toBeCloseTo(8.333, 2);
    const saved = JSON.parse(store.get('telemesync-mobile-prefs')!).look;
    expect(saved.units.system).toBe('imperial');
    expect(saved.conditions.dialSpeed.metric).toBe('speed');
    p().setCondition('dialSpeed', undefined);
    expect(state.styleOf(p()).conditions).toEqual({});
    p().setLook({ units: { system: 'metric', temperature: 'C' }, powerWkg: false });
  });
});

describe('segments and laps', () => {
  it('marks a segment (start, end) and laps (each crossing), for the segment gadgets', () => {
    const p = () => state.useProject.getState();
    p().setRide(ride(true));
    p().markSegmentStart(t0 + 5000);
    p().markSegmentEnd(t0 + 20_000);
    p().markLap(t0 + 25_000);
    p().markLap(t0 + 35_000);
    p().markLap(t0 + 50_000);
    const segs = p().segments;
    expect(segs.map((g) => [g.kind, g.startMs - t0, g.endMs - t0])).toEqual([
      ['segment', 5000, 20_000],
      ['lap', 25_000, 35_000],
      ['lap', 35_000, 50_000],
    ]);
    expect(state.styleOf(p()).segments).toHaveLength(3);
    // They belong to the ride: a new ride starts without them, and they are not kept as preferences
    expect(JSON.stringify(JSON.parse(store.get('telemesync-mobile-prefs')!))).not.toContain('segment');
    p().setRide(ride(true));
    expect(p().segments).toEqual([]);
    expect(p().segAnchor).toBeUndefined();
  });

  it('a nudge that would leave a segment shorter than half a second is ignored', () => {
    const p = () => state.useProject.getState();
    p().markSegmentStart(t0 + 5000);
    p().markSegmentEnd(t0 + 6000);
    const g = p().segments[0]!;
    p().updateSegment(g.id, { endMs: g.endMs - 1000 });
    expect(p().segments[0]!.endMs).toBe(t0 + 6000);
    p().removeSegment(g.id);
    expect(p().segments).toEqual([]);
  });
});
