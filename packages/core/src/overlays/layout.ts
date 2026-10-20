import { changesAtTextRate, frameState, getOverlay, textInstant } from './registry.ts';
import type { Ctx2D, OverlayContext, OverlayId, OverlayStyle } from './types.ts';

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
    if (id === 'map' || id === 'dialMap') p = { x: 1 - w - MARGIN, y: MARGIN, w };
    else if (id === 'elevationProfile' || id === 'dialProfile') p = { x: (1 - w) / 2, y: 1 - hFrac - MARGIN, w };
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
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const fs = frameState(t, style, octx);
  for (const id of ids) {
    const def = getOverlay(id);
    const p = placements[id];
    if (!p) continue;
    const k = (p.w * width) / def.size(style).width;
    ctx.save();
    ctx.setTransform(k, 0, 0, k, p.x * width, p.y * height);
    def.draw(ctx, fs, style, octx);
    ctx.restore();
  }
}

/** Key that changes only when the composite image can change (sets that only change at the text rate). */
export function compositeFrameKey(ids: OverlayId[], t: number, clipStart: number, style: OverlayStyle): number {
  return ids.every((id) => changesAtTextRate(getOverlay(id), style)) ? textInstant(t, clipStart, style.textRateHz) : t;
}
