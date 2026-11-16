// Conditions for a gadget to appear and disappear in the video: e.g. speed only above 30 km/h, heart rate only above
// 170 bpm, gradient only below −5 % or above +5 %. When the condition stops holding, the gadget stays for a few
// seconds and then fades out; it fades in again when the condition holds. Shared by the preview and the exporter.
import { runSpeedAt, verticalSpeedAt } from '../metrics/running.ts';
import { slopeAt, slopeDegrees } from '../metrics/snow.ts';
import type { MetricKey, RideData } from '../telemetry/ride.ts';
import type { OverlayId, OverlayStyle } from './types.ts';

/** What a condition looks at. Values in base units: m/s, bpm, W, rpm (spm for running files), %, m, °C, s/km, m/h, °. */
export type ConditionMetric = 'speed' | 'heartRate' | 'power' | 'cadence' | 'grade' | 'altitude' | 'temperature' | 'pace' | 'verticalSpeed' | 'slope';

export const CONDITION_METRICS: ConditionMetric[] = ['speed', 'pace', 'heartRate', 'power', 'cadence', 'grade', 'slope', 'verticalSpeed', 'altitude', 'temperature'];

export interface GadgetCondition {
  metric: ConditionMetric;
  /** Shown while the value is above this (base units); null = no upper threshold. */
  above: number | null;
  /** Shown while the value is below this (base units); null = no lower threshold. Both set = outside the band. */
  below: number | null;
  /** Seconds the gadget stays after the condition stops holding, before fading out. */
  hideAfterS: number;
}

/** Fade in / out time (ms). */
export const FADE_MS = 400;

/** Channel of the ride each metric needs. */
const NEEDS: Record<ConditionMetric, MetricKey> = {
  speed: 'speed',
  pace: 'speed',
  heartRate: 'heartRate',
  power: 'power',
  cadence: 'cadence',
  grade: 'grade',
  slope: 'altitude',
  verticalSpeed: 'altitude',
  altitude: 'altitude',
  temperature: 'temperature',
};

/** True when the ride has what the metric needs. */
export function conditionMetricAvailable(ride: RideData, m: ConditionMetric): boolean {
  return ride.available.has(NEEDS[m]);
}

const OWN: [ConditionMetric, OverlayId[]][] = [
  ['speed', ['speed', 'panelSpeed', 'dialSpeed', 'natalSpeed', 'natalSpeedLog', 'snowDialSpeed', 'maxSpeed']],
  ['heartRate', ['heartRate', 'panelHeartRate', 'dialHeartRate', 'natalHeartRate', 'natalHeartRateReindeer', 'runDialHeartRate', 'snowDialHeartRate']],
  ['power', ['power', 'panelPower', 'dialPower', 'natalPower', 'natalPowerWreath']],
  ['cadence', ['cadence', 'panelCadence', 'dialCadence', 'natalCadence', 'runCadence', 'runDialCadence']],
  ['grade', ['grade', 'panelGrade', 'dialGrade', 'natalGrade', 'natalGradeWarning', 'runDialGrade']],
  ['altitude', ['altitude', 'panelAltitude', 'dialAltitude', 'natalAltitude', 'natalAltitudeCabin', 'runDialAltitude', 'snowDialAltitude']],
  ['temperature', ['temperature', 'panelTemperature', 'dialTemperature', 'natalTemperature', 'snowDialTemperature']],
  ['pace', ['pace', 'gap', 'runDialPace']],
  ['verticalSpeed', ['verticalSpeed', 'runDialVertical']],
  ['slope', ['slope', 'snowDialSlope']],
];
const OWN_METRIC = new Map<OverlayId, ConditionMetric>(OWN.flatMap(([m, ids]) => ids.map((id) => [id, m] as [OverlayId, ConditionMetric])));

/** The gadget's own metric (the one it shows), if it has one: the default metric of its condition. */
export function ownConditionMetric(id: OverlayId): ConditionMetric | undefined {
  return OWN_METRIC.get(id);
}

/** Starting thresholds of a condition on a metric (base units): what most people would pick first. */
export function startingThresholds(m: ConditionMetric): Pick<GadgetCondition, 'above' | 'below'> {
  const table: Record<ConditionMetric, Pick<GadgetCondition, 'above' | 'below'>> = {
    speed: { above: 30 / 3.6, below: null },
    pace: { above: null, below: 300 },
    heartRate: { above: 170, below: null },
    power: { above: 300, below: null },
    cadence: { above: 100, below: null },
    grade: { above: 5, below: -5 },
    slope: { above: 20, below: null },
    verticalSpeed: { above: 600, below: null },
    altitude: { above: 1000, below: null },
    temperature: { above: 30, below: null },
  };
  return table[m];
}

