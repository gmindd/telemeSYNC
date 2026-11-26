import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { buildRide, parseFit, parseGpx } from '../src/index.ts';
import { LANGS } from '../src/i18n/index.ts';
import { bearing, cardinal, formatPace, skiRuns, slopeDegrees, stepsPerMin, toStart, verticalSpeedArray } from '../src/metrics/derived.ts';
import { OVERLAYS, getOverlay, overlayCategory, overlayFileSlug, overlayLabel, overlayPixelSize, renderOverlayFrame, suitsSport, themeOverlays } from '../src/overlays/registry.ts';
import { offeredThemes, THEMES, type KitThemeId } from '../src/overlays/themes.ts';
import { resolveLayout } from '../src/overlays/layout.ts';
import { DEFAULT_STYLE, sportOf, type Ctx2D } from '../src/overlays/types.ts';
import { sampleAt, type RideData } from '../src/telemetry/ride.ts';
import { registerEmbeddedFonts } from '../src/node/index.ts';
import { encodeFit, encodeGpx, syntheticRide } from './helpers/synthetic.ts';
import { DEFAULT_WATCH, fieldValue, lapStarts, watchOptions } from '../src/overlays/minimal/gpsWatch.ts';

const synth = syntheticRide();
const ride = buildRide(parseFit(encodeFit(synth.samples)));
registerEmbeddedFonts();

const KIT: KitThemeId[] = ['hud', 'minimal', 'tv', 'cyber', 'ice', 'outdoor'];

describe('theme registry and organisation', () => {
  it('lists every theme once, with names and leads in every language', () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
    for (const t of THEMES) for (const s of [...t.name, ...t.lead]) expect(s.length).toBeGreaterThan(1);
  });

  it('offers Default first, then the themes made for the sport, and themes in testing only on request', () => {
    expect(offeredThemes('running', false)).toEqual(THEMES.filter((t) => t.status === 'stable').map((t) => t.id).sort((a, b) => (a === 'default' ? -1 : b === 'default' ? 1 : 0)));
    const all = offeredThemes('snow', true);
    expect(all[0]).toBe('default');
    expect(all[1]).toBe('ice');
    expect(all).toContain('glass');
    expect(offeredThemes('running', true).slice(1, 3)).toContain('minimal');
  });

  it('every kit theme has the same standard gadgets, in the same categories', () => {
    for (const th of KIT) {
      const ids = OVERLAYS.filter((o) => o.theme === th).map((o) => o.id);
      for (const role of ['speed', 'pace', 'heartRate', 'power', 'grade', 'altitude', 'distance', 'time', 'map', 'profile', 'summary', 'compass']) {
        expect(ids, `${th}.${role}`).toContain(`${th}.${role}`);
      }
      expect(overlayCategory(`${th}.speed`)).toBe('dials');
      expect(overlayCategory(`${th}.map`)).toBe('maps');
      expect(overlayCategory(`${th}.summary`)).toBe('panels');
      expect(overlayCategory(`${th}.compass`)).toBe('nav');
    }
    expect(overlayCategory('hud.hud')).toBe('extras');
    // Gadgets made before the kit keep a sensible category.
    expect(overlayCategory('dialSpeed')).toBe('dials');
    expect(overlayCategory('panelSpeed')).toBe('panels');
    expect(overlayCategory('dialMap')).toBe('maps');
    expect(overlayCategory('speed')).toBe('numbers');
    expect(overlayCategory('glassHeartRateZone')).toBe('extras');
  });

  it('shows pace for running and speed for cycling, ski runs only for ski', () => {
    const cycling = themeOverlays(ride, 'minimal', 'cycling').map((d) => d.id);
    const running = themeOverlays(ride, 'minimal', 'running').map((d) => d.id);
    expect(cycling).toContain('minimal.speed');
    expect(cycling).not.toContain('minimal.pace');
    expect(running).toContain('minimal.pace');
    expect(running).toContain('minimal.steps');
    expect(running).not.toContain('minimal.cadence');
    expect(themeOverlays(ride, 'ice', 'snow').map((d) => d.id)).toContain('ice.runs');
    expect(suitsSport(getOverlay('ice.runs'), 'cycling')).toBe(false);
    // Gadgets without a sport list are in the cycling catalogue only (main's rule).
    expect(suitsSport(getOverlay('dialSpeed'), 'running')).toBe(false);
    expect(suitsSport(getOverlay('hud.heartRate'), 'snow')).toBe(true);
  });

  it('names and file names are unique in every language', () => {
    for (const lang of LANGS) {
      for (const th of KIT) for (const d of OVERLAYS.filter((o) => o.theme === th)) expect(overlayLabel(d.id, lang)).not.toMatch(/undefined|kit\.|metric\.|overlay\./);
      expect(new Set(OVERLAYS.map((d) => overlayFileSlug(d.id, lang))).size).toBe(OVERLAYS.length);
    }
    expect(overlayLabel('hud.speed', 'pt')).toBe('HUD aviação · Velocidade');
    expect(overlayFileSlug('ice.speed', 'pt')).toBe('gelo-velocidade');
  });

  it('places kit maps top-right and profile strips along the bottom', () => {
    const l = resolveLayout(['tv.speed', 'tv.map', 'tv.lowerThird'], {}, 16 / 9, { ...DEFAULT_STYLE, scale: 1 });
    expect(l['tv.map'].x).toBeGreaterThan(0.5);
    expect(l['tv.lowerThird'].y).toBeGreaterThan(0.5);
  });
});

