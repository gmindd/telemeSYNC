import { createCanvas, type Canvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { buildRide, parseFit } from '../src/index.ts';
import { LANGS } from '../src/i18n/index.ts';
import { OVERLAYS, overlayFileSlug, overlayLabel, overlayPixelSize, overlayTheme, renderOverlayFrame } from '../src/overlays/registry.ts';
import { resolveLayout } from '../src/overlays/layout.ts';
import { DEFAULT_STYLE, type Ctx2D } from '../src/overlays/types.ts';
import { registerEmbeddedFonts } from '../src/node/index.ts';
import { encodeFit, syntheticRide } from './helpers/synthetic.ts';

const synth = syntheticRide();
const ride = buildRide(parseFit(encodeFit(synth.samples)));
registerEmbeddedFonts();

const glass = OVERLAYS.filter((o) => o.theme === 'glass');

/** Alpha of the pixel at (x, y). */
function alphaAt(c: Canvas, x: number, y: number): number {
  return c.getContext('2d').getImageData(x, y, 1, 1).data[3];
}

describe('Glass theme', () => {
  it('has dials, panels, map, profiles, compact panel and heart-rate chip of its own', () => {
    expect(glass.length).toBe(21);
    for (const id of ['glassSpeed', 'glassPanelPower', 'glassMap', 'glassProfile', 'glassProfileStrip', 'glassSummary', 'glassHeartRateZone'] as const) {
      expect(overlayTheme(id)).toBe('glass');
    }
    expect(overlayTheme('dialSpeed')).toBe('default');
  });

  it('every glass overlay has a name and a unique file name in every language', () => {
    for (const lang of LANGS) {
      for (const d of glass) expect(overlayLabel(d.id, lang)).not.toMatch(/undefined|glass\.|metric\.|overlay\./);
      expect(new Set(OVERLAYS.map((d) => overlayFileSlug(d.id, lang))).size).toBe(OVERLAYS.length);
    }
    expect(overlayLabel('glassPanelSpeed', 'pt')).toBe('Vidro · Painel · Velocidade');
    expect(overlayFileSlug('glassPanelSpeed', 'pt')).toBe('vidro-painel-velocidade');
    expect(overlayFileSlug('glassHeartRateZone', 'en')).toBe('glass-hr-zone');
  });

  it('draws every glass overlay, before the start and during the ride, and draws the same frame twice', () => {
    const style = { ...DEFAULT_STYLE, scale: 1 };
    const t = synth.climb.startT + 60_000;
    for (const def of glass) {
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

  it('is see-through: the glass keeps the video visible and the corners stay transparent', () => {
    const style = { ...DEFAULT_STYLE, scale: 1 };
    const t = synth.climb.startT + 60_000;
    const octx = { ride, clipStart: t - 5000, clipEnd: t + 25_000 };
    for (const id of ['glassSpeed', 'glassPanelSpeed', 'glassSummary'] as const) {
      const def = OVERLAYS.find((o) => o.id === id)!;
      const { width, height } = overlayPixelSize(def, style);
      const c = createCanvas(width, height);
      renderOverlayFrame(c.getContext('2d') as unknown as Ctx2D, def, t, style, octx);
      expect(alphaAt(c, 1, 1), id).toBe(0);
      // A spot of plain glass (no text or lines) is partly transparent, never opaque.
      const x = id === 'glassSpeed' ? width / 2 - 70 : 40;
      const y = id === 'glassSpeed' ? height / 2 + 4 : height / 2 + (id === 'glassSummary' ? 0 : 50);
      const a = alphaAt(c, Math.round(x), Math.round(y));
      expect(a, id).toBeGreaterThan(20);
      expect(a, id).toBeLessThan(200);
    }
  });

  it('places the glass map top-right and the profiles at the bottom by default', () => {
    const style = { ...DEFAULT_STYLE, scale: 1 };
    const l = resolveLayout(['glassSpeed', 'glassMap', 'glassProfileStrip'], {}, 16 / 9, style);
    expect(l.glassMap.x).toBeGreaterThan(0.5);
    expect(l.glassProfileStrip.y).toBeGreaterThan(0.5);
  });
});
