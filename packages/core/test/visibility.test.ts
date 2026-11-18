import { createCanvas } from '@napi-rs/canvas';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildRide,
  compositeFrameKey,
  defaultCondition,
  DEFAULT_STYLE,
  drawComposite,
  FADE_MS,
  gadgetOpacity,
  getOverlay,
  ownConditionMetric,
  parseProject,
  PROJECT_VERSION,
  serializeProject,
  validCondition,
  type Ctx2D,
  type GadgetCondition,
  type GadgetPlacement,
  type OverlayId,
  type OverlayStyle,
} from '../src/index.ts';
import { registerEmbeddedFonts, renderOverlay } from '../src/node/index.ts';

// 3 min going north: 5 m/s, then 10 m/s from 60 s to 120 s, then 5 m/s. Flat, then up 8 % from 60 s to 120 s,
// then down 8 %; heart rate 150, 175 from 60 s to 120 s.
const t0 = Date.UTC(2026, 10, 1, 9, 0, 0);
let dist = 0;
const ride = buildRide({
  source: 'gpx',
  samples: Array.from({ length: 181 }, (_, i) => {
    const v = i > 60 && i <= 120 ? 10 : 5;
    dist += i ? v : 0;
    const climb = i <= 60 ? 0 : i <= 120 ? (i - 60) * v * 0.08 : 60 * 10 * 0.08 - (i - 120) * 5 * 0.08;
    return { t: t0 + i * 1000, lat: 41.6 + dist / 110_540, lon: -8.8, altitude: 100 + climb, heartRate: i > 60 && i <= 120 ? 175 : 150 };
  }),
});
const at = (s: number) => t0 + s * 1000;
const styleWith = (id: string, c: GadgetCondition): OverlayStyle => ({ ...DEFAULT_STYLE, conditions: { [id]: c } });

