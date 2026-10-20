import type { OverlayDefinition, OverlayId } from '../types.ts';
import { dialOverlays } from './dials.ts';
import { dialMapOverlay } from './map.ts';
import { dialProfileOverlay } from './profile.ts';
import { dialSummaryOverlay } from './summary.ts';

/** "Mostradores": round gadgets with a chainring rim, round minimap, profile card and compact panel. */
export const dialFamily: OverlayDefinition[] = [...dialOverlays, dialMapOverlay, dialProfileOverlay, dialSummaryOverlay];

const DIAL_IDS = new Set<OverlayId>(dialFamily.map((d) => d.id));

/** True for the overlays of the "Mostradores" family (grouped apart in the app). */
export function isDialOverlay(id: OverlayId): boolean {
  return DIAL_IDS.has(id);
}
