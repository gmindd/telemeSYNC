// The project being edited: clip, ride, gadgets and their places, sync, trim and format. The choices worth keeping
// for the next video (gadgets, places, format, safe zones) are remembered on the phone.
import { create } from 'zustand';
import {
  avoidZones,
  DEFAULT_STYLE,
  gadgetBox,
  resolveLayout,
  type GadgetLayout,
  type GadgetPlacement,
  type OverlayId,
  type OverlayStyle,
  type RideData,
  type SocialPlatform,
} from '@telemesync/core';
import { LANG } from './i18n.ts';
import { cropFor, formatAspect, isVertical, type Crop, type FormatId } from './lib/formats.ts';
import { defaultSelection, detectedStart, offeredOverlays, type LoadedClip } from './lib/project.ts';
import type { VideoInfo } from './lib/render.ts';

export type Screen = 'start' | 'editor' | 'export';
export type Tab = 'gadgets' | 'sync' | 'format';

const PREFS_KEY = 'telemesync-mobile-prefs';
const MAX_DEFAULT_S = 60;

interface Prefs {
  overlays: OverlayId[];
  /** Gadget places per format (a layout made for 9:16 doesn't fit 16:9), see layoutKey. */
  layouts: Record<string, GadgetLayout>;
  format: FormatId;
  platforms: SocialPlatform[];
  blockZones: boolean;
  shortSide: number;
}

function loadPrefs(): Partial<Prefs> {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>;
  } catch {
    return {};
  }
}

export const STYLE: OverlayStyle = { ...DEFAULT_STYLE, language: LANG };

/** Which saved layout a format uses: the clip's own shape counts as vertical or horizontal. */
function layoutKey(format: FormatId, info?: VideoInfo): string {
  return format !== 'original' ? format : info && info.height > info.width ? 'original-v' : 'original-h';
}

interface State extends Prefs {
  /** Places of the gadgets in the current format. */
  layout: GadgetLayout;
  screen: Screen;
  tab: Tab;
  clip?: LoadedClip;
  info?: VideoInfo;
  ride?: RideData;
  /** Clip start found by the core's resolvers (UTC ms), before the adjustment. */
  autoStart?: number;
  offsetS: number;
  trim: { start: number; end: number };
  playheadS: number;
  playing: boolean;
  selected?: OverlayId;
  cropPos: number;

  setScreen(s: Screen): void;
  setTab(t: Tab): void;
  setClip(clip: LoadedClip, info: VideoInfo): void;
  setRide(ride: RideData): void;
  toggleOverlay(id: OverlayId): void;
  select(id?: OverlayId): void;
  place(id: OverlayId, p: GadgetPlacement): void;
  /** Called when a drag ends: keeps the gadget in the frame and, if chosen, out of the covered areas. */
  settle(id: OverlayId, force?: boolean): void;
  settleAll(force?: boolean): void;
  resetPlace(id: OverlayId): void;
  setOffset(s: number): void;
  setTrim(trim: { start: number; end: number }): void;
  setPlayhead(s: number): void;
  setPlaying(p: boolean): void;
  setFormat(f: FormatId): void;
  setCropPos(p: number): void;
  togglePlatform(p: SocialPlatform): void;
  setBlockZones(b: boolean): void;
  setShortSide(s: number): void;
}

const saved = loadPrefs();

