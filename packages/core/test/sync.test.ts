import { describe, expect, it } from 'vitest';
import {
  addClips,
  CAMERA_PROFILES,
  chainChapters,
  detectProfile,
  effectiveStart,
  clipWarnings,
  parseFilenameTime,
  parseGoProChapter,
  resolveStart,
  tzOffsetMs,
  utcToWall,
  wallToUtc,
  type ClipMetadata,
} from '../src/index.ts';

const meta = (o: Partial<ClipMetadata>): ClipMetadata => ({
  fileName: 'x.mp4',
  sizeBytes: 1000,
  durationMs: 60_000,
  handlers: ['vide'],
  handlerNames: [],
  hasGpmf: false,
  tags: {},
  ...o,
});

describe('time zone (Europe/Lisbon)', () => {
  it('summer is UTC+1, winter is UTC+0', () => {
    expect(tzOffsetMs(Date.UTC(2024, 6, 1, 12))).toBe(3600_000);
    expect(tzOffsetMs(Date.UTC(2024, 0, 15, 12))).toBe(0);
  });
  it('wall → UTC round-trips across DST changes', () => {
    const wall = Date.UTC(2024, 5, 15, 10, 30, 0); // 10:30 local in June
    expect(wallToUtc(wall)).toBe(Date.UTC(2024, 5, 15, 9, 30, 0));
    expect(utcToWall(wallToUtc(wall))).toBe(wall);
    // Autumn ambiguous 01:30 on 2024-10-27 → first occurrence (still summer time, UTC 00:30)
    expect(wallToUtc(Date.UTC(2024, 9, 27, 1, 30))).toBe(Date.UTC(2024, 9, 27, 0, 30));
    // Spring gap 01:30 on 2024-03-31 does not exist → mapped with the pre-change offset
    expect(wallToUtc(Date.UTC(2024, 2, 31, 1, 30))).toBe(Date.UTC(2024, 2, 31, 1, 30));
  });
});

describe('file name timestamps', () => {
  it('DJI Osmo Action', () => {
    expect(parseFilenameTime('DJI_20240615093005_0001_D.MP4')).toEqual({ wallMs: Date.UTC(2024, 5, 15, 9, 30, 5), pattern: 'dji' });
  });
  it('Insta360', () => {
    expect(parseFilenameTime('VID_20240615_093005_00_001.insv')?.wallMs).toBe(Date.UTC(2024, 5, 15, 9, 30, 5));
    expect(parseFilenameTime('LRV_20240615_093005_11_001.insv')?.pattern).toBe('insta360');
  });
  it('generic and invalid', () => {
    expect(parseFilenameTime('2024-06-15 09.30.05.mp4')?.wallMs).toBe(Date.UTC(2024, 5, 15, 9, 30, 5));
    expect(parseFilenameTime('GX010123.MP4')).toBeUndefined();
    expect(parseFilenameTime('DJI_0001.MP4')).toBeUndefined();
  });
});

describe('camera profile detection', () => {
  it('by name and tags', () => {
    expect(detectProfile(meta({ fileName: 'GX010123.MP4' }))).toBe('gopro');
    expect(detectProfile(meta({ fileName: 'DJI_20240615093005_0001_D.MP4' }))).toBe('dji');
    expect(detectProfile(meta({ fileName: 'VID_20240615_093005_00_001.insv' }))).toBe('insta360');
    expect(detectProfile(meta({ fileName: 'clip.mp4', handlerNames: ['GoPro AVC'] }))).toBe('gopro');
    expect(detectProfile(meta({ fileName: 'clip.mp4' }))).toBe('generic');
  });
});

describe('timestamp resolvers', () => {
  const tz = 'Europe/Lisbon';
  it('GoPro: creation_time is local time stored as UTC', () => {
    const m = meta({ fileName: 'GX010001.MP4', creationTimeRawMs: Date.UTC(2024, 5, 15, 10, 30, 0) });
    const r = resolveStart(m, { profile: CAMERA_PROFILES.gopro, timeZone: tz });
    expect(r.source).toBe('creationTime');
    expect(r.startUtcMs).toBe(Date.UTC(2024, 5, 15, 9, 30, 0));
  });
  it('end-of-recording creation_time subtracts the duration', () => {
    const profile = { ...CAMERA_PROFILES.generic, creationTime: { clock: 'utc' as const, marks: 'end' as const } };
    const m = meta({ creationTimeRawMs: Date.UTC(2024, 5, 15, 9, 31, 0), durationMs: 60_000 });
    expect(resolveStart(m, { profile, timeZone: tz }).startUtcMs).toBe(Date.UTC(2024, 5, 15, 9, 30, 0));
  });
  it('DJI: file name first, creation_time kept as an alternative', () => {
    const m = meta({ fileName: 'DJI_20240615103005_0001_D.MP4', creationTimeRawMs: Date.UTC(2024, 5, 15, 10, 30, 5) });
    const r = resolveStart(m, { profile: CAMERA_PROFILES.dji, timeZone: tz });
    expect(r.source).toBe('filename');
    expect(r.startUtcMs).toBe(Date.UTC(2024, 5, 15, 9, 30, 5));
    expect(r.candidates.map((c) => c.resolver)).toEqual(['filename', 'creationTime']);
  });
  it('manual overrides everything', () => {
    const m = meta({ fileName: 'DJI_20240615103005_0001_D.MP4' });
    const r = resolveStart(m, { profile: CAMERA_PROFILES.dji, timeZone: tz, manualStartUtcMs: 123_000 });
    expect(r.source).toBe('manual');
    expect(r.startUtcMs).toBe(123_000);
  });
  it('timecode gives the local time of day', () => {
    const m = meta({ timecodeStartSec: 10 * 3600 + 30 * 60, creationTimeRawMs: Date.UTC(2024, 5, 15, 10, 29, 0) });
    const profile = { ...CAMERA_PROFILES.generic, resolvers: ['timecode' as const] };
    expect(resolveStart(m, { profile, timeZone: tz }).startUtcMs).toBe(Date.UTC(2024, 5, 15, 9, 30, 0));
  });
});

