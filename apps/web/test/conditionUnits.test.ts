import { describe, expect, it } from 'vitest';
import type { Units } from '@telemesync/core';
import { conditionUnit, fromDisplay, toDisplay } from '../src/lib/conditionUnits.ts';

const metric: Units = { system: 'metric', temperature: 'C' };
const imperial: Units = { system: 'imperial', temperature: 'F' };

describe('condition values in the user’s units', () => {
  it('speed in km/h or mph, stored in m/s', () => {
    expect(fromDisplay('speed', '36', metric)).toBeCloseTo(10);
    expect(toDisplay('speed', 10, metric)).toBe('36');
    expect(toDisplay('speed', 10, imperial)).toBe('22.4');
    expect(conditionUnit('speed', imperial)).toBe('mph');
  });

  it('pace as m:ss per km or mile, stored in s/km', () => {
    expect(fromDisplay('pace', '5:00', metric)).toBe(300);
    expect(fromDisplay('pace', '5', metric)).toBe(300);
    expect(toDisplay('pace', 300, metric)).toBe('5:00');
    expect(toDisplay('pace', 300, imperial)).toBe('8:03'); // 5:00 /km = 8:03 /mi
    expect(fromDisplay('pace', '8:03', imperial)).toBeCloseTo(300, 0);
    expect(fromDisplay('pace', '5:', metric)).toBeUndefined();
  });

  it('negative gradient, comma decimals, °F and empty fields', () => {
    expect(fromDisplay('grade', '-5', metric)).toBe(-5);
    expect(fromDisplay('grade', '-4,9', metric)).toBe(-4.9);
    expect(fromDisplay('grade', '-', metric)).toBeUndefined(); // still typing
    expect(fromDisplay('temperature', '86', imperial)).toBeCloseTo(30);
    expect(fromDisplay('heartRate', '', metric)).toBeNull();
    expect(toDisplay('heartRate', null, metric)).toBe('');
  });
});
