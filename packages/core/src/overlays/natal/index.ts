import type { OverlayDefinition } from '../types.ts';
import { natalCards } from './cards.ts';
import { natalDials } from './dials.ts';
import { natalShapes } from './shapes.ts';

/** Christmas theme: festive versions of the gadgets, shown in their own tab in the app. */
export const natalFamily: OverlayDefinition[] = [...natalDials, ...natalShapes, ...natalCards];