describe('GoPro chapters', () => {
  it('parses new and old naming', () => {
    expect(parseGoProChapter('GX010123.MP4')).toEqual({ group: 'GX0123', index: 1 });
    expect(parseGoProChapter('GX030123.MP4')).toEqual({ group: 'GX0123', index: 3 });
    expect(parseGoProChapter('GOPR0042.MP4')).toEqual({ group: 'GOPR0042', index: 1 });
    expect(parseGoProChapter('GP010042.MP4')).toEqual({ group: 'GOPR0042', index: 2 });
    expect(parseGoProChapter('DJI_0001.MP4')).toBeUndefined();
  });
  it('chapter N+1 starts where N ends', () => {
    const t0 = Date.UTC(2024, 5, 15, 9);
    const res = chainChapters([
      { id: 'b', fileName: 'GX020123.MP4', durationMs: 500_000, startUtcMs: t0 }, // wrong own timestamp
      { id: 'a', fileName: 'GX010123.MP4', durationMs: 531_531, startUtcMs: t0 },
      { id: 'c', fileName: 'GX030123.MP4', durationMs: 100_000 },
      { id: 'x', fileName: 'GX010124.MP4', durationMs: 1000, startUtcMs: t0 + 9e6 },
    ]);
    expect(res.get('a')?.derivedStartUtcMs).toBeUndefined();
    expect(res.get('b')?.derivedStartUtcMs).toBe(t0 + 531_531);
    expect(res.get('c')?.derivedStartUtcMs).toBe(t0 + 531_531 + 500_000);
    expect(res.get('x')?.group).toBe('GX0124');
  });
});

describe('sync session and sanity checks', () => {
  const rideStart = Date.UTC(2024, 5, 15, 8, 0);
  const rideEnd = Date.UTC(2024, 5, 15, 12, 0);

  it('one global offset per camera moves all its clips', () => {
    let s = addClips({ cameras: [], clips: [] }, [
      meta({ fileName: 'DJI_20240615100000_0001_D.MP4' }),
      meta({ fileName: 'DJI_20240615110000_0002_D.MP4' }),
      meta({ fileName: 'GX010001.MP4', creationTimeRawMs: Date.UTC(2024, 5, 15, 10, 15) }),
    ]);
    expect(s.cameras.map((c) => c.id).sort()).toEqual(['dji', 'gopro']);
    s = { ...s, cameras: s.cameras.map((c) => (c.id === 'dji' ? { ...c, offsetMs: 2500 } : c)) };
    const cam = (id: string) => s.cameras.find((c) => c.id === id)!;
    const starts = s.clips.map((c) => effectiveStart(c, cam(c.cameraId)));
    expect(starts).toEqual([Date.UTC(2024, 5, 15, 9, 0, 2, 500), Date.UTC(2024, 5, 15, 10, 0, 2, 500), Date.UTC(2024, 5, 15, 9, 15)]);
  });

  it('suggests a one-click time zone fix for exact-hour shifts', () => {
    const s = addClips({ cameras: [], clips: [] }, [meta({ fileName: 'DJI_20240615140000_0001_D.MP4', durationMs: 120_000 })]);
    // 14:00 local = 13:00 UTC, ride ends 12:00 UTC → +1h/-1h? shift -2h puts it at 11:00 UTC (inside)
    const w = clipWarnings(s.clips[0], s.cameras[0], rideStart, rideEnd);
    expect(w.map((x) => x.code)).toContain('outsideRide');
    const tzw = w.find((x) => x.code === 'timezoneSuspect')!;
    expect(tzw.suggestedOffsetMs).toBe(-2 * 3600_000);
  });

  it('flags an Insta360 Studio export (creation_time after the ride)', () => {
    const s = addClips({ cameras: [], clips: [] }, [
      meta({ fileName: 'VID_20240615_093000_00_001.mp4', creationTimeRawMs: Date.UTC(2024, 5, 20, 18, 0) }),
    ]);
    const w = clipWarnings(s.clips[0], s.cameras[0], rideStart, rideEnd);
    expect(w.map((x) => x.code)).toContain('exportedSuspect');
    expect(w.map((x) => x.code)).not.toContain('outsideRide'); // name-based start is inside
  });

  it('missing timestamp asks for manual input', () => {
    const s = addClips({ cameras: [], clips: [] }, [meta({ fileName: 'clip.mp4' })]);
    expect(clipWarnings(s.clips[0], s.cameras[0], rideStart, rideEnd)[0].code).toBe('noTimestamp');
  });
});
