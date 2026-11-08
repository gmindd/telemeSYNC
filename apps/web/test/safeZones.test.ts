import { describe, expect, it } from 'vitest';
import { SAFE_ZONES, zoneHit, zonesPath } from '../src/lib/safeZones.ts';

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
});
