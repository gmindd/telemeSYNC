import type { MetricKey, RideData, RideSample } from '../telemetry/ride.ts';
import type { Lang } from '../i18n/index.ts';
import type { Units } from './units.ts';

/**
 * Minimal 2D context surface used by renderers. Satisfied by the browser's
 * CanvasRenderingContext2D and by @napi-rs/canvas's SKRSContext2D.
 */
export interface Ctx2D {
  canvas?: unknown;
  save(): void;
  restore(): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean): void;
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradientLike;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradientLike;
  fill(): void;
  stroke(): void;
  fillText(text: string, x: number, y: number): void;
  strokeText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  font: string;
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineJoin: string;
  lineCap: string;
  textAlign: string;
  textBaseline: string;
  globalAlpha: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
}

export interface CanvasGradientLike {
  addColorStop(offset: number, color: string): void;
}

export type OverlayId =
  | 'speed'
  | 'altitude'
  | 'grade'
  | 'heartRate'
  | 'cadence'
  | 'power'
  | 'temperature'
  | 'distance'
  | 'elevationGain'
  | 'elapsedTime'
  | 'localTime'
  | 'map'
  | 'elevationProfile'
  | 'panelSpeed'
  | 'panelAltitude'
  | 'panelGrade'
  | 'panelHeartRate'
  | 'panelCadence'
  | 'panelPower'
  | 'panelTemperature'
  | 'dialHeartRate'
  | 'dialCadence'
  | 'dialSpeed'
  | 'dialGrade'
  | 'dialAltitude'
  | 'dialPower'
  | 'dialDistance'
  | 'dialTime'
  | 'dialTemperature'
  | 'dialMap'
  | 'dialProfile'
  | 'dialSummary';

/** Metrics that have a dashboard panel (gauge + stats + chart), and that a panel chart can show. */
export type PanelMetric = 'speed' | 'altitude' | 'grade' | 'heartRate' | 'cadence' | 'power' | 'temperature';

export interface PanelOptions {
  /** Metric drawn in the panel's chart (may differ from the gauge metric). */
  chart: PanelMetric;
  /** Chart window: last `chartMinutes` or last `chartDistance`. */
  window: 'time' | 'distance';
}

export interface OverlayStyle {
  fontFamily: string;
  textColor: string;
  accentColor: string;
  /** Secondary colour for "not yet travelled" parts of map/profile. */
  mutedColor: string;
  outlineColor: string;
  /** Outline width at 1× (0 = none). */
  outlineWidth: number;
  shadow: boolean;
  showLabel: boolean;
  showUnit: boolean;
  /** Render resolution multiplier over the base size (2 = sharp when scaled up a bit in the editor). */
  scale: number;
  units: Units;
  /** Text values update at this rate (Hz) so digits do not flicker. Map/markers move every frame. */
  textRateHz: number;
  /** Upper bounds (bpm) of HR zones 1..4; above the last = zone 5. */
  hrZones: number[];
  hrZoneColors: string[];
  colorByZone: boolean;
  /** What speed shows inside a telemetry gap. */
  gapSpeed: 'zero' | 'dash';
  /** Map framing: whole ride or zoom on the clip's section. */
  mapMode: 'full' | 'clip';
  timeZone: string;
  /** Two-colour gradient used by the dashboard panels (low → high). */
  gradientFrom: string;
  gradientTo: string;
  /** Opacity of the dark panel background (0 = no background). */
  panelOpacity: number;
  /** Panel chart time window, minutes. */
  chartMinutes: number;
  /** Panel chart distance window, km (mi in imperial). */
  chartDistance: number;
  /** Per-panel options; missing = chart of the panel's own metric over time. */
  panels: Partial<Record<PanelMetric, PanelOptions>>;
  /** Functional threshold power (W), for the power zones. */
  ftp: number;
  /** Panels redraw every frame (smooth) or only at the text rate (much smaller files). */
  panelRate: 'smooth' | 'text';
  /** Language of the texts drawn in the overlays (labels, decimal separator). */
  language: Lang;
}

export const DEFAULT_STYLE: OverlayStyle = {
  fontFamily: 'TelemeSync Inter',
  textColor: '#ffffff',
  accentColor: '#ff7a1a',
  mutedColor: 'rgba(255,255,255,0.55)',
  outlineColor: 'rgba(0,0,0,0.85)',
  outlineWidth: 3,
  shadow: true,
  showLabel: true,
  showUnit: true,
  scale: 2,
  units: { system: 'metric', temperature: 'C' },
  textRateHz: 4,
  hrZones: [120, 140, 155, 170],
  hrZoneColors: ['#9e9e9e', '#2196f3', '#4caf50', '#ff9800', '#f44336'],
  colorByZone: true,
  gapSpeed: 'zero',
  mapMode: 'full',
  timeZone: 'Europe/Lisbon',
  gradientFrom: '#ffc400',
  gradientTo: '#ff3d00',
  panelOpacity: 0.8,
  chartMinutes: 10,
  chartDistance: 10,
  panels: {},
  ftp: 250,
  panelRate: 'smooth',
  language: 'en',
};

/** Context shared by all frames of one overlay render. */
export interface OverlayContext {
  ride: RideData;
  /** UTC ms of the clip's first frame. */
  clipStart: number;
  clipEnd: number;
}

export interface FrameState {
  /** Exact instant of this frame (UTC ms). */
  t: number;
  /** Sample at the exact instant (for smooth markers). */
  sample: RideSample;
  /** Sample at the text-rate-quantised instant (for numbers). */
  textSample: RideSample;
}

export interface OverlayDefinition {
  id: OverlayId;
  /** English name (the app shows overlayLabel(), in its language). */
  label: string;
  /** Metric that must be available in the ride. */
  requires: MetricKey;
  /** Base size in px at scale 1. */
  size(style: OverlayStyle): { width: number; height: number };
  /** Text-only overlays are constant between text updates (render can reuse frames). */
  textOnly: boolean;
  /** Overlay that, with this style, also changes only at the text rate (e.g. panels in "text" mode). */
  textRateOnly?: (style: OverlayStyle) => boolean;
  draw(ctx: Ctx2D, frame: FrameState, style: OverlayStyle, octx: OverlayContext): void;
}
