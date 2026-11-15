// Activities from the Strava API: the activity's streams (GET /activities/{id}/streams, key_by_type=true) become
// the same raw telemetry a FIT or GPX file gives, so everything after it (ride, sync, gadgets) is unchanged.
import type { RawSample, RawTelemetry } from './types.ts';

/** The stream keys asked for: everything the gadgets can show. */
export const STRAVA_STREAM_KEYS = ['time', 'latlng', 'altitude', 'velocity_smooth', 'heartrate', 'cadence', 'watts', 'temp', 'distance'] as const;

export interface StravaStream<T> {
  data: T[];
}

/** Streams keyed by type, as the API answers with key_by_type=true (any of them may be missing). */
export interface StravaStreams {
  time?: StravaStream<number>;
  latlng?: StravaStream<[number, number]>;
  altitude?: StravaStream<number>;
  velocity_smooth?: StravaStream<number>;
  heartrate?: StravaStream<number>;
  cadence?: StravaStream<number>;
  watts?: StravaStream<number | null>;
  temp?: StravaStream<number>;
  distance?: StravaStream<number>;
}

/** The fields used from the activity (GET /activities/{id} or an item of /athlete/activities). */
export interface StravaActivity {
  id: number;
  name?: string;
  /** ISO date in UTC of the first sample. */
  start_date: string;
  /** Seconds between local time and UTC at the start. */
  utc_offset?: number;
  device_name?: string;
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Raw telemetry from an activity and its streams. Throws when there is no time stream to place the samples. */
export function stravaToRaw(activity: StravaActivity, streams: StravaStreams): RawTelemetry {
  const time = streams.time?.data;
  const start = Date.parse(activity.start_date);
  if (!time?.length || Number.isNaN(start)) throw new Error('Strava activity without a time stream');
  const at = <T>(s: StravaStream<T> | undefined, i: number): T | undefined => s?.data[i];
  const samples: RawSample[] = time.map((sec, i) => {
    const ll = at(streams.latlng, i);
    return {
      t: start + sec * 1000,
      lat: ll ? num(ll[0]) : undefined,
      lon: ll ? num(ll[1]) : undefined,
      altitude: num(at(streams.altitude, i)),
      speed: num(at(streams.velocity_smooth, i)),
      distance: num(at(streams.distance, i)),
      heartRate: num(at(streams.heartrate, i)),
      cadence: num(at(streams.cadence, i)),
      power: num(at(streams.watts, i)),
      temperature: num(at(streams.temp, i)),
    };
  });
  return {
    source: 'strava',
    name: activity.name,
    device: activity.device_name,
    localOffsetMs: activity.utc_offset !== undefined ? activity.utc_offset * 1000 : undefined,
    samples,
  };
}

/**
 * The activity a clip was filmed in: the one whose span contains the clip's start (with a margin for clocks that
 * drift), else the nearest one starting within `maxGapMs`. Activities carry their start (UTC ms) and elapsed time.
 */
export function activityForClip<T extends { startMs: number; elapsedMs: number }>(activities: T[], clipStartMs: number, maxGapMs = 2 * 3600_000): T | undefined {
  const margin = 5 * 60_000;
  const inside = activities.find((a) => clipStartMs >= a.startMs - margin && clipStartMs <= a.startMs + a.elapsedMs + margin);
  if (inside) return inside;
  let best: T | undefined;
  let bestGap = maxGapMs;
  for (const a of activities) {
    const gap = Math.min(Math.abs(clipStartMs - a.startMs), Math.abs(clipStartMs - (a.startMs + a.elapsedMs)));
    if (gap <= bestGap) {
      best = a;
      bestGap = gap;
    }
  }
  return best;
}
