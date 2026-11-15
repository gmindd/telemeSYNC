import { describe, expect, it } from 'vitest';
import { avoidZones, SAFE_ZONES, zoneHit, zonesPath } from '../src/overlays/safeZones.ts';

describe('social media safe zones', () => {
  it('every zone sits inside the frame', () => {
    for (const zones of Object.values(SAFE_ZONES)) {
      for (const z of zones) {
        expect(z.x).toBeGreaterThanOrEqual(0);
        expect(z.y).toBeGreaterThanOrEqual(0);
        expect(z.x + z.w).toBeLessThanOrEqual(1 + 1e-9);
        expect(z.y + z.h).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it('a gadget in the middle is clear, one at the bottom or on the button column is covered', () => {
    const middle = { x: 0.3, y: 0.35, w: 0.3, h: 0.1 };
    expect(zoneHit(middle, ['tiktok', 'instagram', 'shorts'])).toBeUndefined();
    expect(zoneHit({ x: 0.05, y: 0.9, w: 0.3, h: 0.08 }, ['instagram'])).toBe('ui');
    expect(zoneHit({ x: 0.88, y: 0.6, w: 0.1, h: 0.05 }, ['tiktok'])).toBe('ui');
    // Above the bottom band but inside the ad template's 35 %: may be covered.
    expect(zoneHit({ x: 0.3, y: 0.7, w: 0.3, h: 0.05 }, ['shorts'])).toBe('maybe');
    expect(zoneHit({ x: 0.05, y: 0.9, w: 0.3, h: 0.08 }, [])).toBeUndefined();
  });

  it('draws one path per shade, nothing without platforms', () => {
    expect(zonesPath([], 'ui')).toBe('');
    expect(zonesPath(['tiktok', 'shorts'], 'ui').match(/M/g)?.length).toBe(6);
  });

  it('moves a gadget dropped on a covered area to the nearest clear spot', () => {
    // On TikTok's bottom band: goes up just above it, same x.
    const bottom = { x: 0.1, y: 0.9, w: 0.3, h: 0.08 };
    const moved = avoidZones(bottom, ['tiktok']);
    expect(moved.x).toBeCloseTo(0.1);
    expect(moved.y).toBeCloseTo(1 - 320 / 1920 - 0.08);
    expect(zoneHit({ ...bottom, ...moved }, ['tiktok'])).not.toBe('ui');
    // On the button column: goes left of it.
    const column = { x: 0.9, y: 0.6, w: 0.08, h: 0.05 };
    const left = avoidZones(column, ['tiktok']);
    expect(left.x + column.w).toBeLessThanOrEqual(1 - 140 / 1080 + 1e-9);
    expect(left.y).toBeCloseTo(0.6);
  });

  it('leaves a clear gadget, or one too big to fit anywhere, where it is', () => {
    expect(avoidZones({ x: 0.3, y: 0.35, w: 0.3, h: 0.1 }, ['tiktok', 'instagram', 'shorts'])).toEqual({ x: 0.3, y: 0.35 });
    expect(avoidZones({ x: 0, y: 0, w: 1, h: 0.95 }, ['tiktok'])).toEqual({ x: 0, y: 0 });
    expect(avoidZones({ x: 0.1, y: 0.9, w: 0.3, h: 0.08 }, [])).toEqual({ x: 0.1, y: 0.9 });
  });
});
