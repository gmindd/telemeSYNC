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

/** Fills missing placements with a default arrangement: numbers top-left, map top-right, profile bottom. */
export function resolveLayout(ids: OverlayId[], layout: GadgetLayout, aspect: number, style: OverlayStyle): Record<OverlayId, GadgetPlacement> {
  const out = {} as Record<OverlayId, GadgetPlacement>;
  // Default: gadget shown at its 1× size on a frame whose short side is 1080 px.
  const frameW = 1080 * Math.max(aspect, 1);
  const frameH = frameW / aspect;
  let colX = MARGIN;
  let y = MARGIN;
  let colW = 0;
  for (const id of ids) {
    const s = getOverlay(id).size(style);
    const w = s.width / frameW;
    const hFrac = s.height / frameH;
    let p: GadgetPlacement;
    if (id === 'map' || id === 'dialMap' || id === 'natalMap') p = { x: 1 - w - MARGIN, y: MARGIN, w };
    else if (id === 'elevationProfile' || id === 'dialProfile' || id === 'natalProfile') p = { x: (1 - w) / 2, y: 1 - hFrac - MARGIN, w };
    else {
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
    const base = def.size(style);
    const k = (p.w * width) / base.width;
    if (alpha < 1 && layer && ctx.drawImage) {
      const L = layer(Math.ceil(base.width * k), Math.ceil(base.height * k));
      L.setTransform(1, 0, 0, 1, 0, 0);
      L.clearRect(0, 0, base.width * k + 1, base.height * k + 1);
      L.save();
      L.setTransform(k, 0, 0, k, 0, 0);
      def.draw(L, fs, style, octx);
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
    def.draw(ctx, fs, gadgetStyle(style, id), octx);
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
