import { describe, expect, it } from 'vitest';
import { activityForClip, buildRide, stravaToRaw, type StravaStreams } from '../src/index.ts';

const ACTIVITY = { id: 1, name: 'Volta de sábado', start_date: '2026-10-11T08:00:31Z', utc_offset: 3600, device_name: 'iGPSPORT iGS800' };
const STREAMS: StravaStreams = {
  time: { data: [0, 1, 2, 4] },
  latlng: { data: [[41.1, -8.6], [41.1001, -8.6001], [41.1002, -8.6002], [41.1004, -8.6004]] },
  altitude: { data: [100, 101, 101.5, 103] },
  velocity_smooth: { data: [5, 6, 6.5, 7] },
  heartrate: { data: [120, 122, 125, 130] },
  watts: { data: [200, null, 220, 230] },
  distance: { data: [0, 6, 12.5, 26.5] },
};

describe('Strava activities', () => {
  it('turns the streams into raw samples at the activity start', () => {
    const raw = stravaToRaw(ACTIVITY, STREAMS);
    expect(raw.source).toBe('strava');
    expect(raw.name).toBe('Volta de sábado');
    expect(raw.device).toBe('iGPSPORT iGS800');
    expect(raw.localOffsetMs).toBe(3600_000);
    expect(raw.samples).toHaveLength(4);
    expect(raw.samples[0]).toMatchObject({ t: Date.parse('2026-10-11T08:00:31Z'), lat: 41.1, lon: -8.6, altitude: 100, speed: 5, heartRate: 120, power: 200, distance: 0 });
    expect(raw.samples[1].power).toBeUndefined(); // a null in the stream is a missing value
    expect(raw.samples[3].t - raw.samples[0].t).toBe(4000);
    expect(raw.samples[0].cadence).toBeUndefined();
    // The ride builder takes it like a FIT file
    const ride = buildRide(raw);
    expect(ride.available.has('speed')).toBe(true);
    expect(ride.available.has('heartRate')).toBe(true);
    expect(ride.startTime).toBe(Date.parse('2026-10-11T08:00:31Z'));
  });

  it('needs a time stream', () => {
    expect(() => stravaToRaw(ACTIVITY, { heartrate: { data: [1] } })).toThrow();
  });

  it('finds the activity a clip was filmed in', () => {
    const h = 3600_000;
    const acts = [
      { id: 'morning', startMs: 8 * h, elapsedMs: 2 * h },
      { id: 'evening', startMs: 18 * h, elapsedMs: 1 * h },
    ];
    expect(activityForClip(acts, 9 * h)?.id).toBe('morning');
    expect(activityForClip(acts, 18.5 * h)?.id).toBe('evening');
    // Just before the start (camera clock a few minutes off): still that activity
    expect(activityForClip(acts, 8 * h - 3 * 60_000)?.id).toBe('morning');
    // Between them: the nearest within 2 h
    expect(activityForClip(acts, 11 * h)?.id).toBe('morning');
    expect(activityForClip(acts, 14 * h)).toBeUndefined();
  });
});
