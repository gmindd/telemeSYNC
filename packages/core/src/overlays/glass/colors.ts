import type { RideData, RideSample } from '../../telemetry/ride.ts';
import { POWER_ZONE_COLORS, POWER_ZONES } from '../panel/panel.ts';
import { mixColor } from '../panel/paint.ts';
import { hrZone } from '../text/metrics.ts';
import type { OverlayStyle, PanelMetric } from '../types.ts';

// Colour of a value in the glass theme. Colours run continuously with the value (no steps): grade goes
// from blue on steep descents to red on steep climbs, temperature from cold blue to hot red, and so on.
// Heart rate and power keep the colour of their zone, blending over a few beats/watts at each boundary
// so the light never jumps.

/** Neutral light for "no value" (before the start, gaps). */
export const NO_VALUE = '#dfe6ee';

type Stops = readonly (readonly [number, string])[];

/** Colour at v along stops (value, colour), mixed between neighbours and clamped at both ends. */
export function ramp(stops: Stops, v: number): string {
  if (!Number.isFinite(v)) return NO_VALUE;
  if (v <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [b, cb] = stops[i];
    if (v <= b) {
      const [a, ca] = stops[i - 1];
      return mixColor(ca, cb, (v - a) / (b - a || 1), 1);
    }
  }
  return stops[stops.length - 1][1];
}

/** Grade (%): blue below −15 %, green on the flat, red above +15 %. */
export const GRADE_STOPS: Stops = [
  [-15, '#3b82f6'],
  [-8, '#38bdf8'],
  [-2, '#5eead4'],
  [1, '#4ade80'],
  [5, '#facc15'],
  [10, '#fb923c'],
  [15, '#ef4444'],
];
/** Speed (km/h). */
export const SPEED_STOPS: Stops = [
  [0, '#93c5fd'],
  [12, '#38bdf8'],
  [24, '#4ade80'],
  [36, '#facc15'],
  [48, '#fb923c'],
  [62, '#ef4444'],
];
/** Cadence (rpm): green around 85–95. */
export const CADENCE_STOPS: Stops = [
  [40, '#60a5fa'],
  [70, '#38bdf8'],
  [88, '#4ade80'],
  [102, '#facc15'],
  [118, '#ef4444'],
];
/** Temperature (°C). */
export const TEMPERATURE_STOPS: Stops = [
  [-5, '#3b82f6'],
  [5, '#7dd3fc'],
  [14, '#86efac'],
  [22, '#fde047'],
  [29, '#fb923c'],
  [37, '#ef4444'],
];
/** Altitude (m): sea green low, warm in the hills, snow white in the high mountains. */
export const ALTITUDE_STOPS: Stops = [
  [0, '#5eead4'],
  [500, '#86efac'],
  [1100, '#fcd34d'],
  [1700, '#fb923c'],
  [2300, '#c4b5fd'],
  [3000, '#ffffff'],
];
/** Ride progress (0..1) for distance and time. */
export const DISTANCE_STOPS: Stops = [
  [0, '#7dd3fc'],
  [0.5, '#a78bfa'],
  [1, '#f472b6'],
];
export const TIME_STOPS: Stops = [
  [0, '#fde68a'],
  [0.5, '#fbbf24'],
  [1, '#f97316'],
];

/**
 * Zone colour with a soft blend at the boundaries: inside a zone its own colour, within `blend` of a
 * boundary a mix of both zones (half and half on the boundary itself).
 */
export function zoneColor(v: number, bounds: number[], colors: string[], blend: number): string {
  if (!Number.isFinite(v)) return NO_VALUE;
  const z = Math.min(colors.length - 1, hrZone(v, bounds));
  const lower = z > 0 ? bounds[z - 1] : -Infinity;
  const upper = z < bounds.length ? bounds[z] : Infinity;
  if (upper - v < blend && z + 1 < colors.length) return mixColor(colors[z], colors[z + 1], 0.5 - (upper - v) / (2 * blend), 1);
  if (v - lower < blend && z > 0) return mixColor(colors[z - 1], colors[z], 0.5 + (v - lower) / (2 * blend), 1);
  return colors[z];
}

export const hrColor = (bpm: number, style: OverlayStyle) => zoneColor(bpm, style.hrZones, style.hrZoneColors, 3);
export const powerColor = (w: number, style: OverlayStyle) =>
  zoneColor(
    w,
    POWER_ZONES.map((k) => k * style.ftp),
    POWER_ZONE_COLORS,
    style.ftp * 0.03,
  );

/** Colour of a panel metric at a sample (SI values; scales are in metric units whatever the display units). */
export function metricColor(m: PanelMetric, s: RideSample, style: OverlayStyle): string {
  switch (m) {
    case 'speed':
      return ramp(SPEED_STOPS, s.speed * 3.6);
    case 'grade':
      return ramp(GRADE_STOPS, s.grade);
    case 'cadence':
      return ramp(CADENCE_STOPS, s.cadence);
    case 'temperature':
      return ramp(TEMPERATURE_STOPS, s.temperature);
    case 'altitude':
      return ramp(ALTITUDE_STOPS, s.altitude);
    case 'heartRate':
      return hrColor(s.heartRate, style);
    case 'power':
      return powerColor(s.power, style);
  }
}

/** Fraction of the ride done at a sample, by distance or by time. */
export function progressOf(kind: 'distance' | 'time', s: RideSample, ride: RideData): number {
  if (kind === 'distance') return s.distance / Math.max(1, ride.totals.distanceM);
  return s.elapsedMs / Math.max(1, ride.totals.durationMs);
}
