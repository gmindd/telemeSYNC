import type { MetricKey, RideData, RideSample } from '../../telemetry/ride.ts';
import type { Sport } from '../../telemetry/types.ts';
import { tr, type CoreKey } from '../../i18n/index.ts';
import { formatDuration } from '../../util/timezone.ts';
import { formatPace, paceUnit, skiRuns, slopeDegrees, stepsPerMin, verticalSpeedAt } from '../../metrics/derived.ts';
import { beforeStart, elevationLossAt, metricArc } from '../dial/dials.ts';
import { PANEL_METRIC_INFO, statsUpTo } from '../panel/series.ts';
import type { OverlayStyle } from '../types.ts';
import { convert, fmt, wkgText } from '../units.ts';
import {
  ALTITUDE_STOPS,
  CADENCE_STOPS,
  DISTANCE_STOPS,
  GRADE_STOPS,
  hrColor,
  powerColor,
  progressOf,
  ramp,
  SPEED_STOPS,
  TEMPERATURE_STOPS,
  TIME_STOPS,
} from './colors.ts';
import type { LineIcon } from './icons.ts';

// The metrics every kit theme shows, defined once: how to read the value, its unit, the widest value (so the
// font size never changes), how far along its scale it is, its colour (continuous with the value), and for
// which sports it is offered. Themes only decide how it looks.

/** Running pace colour by speed (km/h): slow blue → fast red. */
const PACE_STOPS = [
  [5, '#60a5fa'],
  [8, '#38bdf8'],
  [11, '#4ade80'],
  [14, '#facc15'],
  [17, '#fb923c'],
  [20, '#ef4444'],
] as const;
/** Steps per minute. */
const STEPS_STOPS = [
  [130, '#60a5fa'],
  [155, '#38bdf8'],
  [170, '#4ade80'],
  [182, '#facc15'],
  [195, '#ef4444'],
] as const;
/** Vertical speed (m/h): descending blue, flat green, climbing hard red. */
const VS_STOPS = [
  [-1500, '#3b82f6'],
  [-400, '#38bdf8'],
  [0, '#4ade80'],
  [600, '#facc15'],
  [1000, '#fb923c'],
  [1500, '#ef4444'],
] as const;
/** Ski slope (degrees, like the piste colours): green, blue, red, then white for black runs. */
const SLOPE_STOPS = [
  [0, '#4ade80'],
  [12, '#3b82f6'],
  [22, '#ef4444'],
  [32, '#f8fafc'],
] as const;

export interface MetricRole {
  role: string;
  name: CoreKey;
  /** Key of METRIC_SLUGS for file names. */
  slug: string;
  requires: MetricKey;
  /** Offered only for these sports; missing = any. */
  sports?: Sport[];
  icon: LineIcon;
  template: (style: OverlayStyle) => string;
  value: (s: RideSample, style: OverlayStyle, ride: RideData) => string;
  unit: (style: OverlayStyle) => string;
  /** Position along the scale (0..1) and where the scale's zero is (0.5 for signed values). */
  arc: (s: RideSample, style: OverlayStyle, ride: RideData) => { f: number; origin: number };
  color: (s: RideSample, style: OverlayStyle, ride: RideData) => string;
  zone?: 'hr' | 'power';
  /** A short second line (average/max, ride total, W/kg…); '' when there is none. */
  secondary?: (s: RideSample, style: OverlayStyle, ride: RideData) => string;
}

function signed(v: number, decimals: number): string {
  if (!Number.isFinite(v)) return '—';
  const s = fmt(v, decimals);
  return v > 0 && /[1-9]/.test(s) ? `+${s}` : s;
}

function avgMax(m: 'speed' | 'cadence' | 'heartRate' | 'power', decimals: number) {
  const info = PANEL_METRIC_INFO[m];
  return (s: RideSample, style: OverlayStyle, ride: RideData) => {
    const st = beforeStart(ride, s) ? { avg: NaN, max: NaN } : statsUpTo(ride, info, s.index);
    return `${tr(style.language, 'dial.avg')} ${fmt(info.toDisplay(st.avg, style), decimals)} · ${tr(style.language, 'dial.max')} ${fmt(info.toDisplay(st.max, style), decimals)}`;
  };
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : NaN);

