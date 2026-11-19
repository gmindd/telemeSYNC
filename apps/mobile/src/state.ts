// The project being edited: clip, ride, gadgets and their places, sync, trim and format. The choices worth keeping
// for the next video (gadgets, places, format, safe zones, look and zones, map zoom) are remembered on the phone.
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
  type Streets,
} from '@telemesync/core';
import { LANG } from './i18n.ts';
import { cropFor, formatAspect, isVertical, posAt, type Crop, type CropKey, type FormatId } from './lib/formats.ts';
import { defaultSelection, detectedStart, offeredOverlays, type LoadedClip } from './lib/project.ts';
import type { VideoInfo } from './lib/render.ts';

export type Screen = 'start' | 'editor' | 'export';
export type Tab = 'gadgets' | 'sync' | 'format';

const PREFS_KEY = 'telemesync-mobile-prefs';
const MAX_DEFAULT_S = 60;

/** Gadget settings kept between videos (the desktop's look and zones). */
export type Look = Pick<OverlayStyle, 'panelOpacity' | 'hrZones' | 'hrMax' | 'colorByZone' | 'ftp'>;
const LOOK_KEYS: (keyof Look)[] = ['panelOpacity', 'hrZones', 'hrMax', 'colorByZone', 'ftp'];

interface Prefs {
  /** Gadgets chosen, including ones the current ride can't show (they come back with a ride that can). */
  overlays: OverlayId[];
  /** Gadget places per format (a layout made for 9:16 doesn't fit 16:9), see layoutKey. */
  layouts: Record<string, GadgetLayout>;
  format: FormatId;
  platforms: SocialPlatform[];
  blockZones: boolean;
  shortSide: number;
  /** Radius of the round map around the rider (m): the Sync tab's map and the map gadget. */
  mapZoomM: number;
  look: Look;
}

function loadPrefs(): Partial<Prefs> {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>;
  } catch {
    return {};
  }
}

export const STYLE: OverlayStyle = { ...DEFAULT_STYLE, language: LANG };

export const DEFAULT_LOOK: Look = Object.fromEntries(LOOK_KEYS.map((k) => [k, DEFAULT_STYLE[k]])) as Look;

/** Saved look, keeping only valid values (an older or damaged save falls back to the defaults). */
function lookOf(v: Partial<Look> | undefined): Look {
  const l = { ...DEFAULT_LOOK };
  if (!v) return l;
  if (typeof v.panelOpacity === 'number' && v.panelOpacity >= 0 && v.panelOpacity <= 1) l.panelOpacity = v.panelOpacity;
  if (Array.isArray(v.hrZones) && v.hrZones.length === 4 && v.hrZones.every((z) => typeof z === 'number' && z > 0)) l.hrZones = v.hrZones;
  if (typeof v.hrMax === 'number' && v.hrMax >= 0) l.hrMax = v.hrMax;
  if (typeof v.colorByZone === 'boolean') l.colorByZone = v.colorByZone;
  if (typeof v.ftp === 'number' && v.ftp > 0) l.ftp = v.ftp;
  return l;
}

/** The gadgets' style for this project: the shared one with the chosen look, zones and map zoom. */
export function styleOf(s: Pick<State, 'mapZoomM' | 'look'>): OverlayStyle {
  return { ...STYLE, ...s.look, mapRadiusM: s.mapZoomM };
}

/** Which saved layout a format uses: the clip's own shape counts as vertical or horizontal. */
function layoutKey(format: FormatId, info?: VideoInfo): string {
  return format !== 'original' ? format : info && info.height > info.width ? 'original-v' : 'original-h';
}

interface State extends Omit<Prefs, 'overlays'> {
  /** Gadgets on the video (the chosen ones this ride can show). */
  overlays: OverlayId[];
  /** Gadgets chosen, remembered for the next videos. */
  chosen: OverlayId[];
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
  /** Framing when the format cuts the clip (0-1 across the side that is cut), without keyframes. */
  cropPos: number;
  /** Framing keyframes (clip seconds): the picture slides from one to the next. Empty = cropPos all along. */
  cropKeys: CropKey[];
  /** Streets and paths around the clip (OpenStreetMap) for the round map, see lib/streets.ts. */
  streets?: Streets;
  streetsState: 'idle' | 'loading' | 'ok' | 'failed';
  /** Bumped by "try again" to ask for the streets once more. */
  streetsRetry: number;

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
  /** Framing at the playhead: changes cropPos, or with keyframes the keyframe there (adding one if needed). */
  frameAt(p: number, sec: number): void;
  addCropKey(sec: number): void;
  removeCropKey(sec: number): void;
  clearCropKeys(): void;
  togglePlatform(p: SocialPlatform): void;
  setBlockZones(b: boolean): void;
  setShortSide(s: number): void;
  setMapZoom(m: number): void;
  setLook(l: Partial<Look>): void;
  setStreets(s: Streets | undefined, state: 'loading' | 'ok' | 'failed'): void;
  retryStreets(): void;
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
    cropKeys: [],
    overlays: [],
    chosen: saved.overlays ?? [],
    layouts: saved.layouts ?? {},
    layout: {},
    format: saved.format ?? 'original',
    platforms: saved.platforms ?? ['instagram'],
    blockZones: saved.blockZones ?? true,
    shortSide: saved.shortSide ?? 1080,
    mapZoomM: saved.mapZoomM ?? 200,
    look: lookOf(saved.look),

