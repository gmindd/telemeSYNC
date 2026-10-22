import type { Translations } from '@telemesync/core';
import { APP } from './msg/app.ts';
import { CLIPS } from './msg/clips.ts';
import { OVERLAYS_MSG } from './msg/overlays.ts';
import { RENDER } from './msg/render.ts';
import { SYNC } from './msg/sync.ts';

/** Every text of the app, as tuples in the order en, pt, fr, es, de. */
export const MESSAGES = {
  ...APP,
  ...CLIPS,
  ...SYNC,
  ...OVERLAYS_MSG,
  ...RENDER,
} as const satisfies Record<string, Translations>;

export type MessageKey = keyof typeof MESSAGES;
