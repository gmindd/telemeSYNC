import type { RideData, RideSample } from '../telemetry/ride.ts';
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
  | 'elevationProfile';

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
  /** Portuguese label for the UI. */
  label: string;
  /** Metric that must be available in the ride. */
  requires: OverlayId;
  /** Base size in px at scale 1. */
  size(style: OverlayStyle): { width: number; height: number };
  /** Text-only overlays are constant between text updates (render can reuse frames). */
  textOnly: boolean;
  draw(ctx: Ctx2D, frame: FrameState, style: OverlayStyle, octx: OverlayContext): void;
}
