import { describe, expect, it } from 'vitest';
import { shownSize } from '../src/index.ts';

const clip = { meta: { width: 3840, height: 2160 } } as Parameters<typeof shownSize>[0];

describe('camera turned 90°', () => {
  it('swaps width and height of the shown and exported frame; 0° and 180° keep them', () => {
    expect(shownSize(clip, { videoRotation: 90 })).toEqual({ width: 2160, height: 3840 });
    expect(shownSize(clip, { videoRotation: 270 })).toEqual({ width: 2160, height: 3840 });
    expect(shownSize(clip, { videoRotation: 180 })).toEqual({ width: 3840, height: 2160 });
    expect(shownSize(clip, {})).toEqual({ width: 3840, height: 2160 });
    expect(shownSize(clip)).toEqual({ width: 3840, height: 2160 });
  });
});