export const useProject = create<State>((set, get) => {
  /** Sets the current format's layout and remembers it under its key. */
  const commit = (layout: GadgetLayout) => set({ layout, layouts: { ...get().layouts, [layoutKey(get().format, get().info)]: layout } });
  return {
    screen: 'start',
    tab: 'gadgets',
    offsetS: 0,
    trim: { start: 0, end: 0 },
    playheadS: 0,
    playing: false,
    cropPos: 0.5,
    overlays: saved.overlays ?? [],
    layouts: saved.layouts ?? {},
    layout: {},
    format: saved.format ?? 'original',
    platforms: saved.platforms ?? ['instagram'],
    blockZones: saved.blockZones ?? true,
    shortSide: saved.shortSide ?? 1080,

    setScreen: (screen) => set({ screen }),
    setTab: (tab) => set({ tab }),
    setClip: (clip, info) => {
      const end = Math.min(info.durationS, MAX_DEFAULT_S);
      set({ clip, info, offsetS: 0, trim: { start: 0, end }, playheadS: 0, autoStart: detectedStart(clip, get().ride), layout: get().layouts[layoutKey(get().format, info)] ?? {} });
    },
    setRide: (ride) => {
      const offered = offeredOverlays(ride);
      const kept = get().overlays.filter((id) => offered.includes(id));
      const clip = get().clip;
      set({ ride, overlays: kept.length ? kept : defaultSelection(ride), autoStart: clip ? detectedStart(clip, ride) : undefined });
    },
    toggleOverlay: (id) => {
      const on = get().overlays.includes(id);
      set({ overlays: on ? get().overlays.filter((x) => x !== id) : [...get().overlays, id], selected: on ? undefined : id });
      if (!on) get().settle(id);
    },
    select: (selected) => set({ selected }),
    place: (id, p) => commit({ ...get().layout, [id]: p }),
    settle: (id, force = false) => {
      const s = get();
      const aspect = frameAspect(s);
      const p = resolveLayout(s.overlays, s.layout, aspect, STYLE)[id];
      if (!p) return;
      const box = gadgetBox(id, p, aspect, STYLE);
      let x = Math.min(Math.max(box.x, 0), Math.max(0, 1 - box.w));
      let y = Math.min(Math.max(box.y, 0), Math.max(0, 1 - box.h));
      if ((force || s.blockZones) && isVertical(aspect) && s.platforms.length) ({ x, y } = avoidZones({ ...box, x, y }, s.platforms));
      if (x !== p.x || y !== p.y || !s.layout[id]) commit({ ...s.layout, [id]: { ...p, x, y } });
    },
    settleAll: (force = false) => get().overlays.forEach((id) => get().settle(id, force)),
    resetPlace: (id) => {
      const layout = { ...get().layout };
      delete layout[id];
      commit(layout);
      get().settle(id);
    },
    setOffset: (offsetS) => set({ offsetS }),
    setTrim: (trim) => set({ trim }),
    setPlayhead: (playheadS) => set({ playheadS }),
    setPlaying: (playing) => set({ playing }),
    setFormat: (format) => {
      set({ format, cropPos: 0.5, layout: get().layouts[layoutKey(format, get().info)] ?? {} });
      get().settleAll();
    },
    setCropPos: (cropPos) => set({ cropPos }),
    togglePlatform: (p) => {
      const on = get().platforms.includes(p);
      set({ platforms: on ? get().platforms.filter((x) => x !== p) : [...get().platforms, p] });
      get().settleAll();
    },
    setBlockZones: (blockZones) => {
      set({ blockZones });
      if (blockZones) get().settleAll();
    },
    setShortSide: (shortSide) => set({ shortSide }),
  };
});

// Remember the choices for the next video
useProject.subscribe((s) => {
  const prefs: Prefs = { overlays: s.overlays, layouts: s.layouts, format: s.format, platforms: s.platforms, blockZones: s.blockZones, shortSide: s.shortSide };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable: choices last until the app closes */
  }
});

/** Width / height of the exported frame. */
export function frameAspect(s: Pick<State, 'info' | 'format'>): number {
  return s.info ? formatAspect(s.format, s.info.width, s.info.height) : 9 / 16;
}

export function frameCrop(s: Pick<State, 'info' | 'format' | 'cropPos'>): Crop | undefined {
  return s.info ? cropFor(s.format, s.info.width, s.info.height, s.cropPos) : undefined;
}

/** UTC ms of the clip's first frame, after the adjustment. */
export function clipStart(s: Pick<State, 'autoStart' | 'ride' | 'offsetS'>): number {
  return (s.autoStart ?? s.ride?.startTime ?? 0) + s.offsetS * 1000;
}

/** Gadgets placed in the frame (defaults filled in by the core's layout). */
export function placements(s: Pick<State, 'overlays' | 'layout' | 'info' | 'format'>): Record<OverlayId, GadgetPlacement> {
  return resolveLayout(s.overlays, s.layout, frameAspect(s), STYLE);
}
