// Values of gadget conditions as the user sees them: km/h or mph, m or ft, °C or °F, pace as m:ss per km or mile.
// Conditions are stored in base units (see core overlays/visibility.ts), so changing units keeps them right.
import { convert, type ConditionMetric, type Units } from '@telemesync/core';

const MI = 1609.344;
const FT = 3.2808399;

/** Unit shown next to the value (`steps`: cadence of a run, in steps per minute). */
export function conditionUnit(m: ConditionMetric, u: Units, steps = false): string {
  switch (m) {
    case 'speed':
      return convert.speedUnit(u);
    case 'pace':
      return u.system === 'metric' ? 'min/km' : 'min/mi';
    case 'heartRate':
      return 'bpm';
    case 'power':
      return 'W';
    case 'cadence':
      return steps ? 'spm' : 'rpm';
    case 'grade':
      return '%';
    case 'slope':
      return '°';
    case 'verticalSpeed':
      return `${convert.elevationUnit(u)}/h`;
    case 'altitude':
      return convert.elevationUnit(u);
    case 'temperature':
      return convert.temperatureUnit(u);
  }
}

/** Step of the number field. */
export function conditionStep(m: ConditionMetric): number {
  return m === 'power' || m === 'altitude' ? 10 : m === 'verticalSpeed' ? 50 : m === 'grade' ? 0.5 : 1;
}

/** Base value → text in the field ("" for none). */
export function toDisplay(m: ConditionMetric, base: number | null, u: Units): string {
  if (base === null || !Number.isFinite(base)) return '';
  switch (m) {
    case 'speed':
      return String(Math.round(convert.speed(base, u) * 10) / 10);
    case 'pace': {
      const s = Math.round(u.system === 'metric' ? base : (base * MI) / 1000);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }
    case 'verticalSpeed':
    case 'altitude':
      return String(Math.round(convert.elevation(base, u)));
    case 'temperature':
      return String(Math.round(convert.temperature(base, u) * 10) / 10);
    default:
      return String(Math.round(base * 10) / 10);
  }
}

/** Text in the field → base value (null when empty, undefined when not a valid number yet). */
export function fromDisplay(m: ConditionMetric, text: string, u: Units): number | null | undefined {
  const s = text.trim().replace(',', '.');
  if (!s) return null;
  if (m === 'pace') {
    const mm = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(s);
    if (!mm) return undefined;
    const sec = Number(mm[1]) * 60 + Number(mm[2] ?? 0);
    if (!sec) return undefined;
    return u.system === 'metric' ? sec : (sec * 1000) / MI;
  }
  const v = Number(s);
  if (!Number.isFinite(v)) return undefined;
  switch (m) {
    case 'speed':
      return u.system === 'metric' ? v / 3.6 : v / 2.2369363;
    case 'verticalSpeed':
    case 'altitude':
      return u.system === 'metric' ? v : v / FT;
    case 'temperature':
      return u.temperature === 'C' ? v : ((v - 32) * 5) / 9;
    default:
      return v;
  }
}
