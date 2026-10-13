export type UnitSystem = 'metric' | 'imperial';
export type TemperatureUnit = 'C' | 'F';

export interface Units {
  system: UnitSystem;
  temperature: TemperatureUnit;
}

export const DEFAULT_UNITS: Units = { system: 'metric', temperature: 'C' };

export const convert = {
  speed: (ms: number, u: Units) => (u.system === 'metric' ? ms * 3.6 : ms * 2.2369363),
  speedUnit: (u: Units) => (u.system === 'metric' ? 'km/h' : 'mph'),
  distance: (m: number, u: Units) => (u.system === 'metric' ? m / 1000 : m / 1609.344),
  distanceUnit: (u: Units) => (u.system === 'metric' ? 'km' : 'mi'),
  elevation: (m: number, u: Units) => (u.system === 'metric' ? m : m * 3.2808399),
  elevationUnit: (u: Units) => (u.system === 'metric' ? 'm' : 'ft'),
  temperature: (c: number, u: Units) => (u.temperature === 'C' ? c : (c * 9) / 5 + 32),
  temperatureUnit: (u: Units) => (u.temperature === 'C' ? '°C' : '°F'),
};

/** Portuguese number formatting (decimal comma), fixed decimals. NaN → "—". */
export function fmt(v: number, decimals = 0): string {
  if (!Number.isFinite(v)) return '—';
  const s = v.toFixed(decimals);
  const clean = s === '-0' || /^-0[.,]0+$/.test(s) ? s.slice(1) : s;
  return clean.replace('.', ',');
}