/** A new condition for a gadget: its own metric (or speed, or the first the ride has), and 3 s before hiding. */
export function defaultCondition(id: OverlayId, ride?: RideData): GadgetCondition {
  const own = ownConditionMetric(id);
  const metric = own ?? (ride && !conditionMetricAvailable(ride, 'speed') ? CONDITION_METRICS.find((m) => conditionMetricAvailable(ride, m)) ?? 'speed' : 'speed');
  return { metric, ...startingThresholds(metric), hideAfterS: 3 };
}

/** A condition read from a project or the saved settings: only well-formed ones count. */
export function validCondition(v: unknown): GadgetCondition | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const c = v as Record<string, unknown>;
  if (!CONDITION_METRICS.includes(c.metric as ConditionMetric)) return undefined;
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  const above = num(c.above);
  const below = num(c.below);
  if (above === null && below === null) return undefined;
  return { metric: c.metric as ConditionMetric, above, below, hideAfterS: Math.max(0, Math.min(600, num(c.hideAfterS) ?? 3)) };
}

/** Value of a metric at sample i (base units; NaN where unknown). */
function valueAt(ride: RideData, m: ConditionMetric, i: number, style: Pick<OverlayStyle, 'powerSmoothing'>): number {
  switch (m) {
    case 'speed':
      return ride.speed[i];
    case 'pace': {
      const v = runSpeedAt(ride, ride.t[i]);
      return v > 0.3 ? 1000 / v : Infinity; // stopped = endlessly slow
    }
    case 'heartRate':
      return ride.heartRate[i];
    case 'power':
      return style.powerSmoothing === '3s' ? ride.power3s[i] : ride.power[i];
    case 'cadence':
      return ride.cadence[i];
    case 'grade':
      return ride.grade[i];
    case 'slope': {
      const pct = slopeAt(ride, i);
      return Number.isFinite(pct) ? slopeDegrees(Math.max(0, -pct)) : NaN;
    }
    case 'verticalSpeed':
      return verticalSpeedAt(ride, ride.t[i]);
    case 'altitude':
      return ride.altitude[i];
    case 'temperature':
      return ride.temperature[i];
  }
}

/** True when the value meets the condition (above the upper threshold, or below the lower one). */
export function conditionHolds(c: GadgetCondition, v: number): boolean {
  if (Number.isNaN(v)) return false;
  return (c.above !== null && v > c.above) || (c.below !== null && v < c.below);
}

/** Stretches of the ride where the gadget is on screen (UTC ms), the hiding delay included. */
type Spans = Float64Array; // [start0, end0, start1, end1, …], sorted, not overlapping

const spansCache = new WeakMap<RideData, Map<string, Spans>>();

export function visibleSpans(ride: RideData, c: GadgetCondition, style: Pick<OverlayStyle, 'powerSmoothing'>): Spans {
  const key = `${c.metric}|${c.above}|${c.below}|${c.hideAfterS}|${c.metric === 'power' ? style.powerSmoothing : ''}`;
  let byKey = spansCache.get(ride);
  if (!byKey) spansCache.set(ride, (byKey = new Map()));
  const hit = byKey.get(key);
  if (hit) return hit;
  const out: number[] = [];
  const n = ride.t.length;
  const hold = c.hideAfterS * 1000;
  for (let i = 0; i < n; i++) {
    if (!conditionHolds(c, valueAt(ride, c.metric, i, style))) continue;
    const start = ride.t[i];
    // Until the next sample (a gap in the recording counts as one second).
    const next = i + 1 < n ? ride.t[i + 1] : start + 1000;
    const end = (next - start > ride.gapThresholdMs ? start + 1000 : next) + hold;
    if (out.length && start <= out[out.length - 1]) out[out.length - 1] = Math.max(out[out.length - 1], end);
    else out.push(start, end);
  }
  const spans = Float64Array.from(out);
  byKey.set(key, spans);
  return spans;
}

/** Opacity of a gadget at instant t (0 hidden … 1 shown), with the fades. Gadgets without a condition: 1. */
export function gadgetOpacity(id: OverlayId, t: number, style: Pick<OverlayStyle, 'conditions' | 'powerSmoothing'>, ride: RideData): number {
  const c = style.conditions?.[id];
  // No condition, or one still without a value (being filled in): always shown.
  if (!c || (c.above === null && c.below === null)) return 1;
  const s = visibleSpans(ride, c, style);
  // Last span starting at or before t.
  let lo = 0;
  let hi = s.length / 2 - 1;
  let k = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (s[mid * 2] <= t) {
      k = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (k < 0) return 0;
  const start = s[k * 2];
  const end = s[k * 2 + 1];
  if (t >= end) return 0;
  return Math.max(0, Math.min(1, (t - start) / FADE_MS, (end - t) / FADE_MS));
}

/** True when any of these gadgets has a condition. */
export function hasConditions(ids: readonly OverlayId[], style: Pick<OverlayStyle, 'conditions'>): boolean {
  return ids.some((id) => !!style.conditions?.[id]);
}
