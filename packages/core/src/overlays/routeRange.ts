import type { RideData } from '../telemetry/ride.ts';
import { lowerIndex } from '../util/search.ts';
import type { OverlayContext, OverlayStyle } from './types.ts';

// Part of the ride the maps and elevation profiles show (style.mapMode): the whole ride, the clip being
// rendered, the stretch covered by all the clips, or a start and end chosen by the user. For "clips"
// the app fills style.mapRange with the clips' span before drawing; for "custom" it holds the choice.

export interface RouteSpan {
  startMs: number;
  endMs: number;
  /** First and last sample inside the span. */
  i0: number;
  i1: number;
  /** True when the span is the whole ride (nothing to cut). */
  whole: boolean;
}

/** Span of the ride the maps and profiles show with this style, for the clip being drawn. */
export function routeSpan(ride: RideData, style: OverlayStyle, octx: Pick<OverlayContext, 'clipStart' | 'clipEnd'>): RouteSpan {
  const n = ride.t.length;
  let a = ride.startTime;
  let b = ride.endTime;
  const mode = style.mapMode ?? 'full';
  if (mode === 'clip') {
    a = octx.clipStart;
    b = octx.clipEnd;
  } else if ((mode === 'clips' || mode === 'custom') && style.mapRange && style.mapRange.endMs > style.mapRange.startMs) {
    a = style.mapRange.startMs;
    b = style.mapRange.endMs;
  }
  a = Math.max(ride.startTime, Math.min(ride.endTime, a));
  b = Math.max(a, Math.min(ride.endTime, b));
  const i0 = Math.max(0, lowerIndex(ride.t, a));
  let i1 = Math.max(i0, lowerIndex(ride.t, b));
  // Always at least two samples, so a stopped clip still has a line.
  if (i1 === i0 && i1 < n - 1) i1++;
  return { startMs: a, endMs: b, i0, i1, whole: i0 === 0 && i1 === n - 1 };
}
