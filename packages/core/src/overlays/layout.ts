import { changesAtTextRate, frameState, getOverlay, textInstant } from './registry.ts';
import type { Ctx2D, OverlayContext, OverlayId, OverlayStyle } from './types.ts';
import { setNumberLang } from './units.ts';
import { gadgetOpacity, hasConditions } from './visibility.ts';
import type { RideData } from '../telemetry/ride.ts';

/**
 * Position of a gadget inside the video frame, independent of resolution:
 * x/y = top-left corner as a fraction of frame width/height, w = gadget width as a fraction of frame width.
 */
export interface GadgetPlacement {
  x: number;
  y: number;
  w: number;
}

export type GadgetLayout = Partial<Record<OverlayId, GadgetPlacement>>;

/** Composite output size: the short side equals `shortSide` (1080 = Full HD), keeping the clip aspect. */
export function compositeSize(clipWidth: number | undefined, clipHeight: number | undefined, shortSide = 1080): { width: number; height: number } {
  const aspect = clipWidth && clipHeight ? clipWidth / clipHeight : 16 / 9;
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
  return aspect >= 1 ? { width: even(shortSide * aspect), height: even(shortSide) } : { width: even(shortSide), height: even(shortSide / aspect) };
}

const MARGIN = 0.025;
/** Default width (px at 1×) of a map: no larger than a dial, so a new 2D map doesn't cover the rest of the frame. */
const MAP_DEFAULT_PX = 300;
const MAPS: OverlayId[] = ['map', 'dialMap', 'natalMap', 'glassMap'];
const PROFILES: OverlayId[] = ['elevationProfile', 'dialProfile', 'natalProfile', 'glassProfile', 'glassProfileStrip'];

/**
 * Fills missing placements with a default arrangement: numbers top-left, maps top-right, profiles bottom. Several
 * maps go one under the other (and profiles one above the other) instead of all in the same corner.
 */
export function resolveLayout(ids: OverlayId[], layout: GadgetLayout, aspect: number, style: OverlayStyle): Record<OverlayId, GadgetPlacement> {
  const out = {} as Record<OverlayId, GadgetPlacement>;
  // Default: gadget shown at its 1× size on a frame whose short side is 1080 px.
  const frameW = 1080 * Math.max(aspect, 1);
  const frameH = frameW / aspect;
  let colX = MARGIN;
  let y = MARGIN;
  let colW = 0;
  let mapY = MARGIN;
  let profileBottom = 1 - MARGIN;
  // New maps go under the maps already placed, new profiles above the profiles already placed
  for (const id of ids) {
    const placed = layout[id];
    if (!placed) continue;
    const s = getOverlay(id).size(style);
    const h = placed.w * (s.height / s.width) * aspect;
    if (MAPS.includes(id)) mapY = Math.max(mapY, placed.y + h + MARGIN / 2);
    else if (PROFILES.includes(id)) profileBottom = Math.min(profileBottom, placed.y - MARGIN / 2);
  }
  for (const id of ids) {
    const s = getOverlay(id).size(style);
    let w = s.width / frameW;
    let hFrac = s.height / frameH;
    let p: GadgetPlacement;
    if (MAPS.includes(id)) {
      const k = Math.min(1, MAP_DEFAULT_PX / s.width);
      w *= k;
      hFrac *= k;
      p = { x: 1 - w - MARGIN, y: Math.min(mapY, Math.max(MARGIN, 1 - hFrac - MARGIN)), w };
      if (!layout[id]) mapY += hFrac + MARGIN / 2;
    } else if (PROFILES.includes(id)) {
      p = { x: (1 - w) / 2, y: Math.max(MARGIN, profileBottom - hFrac), w };
      if (!layout[id]) profileBottom -= hFrac + MARGIN / 2;
    } else {
      if (y + hFrac > 1 - MARGIN && y > MARGIN) {
        colX += colW + MARGIN / 2;
        y = MARGIN;
        colW = 0;
      }
      p = { x: colX, y, w };
      y += hFrac + MARGIN / 3;
      colW = Math.max(colW, w);
    }
    out[id] = layout[id] ?? p;
  }
  return out;
}

const ownStyles = new WeakMap<OverlayStyle, Map<OverlayId, OverlayStyle>>();

/** The style a gadget is drawn with: the shared one, or with its own background opacity (one object per gadget, kept). */
export function gadgetStyle(style: OverlayStyle, id: OverlayId): OverlayStyle {
  const op = style.gadgetOpacity?.[id];
  if (op === undefined || op === style.panelOpacity) return style;
  let m = ownStyles.get(style);
  if (!m) ownStyles.set(style, (m = new Map()));
  let s = m.get(id);
  if (!s) m.set(id, (s = { ...style, panelOpacity: op }));
  return s;
}

/** Draws several gadgets into one frame of size width × height (transparent background). */
export function drawComposite(
  ctx: Ctx2D,
  ids: OverlayId[],
  placements: Record<OverlayId, GadgetPlacement>,
  t: number,
  style: OverlayStyle,
  octx: OverlayContext,
  width: number,
  height: number,
  /** Blank canvas of a size, to fade a gadget as a whole (without it, a fading gadget is drawn with globalAlpha). */
  layer?: (w: number, h: number) => Ctx2D & { canvas: unknown },
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const fs = frameState(t, style, octx);
  setNumberLang(style.language);
  for (const id of ids) {
    const def = getOverlay(id);
    const p = placements[id];
    if (!p) continue;
    // Gadgets with a condition (see visibility.ts) are hidden, or fading in or out.
    const alpha = gadgetOpacity(id, t, style, octx.ride);
    if (alpha <= 0) continue;
    const st = gadgetStyle(style, id);
    const base = def.size(st);
    const k = (p.w * width) / base.width;
    if (alpha < 1 && layer && ctx.drawImage) {
      const L = layer(Math.ceil(base.width * k), Math.ceil(base.height * k));
      L.setTransform(1, 0, 0, 1, 0, 0);
      L.clearRect(0, 0, base.width * k + 1, base.height * k + 1);
      L.save();
      L.setTransform(k, 0, 0, k, 0, 0);
      def.draw(L, fs, st, octx);
      L.restore();
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(L.canvas, p.x * width, p.y * height);
      ctx.restore();
      continue;
    }
    ctx.save();
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.setTransform(k, 0, 0, k, p.x * width, p.y * height);
    def.draw(ctx, fs, st, octx);
    ctx.restore();
  }
}

/**
 * Key that changes only when the composite image can change (sets that only change at the text rate). Gadgets with
 * a condition add which of them are shown; while one fades, every frame is new.
 */
export function compositeFrameKey(ids: OverlayId[], t: number, clipStart: number, style: OverlayStyle): number;
export function compositeFrameKey(ids: OverlayId[], t: number, clipStart: number, style: OverlayStyle, ride: RideData): number | string;
export function compositeFrameKey(ids: OverlayId[], t: number, clipStart: number, style: OverlayStyle, ride?: RideData): number | string {
  const base = ids.every((id) => changesAtTextRate(getOverlay(id), style)) ? textInstant(t, clipStart, style.textRateHz) : t;
  if (!ride || !hasConditions(ids, style)) return base;
  let shown = '';
  for (const id of ids) {
    const a = gadgetOpacity(id, t, style, ride);
    if (a > 0 && a < 1) return t;
    shown += a > 0 ? '1' : '0';
  }
  return `${base}|${shown}`;
}