describe('kit themes draw', () => {
  it('every kit gadget draws before the start and mid-ride, identically twice, with transparent corners', () => {
    const style = { ...DEFAULT_STYLE, scale: 1 };
    const t = synth.climb.startT + 60_000;
    const octx = { ride, clipStart: t - 5000, clipEnd: t + 25_000 };
    for (const th of KIT) {
      for (const def of OVERLAYS.filter((o) => o.theme === th)) {
        const { width, height } = overlayPixelSize(def, style);
        const c = createCanvas(width, height);
        const ctx = c.getContext('2d') as unknown as Ctx2D;
        renderOverlayFrame(ctx, def, ride.startTime - 10_000, style, octx);
        renderOverlayFrame(ctx, def, t, style, octx);
        const a = c.toBuffer('image/png');
        renderOverlayFrame(ctx, def, t, style, octx);
        expect(c.toBuffer('image/png').equals(a), def.id).toBe(true);
        const corners = [c.getContext('2d').getImageData(0, 0, 1, 1).data[3], c.getContext('2d').getImageData(width - 1, height - 1, 1, 1).data[3]];
        expect(corners, def.id).toEqual([0, 0]);
      }
    }
  });

});

describe('GPS watch (Minimal Pro)', () => {
  it('cleans its options: 3 or 4 known fields, modes that suit each metric, else the default screen', () => {
    expect(watchOptions({}).fields).toEqual(DEFAULT_WATCH.fields);
    expect(watchOptions({ watch: { fields: [{ metric: 'pace', mode: 'now' }], hrGauge: true } }).fields).toEqual(DEFAULT_WATCH.fields);
    const w = watchOptions({
      watch: {
        fields: [
          { metric: 'clock', mode: 'avg' },
          { metric: 'pace', mode: 'lap' },
          { metric: 'nope' as never, mode: 'now' },
          { metric: 'distance', mode: 'max' },
          { metric: 'heartRate', mode: 'max' },
        ],
        hrGauge: false,
      },
    });
    expect(w.fields).toEqual([
      { metric: 'clock', mode: 'now' },
      { metric: 'pace', mode: 'lap' },
      { metric: 'distance', mode: 'now' },
      { metric: 'heartRate', mode: 'max' },
    ]);
    expect(w.hrGauge).toBe(false);
  });

  it('laps every kilometre when the file has none, and shows now, average, lap and maximum', () => {
    const starts = lapStarts(ride, false);
    expect(starts[0]).toBe(0);
    expect(starts.length).toBe(Math.floor(ride.totals.distanceM / 1000) + 1);
    const s = sampleAt(ride, synth.climb.startT + 60_000);
    const style = { ...DEFAULT_STYLE, language: 'en' as const };
    const v = (metric: 'heartRate' | 'lap' | 'distance', mode: 'now' | 'avg' | 'lap' | 'max') => fieldValue({ metric, mode }, s, style, ride);
    expect(v('heartRate', 'now').label).toBe('HR');
    expect(v('heartRate', 'avg').label).toBe('AVG HR');
    expect(v('heartRate', 'lap').label).toBe('LAP HR');
    expect(Number(v('heartRate', 'max').value)).toBeGreaterThanOrEqual(Number(v('heartRate', 'avg').value));
    expect(Number(v('lap', 'now').value)).toBeGreaterThan(1);
    expect(parseFloat(v('distance', 'lap').value)).toBeLessThan(1.001);
  });
});

