import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { buildRide, parseFit } from '../src/index.ts';
import { LANGS } from '../src/i18n/index.ts';
import { OVERLAYS, overlayFileSlug, overlayLabel, overlayPixelSize, overlayTheme, renderOverlayFrame } from '../src/overlays/registry.ts';
import { DEFAULT_STYLE, type Ctx2D } from '../src/overlays/types.ts';
import { registerEmbeddedFonts } from '../src/node/index.ts';
import { encodeFit, syntheticRide } from './helpers/synthetic.ts';

const synth = syntheticRide();
const ride = buildRide(parseFit(encodeFit(synth.samples)));
registerEmbeddedFonts();

const natal = OVERLAYS.filter((o) => o.theme === 'natal');

describe('Christmas theme', () => {
  it('has its own overlays, apart from the default ones', () => {
    expect(natal.length).toBeGreaterThanOrEqual(15);
    expect(overlayTheme('natalHeartRate')).toBe('natal');
    expect(overlayTheme('dialHeartRate')).toBe('default');
    expect(overlayTheme('speed')).toBe('default');
  });

  it('every Christmas overlay has a name and a unique file name in every language', () => {
    for (const lang of LANGS) {
      for (const d of natal) expect(overlayLabel(d.id, lang)).not.toMatch(/undefined|natal\.|metric\./);
      expect(new Set(OVERLAYS.map((d) => overlayFileSlug(d.id, lang))).size).toBe(OVERLAYS.length);
    }
    expect(overlayLabel('natalSpeedLog', 'pt')).toBe('Natal · Velocidade (tronco)');
    expect(overlayFileSlug('natalSpeedLog', 'pt')).toBe('natal-velocidade-tronco');
    expect(overlayFileSlug('natalHeartRate', 'en')).toBe('xmas-hr');
  });

  it('draws every Christmas overlay, before the start and during the ride, and draws the same frame twice', () => {
    const style = { ...DEFAULT_STYLE, scale: 1 };
    const t = synth.climb.startT + 60_000;
    for (const def of natal) {
      const { width, height } = overlayPixelSize(def, style);
      const c = createCanvas(width, height);
      const ctx = c.getContext('2d') as unknown as Ctx2D;
      const octx = { ride, clipStart: t - 5000, clipEnd: t + 25_000 };
      renderOverlayFrame(ctx, def, ride.startTime - 10_000, style, octx);
      renderOverlayFrame(ctx, def, t, style, octx);
      const a = c.toBuffer('image/png');
      renderOverlayFrame(ctx, def, t, style, octx);
      expect(c.toBuffer('image/png').equals(a), def.id).toBe(true);
    }
  });
});
