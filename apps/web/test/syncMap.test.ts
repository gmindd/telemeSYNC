import { describe, expect, it } from 'vitest';
import { MAP_ZOOMS, nextZoom } from '../src/lib/mapZoom.ts';

describe('Sync step map zoom', () => {
  it('steps through 50 m … 3.2 km; the automatic size counts as 400 m', () => {
    expect(nextZoom(undefined, -1)).toBe(200);
    expect(nextZoom(undefined, 1)).toBe(800);
    expect(nextZoom(200, -1)).toBe(100);
    expect(nextZoom(50, -1)).toBe(50);
    expect(nextZoom(3200, 1)).toBe(3200);
    expect(nextZoom(300, 1)).toBe(800); // a radius between steps goes to the next one up
    expect(MAP_ZOOMS[0]).toBe(50);
  });
});
