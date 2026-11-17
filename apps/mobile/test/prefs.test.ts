import { buildRide } from '@telemesync/core';
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
});
