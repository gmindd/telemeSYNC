import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { buildRide, parseFit } from '../src/index.ts';
import { dialPaint } from '../src/overlays/dial/common.ts';
import { availableOverlays, overlayPixelSize, renderOverlayFrame } from '../src/overlays/registry.ts';
import { DEFAULT_STYLE, type Ctx2D, type OverlayDefinition } from '../src/overlays/types.ts';
import { registerEmbeddedFonts } from '../src/node/index.ts';
import { encodeFit, syntheticRide } from './helpers/synthetic.ts';

const synth = syntheticRide();
const ride = buildRide(parseFit(encodeFit(synth.samples)));
const t = synth.climb.startT + 60_000;

/** Sum of the alpha of every pixel of the gadget drawn with this background opacity (0-1 per pixel). */
function coverage(def: OverlayDefinition, panelOpacity: number): number {
  const style = { ...DEFAULT_STYLE, panelOpacity };
  const { width, height } = overlayPixelSize(def, style);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  renderOverlayFrame(ctx as unknown as Ctx2D, def, t, style, { ride, clipStart: ride.startTime, clipEnd: ride.endTime });
  const d = ctx.getImageData(0, 0, width, height).data;
  let sum = 0;
  for (let i = 3; i < d.length; i += 4) sum += d[i] / 255;
  return sum;
}

describe('background opacity', () => {
  registerEmbeddedFonts();

  it('makes the background of every gadget that has one see-through', () => {
    // Christmas objects (wooden signs, cabin, mug): the object itself stays, only the dark plate behind the
    // number follows the setting, so they are not counted here
    const objects = new Set(['natalSpeedLog', 'natalGrade', 'natalGradeWarning', 'natalAltitudeCabin', 'natalTimeMug', 'natalSummary']);
    let checked = 0;
    for (const def of availableOverlays(ride)) {
      const full = coverage(def, 0.8);
      if (full === 0) continue; // nothing to draw at this moment (segments)
      const none = coverage(def, 0);
      const ratio = none / full;
      // Plain numbers and the route map have no background, so they don't change
      if (/^(panel|dial)/.test(def.id)) expect(ratio, def.id).toBeLessThan(0.3);
      else if (def.id.startsWith('natal') && !objects.has(def.id)) expect(ratio, def.id).toBeLessThan(0.6);
      else continue;
      checked++;
    }
    expect(checked).toBeGreaterThan(30);
  });

  it('keeps the dials as they were at the default opacity', () => {
    const p = dialPaint({ ...DEFAULT_STYLE, panelOpacity: 0.8 });
    expect(p.disc).toBe('rgba(9,12,17,0.92)');
    expect(p.rimAlpha).toBe(1);
    // Over a see-through disc the numbers keep their outline
    expect(dialPaint({ ...DEFAULT_STYLE, panelOpacity: 0.2 }).ts.outlineWidth).toBe(DEFAULT_STYLE.outlineWidth);
  });
});