    setScreen: (screen) => set({ screen }),
    setTab: (tab) => set({ tab }),
    setClip: (clip, info) => {
      const end = Math.min(info.durationS, MAX_DEFAULT_S);
      set({ clip, info, offsetS: 0, trim: { start: 0, end }, playheadS: 0, cropPos: 0.5, cropKeys: [], autoStart: detectedStart(clip, get().ride), layout: get().layouts[layoutKey(get().format, info)] ?? {} });
    },
    setRide: (ride) => {
      const offered = offeredOverlays(ride);
      // The chosen gadgets this ride can show (the others stay chosen for the next ride); none: the usual four
      const kept = get().chosen.filter((id) => offered.includes(id));
      const overlays = kept.length ? kept : defaultSelection(ride);
      const clip = get().clip;
      set({ ride, streets: undefined, streetsState: 'idle', overlays, chosen: kept.length ? get().chosen : overlays, autoStart: clip ? detectedStart(clip, ride) : undefined });
    },
    toggleOverlay: (id) => {
      const on = get().overlays.includes(id);
      const chosen = get().chosen.filter((x) => x !== id);
      set({ overlays: on ? get().overlays.filter((x) => x !== id) : [...get().overlays, id], chosen: on ? chosen : [...chosen, id], selected: on ? undefined : id });
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
      set({ format, cropPos: 0.5, cropKeys: [], layout: get().layouts[layoutKey(format, get().info)] ?? {} });
      get().settleAll();
    },
    frameAt: (p, sec) => {
      const pos = Math.min(1, Math.max(0, p));
      const keys = get().cropKeys;
      if (!keys.length) return set({ cropPos: pos });
      set({ cropKeys: withKey(keys, sec, pos) });
    },
    addCropKey: (sec) => {
      const s = get();
      set({ cropKeys: withKey(s.cropKeys, sec, posAt(s.cropKeys, s.cropPos, sec)) });
    },
    removeCropKey: (sec) => {
      const s = get();
      const keys = s.cropKeys.filter((k) => Math.abs(k.t - sec) > KEY_SNAP_S);
      // The last one removed: the framing stays where it was there
      set({ cropKeys: keys, cropPos: keys.length ? s.cropPos : posAt(s.cropKeys, s.cropPos, sec) });
    },
    clearCropKeys: () => {
      const s = get();
      set({ cropKeys: [], cropPos: posAt(s.cropKeys, s.cropPos, s.playheadS) });
    },
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
    setMapZoom: (mapZoomM) => set({ mapZoomM }),
    setLook: (l) => set({ look: { ...get().look, ...l } }),
    streetsState: 'idle',
    streetsRetry: 0,
    setStreets: (streets, streetsState) => set({ streets, streetsState }),
    retryStreets: () => set({ streetsRetry: get().streetsRetry + 1 }),
  };
});

// Remember the choices for the next video
useProject.subscribe((s) => {
  const prefs: Prefs = { overlays: s.chosen, layouts: s.layouts, format: s.format, platforms: s.platforms, blockZones: s.blockZones, shortSide: s.shortSide, mapZoomM: s.mapZoomM, look: s.look };
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

/** Part of the clip kept at a moment (clip seconds; the framing keyframes move it). */
export function frameCrop(s: Pick<State, 'info' | 'format' | 'cropPos' | 'cropKeys'>, sec = 0): Crop | undefined {
  return s.info ? cropFor(s.format, s.info.width, s.info.height, posAt(s.cropKeys, s.cropPos, sec)) : undefined;
}

/** A keyframe this close (s) to the playhead counts as the keyframe here. */
export const KEY_SNAP_S = 0.15;

/** Keyframes with one set at `sec` (replacing the one already there). */
function withKey(keys: CropKey[], sec: number, pos: number): CropKey[] {
  return [...keys.filter((k) => Math.abs(k.t - sec) > KEY_SNAP_S), { t: Math.round(sec * 100) / 100, pos }].sort((a, b) => a.t - b.t);
}

/** UTC ms of the clip's first frame, after the adjustment. */
export function clipStart(s: Pick<State, 'autoStart' | 'ride' | 'offsetS'>): number {
  return (s.autoStart ?? s.ride?.startTime ?? 0) + s.offsetS * 1000;
}

/** Gadgets placed in the frame (defaults filled in by the core's layout). */
export function placements(s: Pick<State, 'overlays' | 'layout' | 'info' | 'format'>): Record<OverlayId, GadgetPlacement> {
  return resolveLayout(s.overlays, s.layout, frameAspect(s), STYLE);
}
