import type { OverlayDefinition } from '../types.ts';
import { glassCards } from './cards.ts';
import { glassDials } from './dials.ts';
import { glassPanels } from './panels.ts';

/** Glass theme: frosted, see-through versions of the dials, panels, map and cards, in their own tab in the app. */
export const glassFamily: OverlayDefinition[] = [...glassDials, ...glassPanels, ...glassCards];

export { glassPanelMetricOf, GLASS_PANEL_IDS } from './panels.ts';
