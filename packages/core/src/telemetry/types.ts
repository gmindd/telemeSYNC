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
}
