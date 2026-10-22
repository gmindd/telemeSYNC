import { DEFAULT_LANG, formatNumber, type Lang } from '../i18n/index.ts';

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

let numberLang: Lang = DEFAULT_LANG;

/** Language of the numbers drawn by the overlays (decimal point or comma). Set before drawing a frame. */
export function setNumberLang(lang: Lang | undefined) {
  numberLang = lang ?? DEFAULT_LANG;
}

/** Overlay number formatting: fixed decimals, separator of the overlay language. NaN → "—". */
export function fmt(v: number, decimals = 0): string {
  return formatNumber(v, decimals, numberLang);
}
