import { useEffect, useRef } from 'react';
import { getOverlay, overlayPixelSize, renderOverlayFrame, type Ctx2D, type OverlayId, type OverlayStyle, type RideData } from '@telemesync/core';

/** Draws one overlay with the exact same renderer used for export. */
export function OverlayCanvas(props: {
  id: OverlayId;
  ride: RideData;
  style: OverlayStyle;
  t: number;
  clipStart: number;
  clipEnd: number;
  /** CSS width multiplier relative to the overlay pixel size. */
  cssScale?: number;
  /** Fit inside the parent (max width 100 %, max height in px) keeping the aspect ratio. */
  fitHeight?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const def = getOverlay(props.id);
  const { width, height } = overlayPixelSize(def, props.style);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    renderOverlayFrame(ctx as unknown as Ctx2D, def, props.t, props.style, { ride: props.ride, clipStart: props.clipStart, clipEnd: props.clipEnd });
  });
  const k = props.cssScale ?? 1;
  const css = props.fitHeight
    ? { width: width * k, maxWidth: '100%', maxHeight: props.fitHeight, height: 'auto', objectFit: 'contain' as const }
    : { width: width * k, height: height * k };
  return <canvas ref={ref} width={width} height={height} className={props.className} style={css} />;
}
