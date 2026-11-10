/** Metric keys that can be present in a telemetry file. */
export type ChannelKey =
  | 'position'
  | 'altitude'
  | 'speed'
  | 'distance'
  | 'heartRate'
  | 'cadence'
  | 'power'
  | 'temperature';

/** One raw sample as read from a FIT/GPX file. Missing values are undefined. */
export interface RawSample {
  /** UTC epoch milliseconds. */
  t: number;
  lat?: number;
  lon?: number;
  /** Metres. */
  altitude?: number;
  /** Metres per second. */
  speed?: number;
  /** Cumulative metres as recorded by the device. */
  distance?: number;
  heartRate?: number;
  cadence?: number;
  power?: number;
  /** Degrees Celsius. */
  temperature?: number;
}

export interface RawTelemetry {
  source: 'fit' | 'gpx';
  /** Human-friendly name (file name, GPX track name, …). */
  name?: string;
  /** Device / creator description if the file provides one. */
  device?: string;
  /** Offset between device local time and UTC at the start of the activity, if known (ms). */
  localOffsetMs?: number;
  samples: RawSample[];
  /** Names of the fields found in FIT record messages (diagnostics). */
  recordFields?: string[];
  /** Laps recorded by the device (lap button or auto-lap), UTC ms. */
  laps?: { startMs: number; endMs: number }[];
  /** Sport the file says it is (FIT session/sport, GPX track type), when it says. */
  sport?: Sport;
}

/** Sports the overlays are designed for. Walking and hiking count as running; skiing and snowboarding as snow. */
export type Sport = 'cycling' | 'running' | 'snow';
export const SPORTS: Sport[] = ['cycling', 'running', 'snow'];

/** Sport from a free text such as a GPX track type ("trail_running", "resort_skiing_snowboarding_ws"). */
export function sportFromText(text: string | undefined): Sport | undefined {
  const t = String(text ?? '').toLowerCase();
  if (!t) return undefined;
  if (/ski|snow/.test(t)) return 'snow';
  if (/run|walk|hik|trek|jog/.test(t)) return 'running';
  if (/cycl|bik|ride|velo|gravel|mtb/.test(t)) return 'cycling';
  return undefined;
}
