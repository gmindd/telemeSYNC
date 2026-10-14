import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildRide, CAMERA_PROFILES, parseTelemetryFile, resolveStart, sampleAt, type ClipMetadata } from '../src/index.ts';

const FIT = 'fixtures/real/ride-0-2026-10-11-09-00-31.fit';

describe('real ride: iGPSPORT 800, 2026-10-11 (with DJI Osmo Action clip)', () => {
  const raw = parseTelemetryFile(FIT, readFileSync(FIT));
  const ride = buildRide(raw);

  it('parses the iGPSPORT FIT (smart recording, 1–8 s intervals)', () => {
    expect(raw.device).toBe('igpsport 800');
    expect(ride.t.length).toBe(1760);
    expect(ride.startTime).toBe(Date.UTC(2026, 9, 11, 8, 0, 31));
    expect(raw.localOffsetMs).toBe(3600_000);
    expect(ride.totals.distanceM / 1000).toBeCloseTo(48.5, 1);
    expect([...ride.available]).not.toContain('cadence');
    expect([...ride.available]).not.toContain('power');
    expect([...ride.available]).toContain('heartRate');
  });

  it('stops (gaps with speed 0 before) show speed 0, not interpolated', () => {
    // 30 s gap from 09:21:43 local (08:21:43Z), 1.9 m travelled
    const g = sampleAt(ride, Date.UTC(2026, 9, 11, 8, 21, 55));
    expect(g.inGap).toBe(true);
    expect(g.speed).toBe(0);
  });

  it('grade stays within limits and has no absurd jumps', () => {
    let maxJump = 0;
    for (let i = 1; i < ride.grade.length; i++) {
      const a = ride.grade[i];
      const b = ride.grade[i - 1];
      if (Number.isFinite(a) && Number.isFinite(b)) maxJump = Math.max(maxJump, Math.abs(a - b));
      if (Number.isFinite(a)) expect(Math.abs(a)).toBeLessThanOrEqual(35);
    }
    expect(maxJump).toBeLessThan(15);
  });

  it('the DJI clip DJI_20261011094817_0011_D.MP4 falls inside the ride, moving', () => {
    const meta: ClipMetadata = {
      fileName: 'DJI_20261011094817_0011_D.MP4',
      sizeBytes: 1_189_471_135,
      durationMs: 85_000,
      creationTimeRawMs: Date.UTC(2026, 9, 11, 8, 48, 17),
      handlers: ['vide', 'soun'],
      handlerNames: [],
      hasGpmf: false,
      tags: {},
    };
    const r = resolveStart(meta, { profile: CAMERA_PROFILES.dji, timeZone: 'Europe/Lisbon' });
    expect(r.startUtcMs).toBe(Date.UTC(2026, 9, 11, 8, 48, 17));
    const s = sampleAt(ride, r.startUtcMs! + 30_000);
    expect(s.outside).toBe(false);
    expect(s.speed * 3.6).toBeGreaterThan(15);
  });
});
