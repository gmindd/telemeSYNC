import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { buildRide, parseFit } from '../src/index.ts';
import { cumulativeGain, cumulativeLoss } from '../src/metrics/elevation.ts';
import { dialFamily, isDialOverlay } from '../src/overlays/dial/index.ts';
import { availableOverlays, OVERLAYS, overlayFileSlug, overlayLabel, overlayPixelSize, renderOverlayFrame } from '../src/overlays/registry.ts';
import { LANGS } from '../src/i18n/index.ts';
import { DEFAULT_STYLE, type Ctx2D } from '../src/overlays/types.ts';
import { registerEmbeddedFonts } from '../src/node/index.ts';
import { encodeFit, syntheticRide } from './helpers/synthetic.ts';

const synth = syntheticRide();
const ride = buildRide(parseFit(encodeFit(synth.samples)));
const t = synth.climb.startT + 60_000;

describe('mostradores (dial gadgets)', () => {
  registerEmbeddedFonts();

  it('elevation loss counts descents above the noise threshold, like the gain counts climbs', () => {
    const alt = Float64Array.from([100, 101, 104, 110, 108, 103, 103.5, 96]);
    const loss = cumulativeLoss(alt);
    // 110 → 103 and 103 → 96; the 2 m dip and the 0.5 m bump are noise.
    expect(loss.at(-1)).toBeCloseTo(14, 9);
    expect([...loss].every((v, i) => i === 0 || v >= loss[i - 1])).toBe(true);
    expect(cumulativeLoss(Float64Array.from([10, 20, 30, 40])).at(-1)).toBe(0);
    expect(cumulativeGain(alt).at(-1)).toBeCloseTo(10, 9);
  });

  it('every dial has its own file name and is grouped apart from the other gadgets', () => {
    for (const d of dialFamily) {
      expect(isDialOverlay(d.id)).toBe(true);
    }
    expect(isDialOverlay('speed')).toBe(false);
    for (const lang of LANGS) {
      for (const d of OVERLAYS) {
        expect(overlayFileSlug(d.id, lang)).toMatch(/^[a-z-]+$/);
        expect(overlayLabel(d.id, lang)).not.toMatch(/undefined|metric\./);
      }
      expect(new Set(OVERLAYS.map((d) => overlayFileSlug(d.id, lang))).size).toBe(OVERLAYS.length);
    }
    expect(overlayFileSlug('dialHeartRate', 'pt')).toBe('mostrador-fc');
    expect(overlayFileSlug('panelGrade', 'pt')).toBe('painel-inclinacao');
    expect(overlayFileSlug('dialTime', 'en')).toBe('dial-time');
    expect(overlayLabel('panelHeartRate', 'en')).toBe('Panel · Heart rate');
  });

  it('only dials whose metric is in the file are offered, and the compact panel still draws', () => {
    const noPower = { ...ride, available: new Set([...ride.available].filter((k) => k !== 'power' && k !== 'heartRate')) };
    const ids = availableOverlays(noPower).map((d) => d.id);
    expect(ids).not.toContain('dialPower');
    expect(ids).not.toContain('dialHeartRate');
    expect(ids).toContain('dialSummary');
    const def = dialFamily.find((d) => d.id === 'dialSummary')!;
    const style = { ...DEFAULT_STYLE, scale: 1 };
    const { width, height } = overlayPixelSize(def, style);
    const c = createCanvas(width, height);
    renderOverlayFrame(c.getContext('2d') as unknown as Ctx2D, def, t, style, { ride: noPower, clipStart: t, clipEnd: t + 5000 });
    const data = c.getContext('2d').getImageData(0, 0, width, height).data;
    expect(data[3]).toBe(0);
    expect(data[((height >> 1) * width + (width >> 1)) * 4 + 3]).toBeGreaterThan(0);
  });

  it('draws before the ride starts without throwing (arcs empty, numbers as dashes)', () => {
    const style = { ...DEFAULT_STYLE, scale: 1 };
    for (const def of dialFamily.filter((d) => ride.available.has(d.requires))) {
      const { width, height } = overlayPixelSize(def, style);
      const c = createCanvas(width, height);
      const before = ride.startTime - 60_000;
      expect(() => renderOverlayFrame(c.getContext('2d') as unknown as Ctx2D, def, before, style, { ride, clipStart: before, clipEnd: before + 5000 })).not.toThrow();
    }
  });
});