describe('sport', () => {
  it('follows the sport the file says (main’s three sports), and the one chosen in step 4', () => {
    expect(buildRide(parseFit(encodeFit(synth.samples, { sport: 'running' }))).sport).toBe('running');
    expect(buildRide(parseFit(encodeFit(synth.samples, { sport: 'alpineSkiing' }))).sport).toBe('snow');
    expect(buildRide(parseFit(encodeFit(synth.samples, { sport: 'cycling' }))).sport).toBe('cycling');
    expect(buildRide(parseGpx(encodeGpx(synth.samples, { type: 'TrailRun' }))).sport).toBe('running');
    expect(ride.sport).toBeUndefined();
    expect(sportOf({}, ride)).toBe('cycling');
    expect(sportOf({ sport: 'snow' }, ride)).toBe('snow');
  });
});

describe('derived metrics', () => {
  it('pace, steps and slope', () => {
    const metric = { system: 'metric' as const, temperature: 'C' as const };
    expect(formatPace(1000 / 292, metric)).toBe(`4'52"`);
    expect(formatPace(0.2, metric)).toBe('—');
    expect(stepsPerMin(88, {})).toBe(176);
    expect(stepsPerMin(176, { sport: 'running' })).toBe(176);
    expect(slopeDegrees(100)).toBeCloseTo(45, 5);
  });

  it('vertical speed follows the altitude', () => {
    const vs = verticalSpeedArray(ride);
    const i = sampleAt(ride, synth.climb.startT + 60_000).index;
    expect(vs[i]).toBeGreaterThan(0);
  });

  it('counts ski runs, ignoring the lifts in between', () => {
    // Two descents of 300 m with a lift back up between them.
    const t0 = Date.UTC(2025, 0, 10, 9);
    const alt: number[] = [];
    for (let k = 0; k <= 100; k++) alt.push(2000 - k * 3);
    for (let k = 1; k <= 100; k++) alt.push(1700 + k * 3);
    for (let k = 1; k <= 100; k++) alt.push(2000 - k * 3);
    const fake = { t: Float64Array.from(alt.map((_, i) => t0 + i * 1000)), altitude: Float64Array.from(alt) } as unknown as RideData;
    const r = skiRuns(fake);
    expect(r.count[50]).toBe(1);
    expect(r.count[alt.length - 1]).toBe(2);
    expect(r.total[alt.length - 1]).toBeCloseTo(600, 0);
    expect(r.drop[alt.length - 1]).toBeCloseTo(300, 0);
  });

  it('bearing and the way back to the start', () => {
    expect(bearing(0, 0, 1, 0)).toBeCloseTo(0, 3);
    expect(bearing(0, 0, 0, 1)).toBeCloseTo(90, 3);
    expect(cardinal(284)).toBe('W');
    const mid = sampleAt(ride, (ride.startTime + ride.endTime) / 2);
    const back = toStart(ride, mid)!;
    expect(back.distance).toBeGreaterThan(0);
    expect(back.bearing).toBeGreaterThanOrEqual(0);
  });
});
