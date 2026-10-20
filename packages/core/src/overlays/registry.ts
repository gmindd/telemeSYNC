import type { RideData } from '../telemetry/ride.ts';
import { sampleAt } from '../telemetry/ride.ts';
import { dialFamily } from './dial/index.ts';
import { elevationProfileOverlay } from './elevationProfile.ts';
import { mapOverlay } from './map.ts';
import { panelOverlays } from './panel/panel.ts';
import { textOverlays } from './text/metrics.ts';
import type { Ctx2D, FrameState, OverlayContext, OverlayDefinition, OverlayId, OverlayStyle } from './types.ts';

export const OVERLAYS: OverlayDefinition[] = [...textOverlays, mapOverlay, elevationProfileOverlay, ...panelOverlays, ...dialFamily];

export function getOverlay(id: OverlayId): OverlayDefinition {
  const o = OVERLAYS.find((x) => x.id === id);
  if (!o) throw new Error(`Overlay desconhecido: ${id}`);
  return o;
}

/** Overlays that can be produced for this ride (only metrics that exist in the file). */
export function availableOverlays(ride: RideData): OverlayDefinition[] {
  return OVERLAYS.filter((o) => ride.available.has(o.requires));
}

/** Pixel size of an overlay (base size × scale, rounded to even numbers for codecs). */
export function overlayPixelSize(def: OverlayDefinition, style: OverlayStyle): { width: number; height: number } {
  const s = def.size(style);
  const even = (v: number) => Math.max(2, Math.ceil((v * style.scale) / 2) * 2);
  return { width: even(s.width), height: even(s.height) };
}

/** True when the overlay only changes at the text rate with this style (frames in between can be reused). */
export function changesAtTextRate(def: OverlayDefinition, style: OverlayStyle): boolean {
  return def.textOnly || !!def.textRateOnly?.(style);
}

/** Text-update instant: quantised to `textRateHz`, relative to the clip start so all clips behave the same. */
export function textInstant(t: number, clipStart: number, rateHz: number): number {
  if (!(rateHz > 0)) return t;
  const period = 1000 / rateHz;
  return clipStart + Math.floor((t - clipStart) / period + 1e-6) * period;
}

export function frameState(t: number, style: OverlayStyle, octx: OverlayContext): FrameState {
  const opts = { gapSpeed: style.gapSpeed };
  const tt = textInstant(t, octx.clipStart, style.textRateHz);
  return { t, sample: sampleAt(octx.ride, t, opts), textSample: sampleAt(octx.ride, tt, opts) };
}

/**
 * Renders one frame of an overlay. Shared by the browser preview and the exporter, so
 * both produce identical images. Clears the canvas (transparent) first.
 */
export function renderOverlayFrame(ctx: Ctx2D, def: OverlayDefinition, t: number, style: OverlayStyle, octx: OverlayContext, scaleOverride?: number) {
  const { width, height } = overlayPixelSize(def, style);
  const scale = scaleOverride ?? style.scale;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  def.draw(ctx, frameState(t, style, octx), style, octx);
  ctx.restore();
}

/** Portuguese slug used in output file names: `{clip}_{slug}.mov`. */
export const OVERLAY_FILE_SLUG: Record<OverlayId, string> = {
  speed: 'velocidade',
  altitude: 'altitude',
  grade: 'inclinacao',
  heartRate: 'fc',
  cadence: 'cadencia',
  power: 'potencia',
  temperature: 'temperatura',
  distance: 'distancia',
  elevationGain: 'desnivel',
  elapsedTime: 'tempo',
  localTime: 'hora',
  map: 'mapa',
  elevationProfile: 'perfil',
  panelSpeed: 'painel-velocidade',
  panelAltitude: 'painel-altitude',
  panelGrade: 'painel-inclinacao',
  panelHeartRate: 'painel-fc',
  panelCadence: 'painel-cadencia',
  panelPower: 'painel-potencia',
  panelTemperature: 'painel-temperatura',
  dialHeartRate: 'mostrador-fc',
  dialCadence: 'mostrador-cadencia',
  dialSpeed: 'mostrador-velocidade',
  dialGrade: 'mostrador-inclinacao',
  dialAltitude: 'mostrador-altitude',
  dialPower: 'mostrador-potencia',
  dialDistance: 'mostrador-distancia',
  dialTime: 'mostrador-tempo',
  dialTemperature: 'mostrador-temperatura',
  dialMap: 'mapa-circular',
  dialProfile: 'perfil-cartao',
  dialSummary: 'painel-compacto',
};
