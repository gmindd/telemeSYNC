import { pick, tr, type CoreKey, type Lang, type Translations } from '../i18n/index.ts';
import type { RideData } from '../telemetry/ride.ts';
import { sampleAt } from '../telemetry/ride.ts';
import { dialFamily } from './dial/index.ts';
import { elevationProfileOverlay } from './elevationProfile.ts';
import { mapOverlay } from './map.ts';
import { natalFamily } from './natal/index.ts';
import { segmentOverlays } from './segment/segment.ts';
import { panelOverlays } from './panel/panel.ts';
import { textOverlays } from './text/metrics.ts';
import { METRIC_SLUGS } from './slugs.ts';
import { setNumberLang } from './units.ts';
import type { Ctx2D, FrameState, OverlayContext, OverlayDefinition, OverlayId, OverlayStyle, OverlayTheme } from './types.ts';

export const OVERLAYS: OverlayDefinition[] = [...textOverlays, mapOverlay, elevationProfileOverlay, ...panelOverlays, ...dialFamily, ...segmentOverlays, ...natalFamily];

/** Theme of an overlay in the app (tabs in step 4). */
export function overlayTheme(id: OverlayId): OverlayTheme {
  return OVERLAYS.find((o) => o.id === id)?.theme ?? 'default';
}

export function getOverlay(id: OverlayId): OverlayDefinition {
  const o = OVERLAYS.find((x) => x.id === id);
  if (!o) throw new Error(`Unknown overlay: ${id}`);
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
  setNumberLang(style.language);
  def.draw(ctx, frameState(t, style, octx), style, octx);
  ctx.restore();
}

const PANEL_PREFIX: Translations = ['panel', 'painel', 'panneau', 'panel', 'panel'];
const DIAL_PREFIX: Translations = ['dial', 'mostrador', 'cadran', 'esfera', 'rundinstrument'];
const DIAL_METRIC: Partial<Record<OverlayId, string>> = { dialTime: 'elapsedTime' };

/** Metric behind a panel or dial id ("panelHeartRate" → "heartRate"). */
function innerMetric(id: OverlayId, prefix: 'panel' | 'dial'): string {
  return DIAL_METRIC[id] ?? id.charAt(prefix.length).toLowerCase() + id.slice(prefix.length + 1);
}

/** Slug used in output file names (`{clip}_{slug}.mov`), in the app language. */
export function overlayFileSlug(id: OverlayId, lang: Lang | undefined): string {
  const def = OVERLAYS.find((o) => o.id === id);
  if (def?.slugFor) return def.slugFor(lang);
  if (METRIC_SLUGS[id]) return pick(METRIC_SLUGS[id], lang);
  if (id.startsWith('panel')) return `${pick(PANEL_PREFIX, lang)}-${pick(METRIC_SLUGS[innerMetric(id, 'panel')], lang)}`;
  return `${pick(DIAL_PREFIX, lang)}-${pick(METRIC_SLUGS[innerMetric(id, 'dial')], lang)}`;
}

/** Name of an overlay in the app, in `lang`. */
export function overlayLabel(id: OverlayId, lang: Lang | undefined): string {
  const def = OVERLAYS.find((o) => o.id === id);
  if (def?.labelFor) return def.labelFor(lang);
  if (id === 'map') return tr(lang, 'overlay.map');
  if (id === 'elevationProfile') return tr(lang, 'overlay.elevationProfile');
  if (id === 'dialMap' || id === 'dialProfile' || id === 'dialSummary' || id === 'segmentLive' || id === 'segmentLaps') return tr(lang, `overlay.${id}`);
  if (id.startsWith('panel')) return tr(lang, 'overlay.panel', { name: tr(lang, `metric.${innerMetric(id, 'panel')}` as CoreKey) });
  if (id.startsWith('dial')) return tr(lang, 'overlay.dial', { name: tr(lang, `metric.${innerMetric(id, 'dial')}` as CoreKey) });
  return tr(lang, `metric.${id}` as CoreKey);
}