describe('gadget conditions (appear / disappear)', () => {
  it('speed only above 30 km/h: hidden, fades in, stays the hiding delay after, then fades out', () => {
    const st = styleWith('speed', { metric: 'speed', above: 30 / 3.6, below: null, hideAfterS: 3 });
    expect(gadgetOpacity('speed', at(30), st, ride)).toBe(0);
    expect(gadgetOpacity('speed', at(90), st, ride)).toBe(1);
    expect(gadgetOpacity('speed', at(170), st, ride)).toBe(0);
    // Find the moments it appears and disappears: a fade of FADE_MS each, and the delay at the end.
    let on = 0;
    let off = 0;
    for (let ms = at(40); ms < at(160); ms += 50) {
      const a = gadgetOpacity('speed', ms, st, ride);
      if (!on && a > 0) on = ms;
      if (on && a > 0) off = ms;
    }
    expect(gadgetOpacity('speed', on + FADE_MS / 2, st, ride)).toBeGreaterThan(0.3);
    expect(gadgetOpacity('speed', on + FADE_MS / 2, st, ride)).toBeLessThan(0.8);
    expect((off - on) / 1000).toBeGreaterThan(60 + 3 - 10); // the fast minute plus the delay (speed is smoothed)
    // Gadgets without a condition are always shown.
    expect(gadgetOpacity('heartRate', at(30), st, ride)).toBe(1);
  });

  it('gradient outside −5 % … +5 %: shown climbing and descending, hidden on the flat', () => {
    const st = styleWith('grade', { metric: 'grade', above: 5, below: -5, hideAfterS: 2 });
    expect(gadgetOpacity('grade', at(20), st, ride)).toBe(0);
    expect(gadgetOpacity('grade', at(90), st, ride)).toBe(1);
    expect(gadgetOpacity('grade', at(150), st, ride)).toBe(1);
  });

  it('heart rate above 170 bpm, and a gadget that shows another metric (the map, by speed)', () => {
    const st: OverlayStyle = { ...DEFAULT_STYLE, conditions: { heartRate: { metric: 'heartRate', above: 170, below: null, hideAfterS: 0 }, map: { metric: 'speed', above: 8, below: null, hideAfterS: 0 } } };
    expect(gadgetOpacity('heartRate', at(30), st, ride)).toBe(0);
    expect(gadgetOpacity('heartRate', at(90), st, ride)).toBe(1);
    expect(gadgetOpacity('map', at(90), st, ride)).toBe(1);
    expect(gadgetOpacity('map', at(150), st, ride)).toBe(0);
  });

  it('pace faster than 2:00 /km (below 120 s/km) works for running gadgets', () => {
    const st = styleWith('pace', { metric: 'pace', above: null, below: 120, hideAfterS: 0 });
    expect(gadgetOpacity('pace', at(30), st, ride)).toBe(0); // 5 m/s = 3:20 /km
    expect(gadgetOpacity('pace', at(100), st, ride)).toBe(1); // 10 m/s = 1:40 /km
  });

  it('each gadget knows its own metric and gets a sensible default; bad conditions are dropped', () => {
    expect(ownConditionMetric('runDialPace')).toBe('pace');
    expect(ownConditionMetric('snowDialSlope')).toBe('slope');
    expect(ownConditionMetric('panelPower')).toBe('power');
    expect(ownConditionMetric('dialMap')).toBeUndefined();
    expect(defaultCondition('grade')).toMatchObject({ metric: 'grade', above: 5, below: -5 });
    expect(defaultCondition('dialMap').metric).toBe('speed');
    expect(validCondition({ metric: 'speed', above: null, below: null })).toBeUndefined();
    expect(validCondition({ metric: 'nope', above: 3 })).toBeUndefined();
    expect(validCondition({ metric: 'speed', above: 8, hideAfterS: 99999 })?.hideAfterS).toBe(600);
  });

  it('projects keep the conditions', () => {
    const style = styleWith('speed', { metric: 'speed', above: 8, below: null, hideAfterS: 5 });
    const p = parseProject(serializeProject({ version: PROJECT_VERSION, name: 'x', cameras: [], clips: [], overlays: ['speed'], style, output: { format: 'prores' } }));
    expect(p.style.conditions.speed).toEqual({ metric: 'speed', above: 8, below: null, hideAfterS: 5 });
  });

  it('the composite leaves a hidden gadget out and draws a fading one paler', () => {
    registerEmbeddedFonts();
    const st = styleWith('speed', { metric: 'speed', above: 30 / 3.6, below: null, hideAfterS: 0 });
    const W = 300;
    const ink = (t: number) => {
      const c = createCanvas(W, W);
      const ctx = c.getContext('2d');
      const layer = (w: number, h: number) => createCanvas(w, h).getContext('2d') as unknown as Ctx2D & { canvas: unknown };
      drawComposite(ctx as unknown as Ctx2D, ['speed'], { speed: { x: 0.1, y: 0.1, w: 0.8 } } as Record<OverlayId, GadgetPlacement>, t, st, { ride, clipStart: t, clipEnd: t + 1000 }, W, W, layer);
      const d = ctx.getImageData(0, 0, W, W).data;
      let a = 0;
      for (let i = 3; i < d.length; i += 4) a += d[i];
      return a;
    };
    expect(ink(at(30))).toBe(0);
    let on = at(40);
    while (gadgetOpacity('speed', on, st, ride) === 0) on += 50;
    const half = ink(on + FADE_MS / 2);
    const full = ink(at(90));
    expect(half).toBeGreaterThan(full * 0.2);
    expect(half).toBeLessThan(full * 0.8);
    // Frame keys: hidden and shown stretches can be reused, fades cannot.
    expect(compositeFrameKey(['speed'], at(30), at(0), st, ride)).not.toBe(compositeFrameKey(['speed'], at(90), at(0), st, ride));
  });

  it('a separate gadget video is transparent while hidden', async () => {
    const out = join(mkdtempSync(join(tmpdir(), 'tsync-vis-')), 'speed');
    const st = styleWith('speed', { metric: 'speed', above: 30 / 3.6, below: null, hideAfterS: 0 });
    // 2 frames: one hidden (30 s), one shown (90 s), as a PNG sequence.
    await renderOverlay({ def: getOverlay('speed'), style: st, octx: { ride, clipStart: at(30), clipEnd: at(91) }, durationMs: 60_000, fps: { num: 1, den: 60 }, frames: 2, outPath: out, format: 'png' });
    const files = readdirSync(out).sort();
    expect(files).toHaveLength(2);
    const { loadImage } = await import('@napi-rs/canvas');
    const alphaSum = async (f: string) => {
      const img = await loadImage(readFileSync(join(out, f)));
      const c = createCanvas(img.width, img.height);
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, img.width, img.height).data;
      let a = 0;
      for (let i = 3; i < d.length; i += 4) a += d[i];
      return a;
    };
    expect(await alphaSum(files[0])).toBe(0);
    expect(await alphaSum(files[1])).toBeGreaterThan(0);
  });
});
