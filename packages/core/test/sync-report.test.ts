import { describe, expect, it } from 'vitest';
import { addClips, clipOverlaps, clipSyncInfo, effectiveStart, formatOffset, syncReport, type ClipMetadata, type SyncState } from '../src/index.ts';

const meta = (o: Partial<ClipMetadata>): ClipMetadata => ({
  fileName: 'x.mp4',
  sizeBytes: 1000,
  durationMs: 60_000,
  handlers: ['vide'],
  handlerNames: [],
  hasGpmf: false,
  tags: {},
  fps: { num: 50, den: 1 },
  ...o,
});

// A race of 2 h 10 min starting 09:00 local (08:00 UTC), filmed in three separate moments.
const ride = { startTime: Date.UTC(2026, 9, 18, 8, 0), endTime: Date.UTC(2026, 9, 18, 10, 10) };
const race = (): SyncState =>
  addClips({ cameras: [], clips: [] }, [
    meta({ fileName: 'DJI_20261018090000_0001_D.MP4', durationMs: 10 * 60_000 }),
    meta({ fileName: 'DJI_20261018094500_0002_D.MP4', durationMs: 15 * 60_000 }),
    meta({ fileName: 'DJI_20261018102000_0003_D.MP4', durationMs: 10 * 60_000 }),
  ]);

describe('clips of different moments of the same ride', () => {
  it('each clip keeps its own start, and a clip adjustment moves only that clip', () => {
    let s = race();
    const cam = s.cameras[0];
    const starts = () => s.clips.map((c) => (effectiveStart(c, cam)! - ride.startTime) / 60_000);
    expect(starts()).toEqual([0, 45, 80]);
    s = { ...s, clips: s.clips.map((c, i) => (i === 1 ? { ...c, clipOffsetMs: 1500 } : c)) };
    expect(starts()).toEqual([0, 45.025, 80]);
    expect(clipOverlaps(s).size).toBe(0);
  });

  it('flags clips of one camera that overlap in time (one start must be wrong)', () => {
    const s = addClips({ cameras: [], clips: [] }, [
      meta({ fileName: 'DJI_20261018090000_0001_D.MP4', durationMs: 10 * 60_000 }),
      meta({ fileName: 'DJI_20261018090500_0002_D.MP4', durationMs: 10 * 60_000 }),
      meta({ fileName: 'DJI_20261018091500_0003_D.MP4', durationMs: 60_000 }),
    ]);
    const o = clipOverlaps(s);
    expect(o.get(s.clips[0].id)).toEqual(['DJI_20261018090500_0002_D.MP4']);
    expect(o.get(s.clips[1].id)).toEqual(['DJI_20261018090000_0001_D.MP4']);
    expect(o.has(s.clips[2].id)).toBe(false);
    const info = clipSyncInfo(s.clips[0], s.cameras[0], ride, o.get(s.clips[0].id));
    expect(info.warnings.join(' ')).toMatch(/Sobrepõe-se a DJI_20261018090500_0002_D\.MP4/);
  });

  it('touching files of one long recording are not an overlap', () => {
    const s = addClips({ cameras: [], clips: [] }, [
      meta({ fileName: 'DJI_20261018090000_0001_D.MP4', durationMs: 60_000 + 300 }),
      meta({ fileName: 'DJI_20261018090100_0002_D.MP4', durationMs: 60_000 }),
    ]);
    expect(clipOverlaps(s).size).toBe(0);
  });

  it('the report lists the start, where it came from, the offsets and the place in the ride', () => {
    let s = race();
    s = { ...s, clips: s.clips.map((c, i) => (i === 2 ? { ...c, clipOffsetMs: -2300 } : c)) };
    const cam = s.cameras[0];
    const text = syncReport({
      rideName: 'Prova',
      ride,
      timeZone: 'Europe/Lisbon',
      exportedAt: ride.endTime,
      version: '1.0.1',
      clips: s.clips.map((c) => clipSyncInfo(c, cam, ride)),
    });
    expect(text).toMatch(/^telemeSYNC 1\.0\.1 · relatório de sincronização/);
    expect(text).toContain('1. DJI_20261018090000_0001_D.MP4');
    expect(text).toContain('Início usado: 18/10/2026 09:45:00,0 · fim 18/10/2026 10:00:00,0 · duração 0:15:00 · 50 fps');
    expect(text).toContain('Na volta: de 0:45:00 a 1:00:00 desde o início da telemetria');
    expect(text).toContain('Origem da hora: nome do ficheiro (18/10/2026 10:20:00,0)');
    expect(text).toContain('Offset da câmara: +00,0 s · ajuste só deste clip: −02,3 s');
    expect(text).toContain('Início usado: 18/10/2026 10:19:57,7');
  });

  it('formats offsets in seconds, minutes and hours', () => {
    expect(formatOffset(1200)).toBe('+01,2 s');
    expect(formatOffset(-123_000)).toBe('−2 min 03,0 s');
    expect(formatOffset(3_600_000)).toBe('+1 h 00 min 00,0 s');
  });
});
