import { describe, expect, it } from 'vitest';
import { cropFor, framingMoves, posAt } from '../src/lib/formats.ts';

describe('framing keyframes', () => {
  it('holds the place without keyframes, before the first and after the last', () => {
    expect(posAt([], 0.3, 5)).toBe(0.3);
    const keys = [{ t: 1, pos: 0 }, { t: 3, pos: 1 }];
    expect(posAt(keys, 0.5, 0)).toBe(0);
    expect(posAt(keys, 0.5, 9)).toBe(1);
  });

  it('slides from one keyframe to the next, easing in and out', () => {
    const keys = [{ t: 0, pos: 0 }, { t: 3, pos: 1 }, { t: 5, pos: 0.5 }];
    expect(posAt(keys, 0.5, 1.5)).toBeCloseTo(0.5, 6);
    expect(posAt(keys, 0.5, 0.3)).toBeLessThan(0.1); // slow start
    expect(posAt(keys, 0.5, 2.7)).toBeGreaterThan(0.9); // slow arrival
    expect(posAt(keys, 0.5, 4)).toBeCloseTo(0.75, 6);
    let prev = 0;
    for (let s = 0; s <= 3; s += 0.05) {
      const p = posAt(keys, 0.5, s);
      expect(p).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = p;
    }
  });

  it('moves only when the keyframes differ; the crop follows (1:1 clip into 9:16)', () => {
    expect(framingMoves([{ t: 0, pos: 0.4 }, { t: 2, pos: 0.4 }])).toBe(false);
    expect(framingMoves([{ t: 0, pos: 0 }, { t: 2, pos: 1 }])).toBe(true);
    const left = cropFor('9:16', 1080, 1080, posAt([{ t: 0, pos: 0 }, { t: 3, pos: 1 }], 0.5, 0));
    const right = cropFor('9:16', 1080, 1080, posAt([{ t: 0, pos: 0 }, { t: 3, pos: 1 }], 0.5, 3));
    expect(left).toEqual({ left: 0, top: 0, width: 606, height: 1080 });
    expect(right.left).toBe(1080 - 606);
    expect(right.width).toBe(left.width);
  });
});
