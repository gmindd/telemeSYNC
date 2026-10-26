import type { Fps } from '../media/types.ts';
import { changesAtTextRate, frameState, overlayPixelSize, textInstant } from '../overlays/registry.ts';
import { compositeFrameKey, drawComposite, type GadgetPlacement } from '../overlays/layout.ts';
import type { Ctx2D, OverlayContext, OverlayDefinition, OverlayId, OverlayStyle } from '../overlays/types.ts';
import { setNumberLang } from '../overlays/units.ts';

/** What an export draws, frame by frame (shared by the Node exporter and the in-browser one). */
export interface FrameSource {
  width: number;
  height: number;
  /** Frames with the same key are identical (allows reuse). */
  key(t: number): number;
  draw(ctx: Ctx2D, t: number): void;
}

export function frameCountFor(durationMs: number, fps: Fps): number {
  return Math.max(1, Math.round((durationMs / 1000) * (fps.num / fps.den)));
}

/** About one key frame per second: inter-frame codecs then store unchanged pixels almost for free. */
export function keyFrameInterval(fps: Fps): number {
  return Math.max(1, Math.round(fps.num / fps.den));
}

/** One overlay alone, the size of the gadget, transparent background. */
export function overlayFrameSource(def: OverlayDefinition, style: OverlayStyle, octx: OverlayContext): FrameSource {
  const { width, height } = overlayPixelSize(def, style);
  return {
    width,
    height,
    // Overlays that change only at the text rate reuse the previous frame.
    key: (t) => (changesAtTextRate(def, style) ? textInstant(t, octx.clipStart, style.textRateHz) : t),
    draw: (ctx, t) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.setTransform(style.scale, 0, 0, style.scale, 0, 0);
      setNumberLang(style.language);
      def.draw(ctx, frameState(t, style, octx), style, octx);
      ctx.restore();
    },
  };
}

/** All gadgets in their positions, in one frame the size of the video. */
export function compositeFrameSource(o: {
  overlays: OverlayId[];
  placements: Record<OverlayId, GadgetPlacement>;
  style: OverlayStyle;
  octx: OverlayContext;
  width: number;
  height: number;
}): FrameSource {
  return {
    width: o.width,
    height: o.height,
    key: (t) => compositeFrameKey(o.overlays, t, o.octx.clipStart, o.style),
    draw: (ctx, t) => drawComposite(ctx, o.overlays, o.placements, t, o.style, o.octx, o.width, o.height),
  };
}