export const METRIC_ROLES: MetricRole[] = [
  {
    role: 'speed',
    name: 'metric.speed',
    slug: 'speed',
    requires: 'speed',
    sports: ['cycling', 'snow'],
    icon: 'gauge',
    template: () => '88,8',
    value: (s, st) => fmt(convert.speed(s.speed, st.units), 1),
    unit: (st) => convert.speedUnit(st.units),
    arc: metricArc('speed'),
    color: (s) => ramp(SPEED_STOPS, s.speed * 3.6),
    secondary: avgMax('speed', 1),
  },
  {
    role: 'pace',
    name: 'metric.pace',
    slug: 'pace',
    requires: 'pace',
    sports: ['running'],
    icon: 'stopwatch',
    template: () => `88'88"`,
    value: (s, st) => formatPace(s.speed, st.units),
    unit: (st) => paceUnit(st.units),
    arc: metricArc('speed'),
    color: (s) => ramp(PACE_STOPS, s.speed * 3.6),
  },
  {
    role: 'heartRate',
    name: 'metric.heartRate',
    slug: 'heartRate',
    requires: 'heartRate',
    icon: 'heart',
    template: () => '188',
    value: (s) => fmt(s.heartRate, 0),
    unit: () => 'bpm',
    arc: metricArc('heartRate'),
    color: (s, st) => hrColor(s.heartRate, st),
    zone: 'hr',
    secondary: avgMax('heartRate', 0),
  },
  {
    role: 'cadence',
    name: 'metric.cadence',
    slug: 'cadence',
    requires: 'cadence',
    sports: ['cycling'],
    icon: 'cadence',
    template: () => '188',
    value: (s) => fmt(s.cadence, 0),
    unit: () => 'rpm',
    arc: metricArc('cadence'),
    color: (s) => ramp(CADENCE_STOPS, s.cadence),
    secondary: avgMax('cadence', 0),
  },
  {
    role: 'steps',
    name: 'metric.steps',
    slug: 'steps',
    requires: 'cadence',
    sports: ['running'],
    icon: 'cadence',
    template: () => '188',
    value: (s, _st, ride) => fmt(stepsPerMin(s.cadence, ride), 0),
    unit: () => 'spm',
    arc: (s, _st, ride) => ({ f: clamp01((stepsPerMin(s.cadence, ride) - 120) / 80), origin: 0 }),
    color: (s, _st, ride) => ramp(STEPS_STOPS, stepsPerMin(s.cadence, ride)),
  },
  {
    role: 'power',
    name: 'metric.power',
    slug: 'power',
    requires: 'power',
    sports: ['cycling', 'running'],
    icon: 'bolt',
    template: () => '1888',
    value: (s) => fmt(s.power, 0),
    unit: () => 'W',
    arc: metricArc('power'),
    color: (s, st) => powerColor(s.power, st),
    zone: 'power',
    secondary: (s, st) => wkgText(s.power, st),
  },
  {
    role: 'grade',
    name: 'metric.grade',
    slug: 'grade',
    requires: 'grade',
    sports: ['cycling', 'running'],
    icon: 'grade',
    template: () => '+88,8',
    value: (s) => signed(s.grade, 1),
    unit: () => '%',
    arc: metricArc('grade'),
    color: (s) => ramp(GRADE_STOPS, s.grade),
  },
  {
    role: 'slope',
    name: 'metric.slope',
    slug: 'slopeDeg',
    requires: 'grade',
    sports: ['snow'],
    icon: 'grade',
    template: () => '88',
    value: (s) => fmt(Math.abs(slopeDegrees(s.grade)), 0),
    unit: () => '°',
    arc: (s) => ({ f: clamp01(Math.abs(slopeDegrees(s.grade)) / 40), origin: 0 }),
    color: (s) => ramp(SLOPE_STOPS, Math.abs(slopeDegrees(s.grade))),
  },
  {
    role: 'altitude',
    name: 'metric.altitude',
    slug: 'altitude',
    requires: 'altitude',
    icon: 'mountain',
    template: (st) => (st.units.system === 'metric' ? '8888' : '88888'),
    value: (s, st) => fmt(convert.elevation(s.altitude, st.units), 0),
    unit: (st) => convert.elevationUnit(st.units),
    arc: metricArc('altitude'),
    color: (s) => ramp(ALTITUDE_STOPS, s.altitude),
    secondary: (s, st, ride) => {
      if (beforeStart(ride, s)) return '';
      const u = convert.elevationUnit(st.units);
      return `↑ ${fmt(convert.elevation(s.elevationGain, st.units), 0)} ${u}  ↓ ${fmt(convert.elevation(elevationLossAt(ride, s), st.units), 0)} ${u}`;
    },
  },
  {
    role: 'verticalSpeed',
    name: 'metric.verticalSpeed',
    slug: 'verticalSpeed',
    requires: 'verticalSpeed',
    sports: ['running', 'snow'],
    icon: 'mountain',
    template: (st) => (st.units.system === 'metric' ? '+8888' : '+88888'),
    value: (s, st, ride) => signed(convert.elevation(verticalSpeedAt(ride, s), st.units), 0),
    unit: (st) => `${convert.elevationUnit(st.units)}/h`,
    arc: (s, _st, ride) => ({ f: clamp01((verticalSpeedAt(ride, s) + 2000) / 4000), origin: 0.5 }),
    color: (s, _st, ride) => ramp(VS_STOPS, verticalSpeedAt(ride, s)),
  },
  {
    role: 'runs',
    name: 'metric.runs',
    slug: 'runs',
    requires: 'runs',
    sports: ['snow'],
    icon: 'mountain',
    template: () => '88',
    value: (s, _st, ride) => (beforeStart(ride, s) ? '0' : String(skiRuns(ride).count[s.index])),
    unit: () => '',
    arc: (s, _st, ride) => {
      const r = skiRuns(ride);
      return { f: clamp01(r.count[s.index] / Math.max(1, r.count[r.count.length - 1])), origin: 0 };
    },
    color: () => '#67e8f9',
    secondary: (s, st, ride) => {
      if (beforeStart(ride, s)) return '';
      const r = skiRuns(ride);
      return `${tr(st.language, 'kit.drop')} ${fmt(convert.elevation(r.drop[s.index], st.units), 0)} ${convert.elevationUnit(st.units)}`;
    },
  },
  {
    role: 'distance',
    name: 'metric.distance',
    slug: 'distance',
    requires: 'distance',
    icon: 'route',
    template: () => '188,8',
    value: (s, st) => fmt(convert.distance(s.distance, st.units), 1),
    unit: (st) => convert.distanceUnit(st.units),
    arc: (s, _st, ride) => ({ f: clamp01(progressOf('distance', s, ride)), origin: 0 }),
    color: (s, _st, ride) => ramp(DISTANCE_STOPS, progressOf('distance', s, ride)),
    secondary: (_s, st, ride) => `${tr(st.language, 'dial.total')} ${fmt(convert.distance(ride.totals.distanceM, st.units), 1)} ${convert.distanceUnit(st.units)}`,
  },
  {
    role: 'time',
    name: 'metric.elapsedTime',
    slug: 'elapsedTime',
    requires: 'elapsedTime',
    icon: 'stopwatch',
    template: () => '8:88:88',
    value: (s, _st, ride) => (beforeStart(ride, s) ? formatDuration(0) : formatDuration(s.elapsedMs)),
    unit: () => '',
    arc: (s, _st, ride) => ({ f: clamp01(progressOf('time', s, ride)), origin: 0 }),
    color: (s, _st, ride) => ramp(TIME_STOPS, progressOf('time', s, ride)),
    secondary: (_s, st, ride) => `${tr(st.language, 'dial.total')} ${formatDuration(ride.totals.durationMs)}`,
  },
  {
    role: 'temperature',
    name: 'metric.temperature',
    slug: 'temperature',
    requires: 'temperature',
    icon: 'thermo',
    template: () => '-88',
    value: (s, st) => fmt(convert.temperature(s.temperature, st.units), 0),
    unit: (st) => convert.temperatureUnit(st.units),
    arc: metricArc('temperature'),
    color: (s) => ramp(TEMPERATURE_STOPS, s.temperature),
  },
];

export function metricRole(role: string): MetricRole {
  const r = METRIC_ROLES.find((m) => m.role === role);
  if (!r) throw new Error(`Unknown metric role: ${role}`);
  return r;
}
