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
import { runOverlays } from './run/run.ts';
import { snowOverlays } from './snow/snow.ts';
import type { Sport } from '../telemetry/types.ts';
import { METRIC_SLUGS } from './slugs.ts';
import { setNumberLang } from './units.ts';
import type { Ctx2D, FrameState, OverlayContext, OverlayDefinition, OverlayId, OverlayStyle, OverlayTheme } from './types.ts';

/**
 * Cycling gadgets that also fit the other sports' catalogues (plain numbers, maps, profiles, laps).
 * Dials are not shared: each sport has its own rim (chainring, athletics track, ice).
 */
const SHARED_SPORTS: Partial<Record<OverlayId, Sport[]>> = {
  heartRate: ['cycling', 'running', 'snow'],
  altitude: ['cycling', 'running', 'snow'],
  grade: ['cycling', 'running'],
  speed: ['cycling', 'snow'],
  power: ['cycling', 'running'],
  temperature: ['cycling', 'running', 'snow'],
  distance: ['cycling', 'running', 'snow'],
  elevationGain: ['cycling', 'running'],
  elapsedTime: ['cycling', 'running', 'snow'],
  localTime: ['cycling', 'running', 'snow'],
  map: ['cycling', 'running', 'snow'],
  elevationProfile: ['cycling', 'running', 'snow'],
  dialMap: ['cycling', 'running', 'snow'],
  dialProfile: ['cycling', 'running', 'snow'],
  panelHeartRate: ['cycling', 'running'],
  panelAltitude: ['cycling', 'running', 'snow'],
  panelSpeed: ['cycling', 'snow'],
  segmentLive: ['cycling', 'running'],
  segmentLaps: ['cycling', 'running'],
};

export const OVERLAYS: OverlayDefinition[] = [
  ...textOverlays,
  mapOverlay,
  elevationProfileOverlay,
  ...panelOverlays,
  ...dialFamily,
  ...segmentOverlays,
  ...natalFamily,
  ...runOverlays,
  ...snowOverlays,
].map((o) => (SHARED_SPORTS[o.id] ? { ...o, sports: SHARED_SPORTS[o.id] } : o));

/** Section of the app a gadget goes in: plain gadgets, round dials, panels, or live cards and tables. */
export type OverlayGroup = 'gadget' | 'dial' | 'panel' | 'live';
const LIVE_IDS = new Set<OverlayId>(['segmentLive', 'segmentLaps', 'runSplits', 'runGhost', 'snowRunLive', 'snowRuns']);
export function overlayGroup(id: OverlayId): OverlayGroup {
  if (LIVE_IDS.has(id)) return 'live';
  if (id.startsWith('panel')) return 'panel';
  if (id.startsWith('dial') || id.startsWith('runDial') || id.startsWith('snowDial')) return 'dial';
  return 'gadget';
}

/** Sports whose catalogue lists the overlay (cycling when it says nothing). */
export function overlaySports(id: OverlayId): Sport[] {
  return OVERLAYS.find((o) => o.id === id)?.sports ?? ['cycling'];
}

/** Overlays of a sport's catalogue that this ride can show. */
export function overlaysForSport(ride: RideData, sport: Sport): OverlayDefinition[] {
  return availableOverlays(ride).filter((o) => (o.sports ?? ['cycling']).includes(sport));
}

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
  const opts = { gapSpeed: style.gapSpeed, power3s: style.powerSmoothing === '3s' };
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
