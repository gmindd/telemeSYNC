import type { OverlayDefinition } from '../types.ts';
import { hudFamily } from '../hud/index.ts';
import { minimalFamily } from '../minimal/index.ts';
import { tvFamily } from '../tv/index.ts';
import { cyberFamily } from '../cyber/index.ts';
import { iceFamily } from '../ice/index.ts';
import { outdoorFamily } from '../outdoor/index.ts';

/** Gadgets of every theme built from the kit (see kit/kit.ts and themes.ts). */
export const KIT_FAMILIES: OverlayDefinition[] = [...hudFamily, ...minimalFamily, ...tvFamily, ...cyberFamily, ...iceFamily, ...outdoorFamily];
