import { describe, expect, it } from 'vitest';
import { readClipMetadata, type ByteSource } from '../src/media/isobmff.ts';
import { gpsTimeInPayload, parseGpsu } from '../src/media/gpmf.ts';
import { addClips, effectiveStart } from '../src/index.ts';

// --- tiny writers for GPMF (KLV) and MP4 boxes ---

const cat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) (out.set(p, o), (o += p.length));
  return out;
};
const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const u32 = (...v: number[]) => {
  const b = new Uint8Array(v.length * 4);
  v.forEach((x, i) => new DataView(b.buffer).setUint32(i * 4, x));
  return b;
};

function klv(key: string, type: string | 0, structSize: number, repeat: number, data: Uint8Array): Uint8Array {
  const head = new Uint8Array(8);
  head.set(ascii(key));
  head[4] = type === 0 ? 0 : type.charCodeAt(0);
  head[5] = structSize;
  new DataView(head.buffer).setUint16(6, repeat);
  const padded = new Uint8Array((data.length + 3) & ~3);
  padded.set(data);
  return cat(head, padded);
}
const nest = (key: string, ...kids: Uint8Array[]) => {
  const body = cat(...kids);
  return klv(key, 0, 1, body.length, body);
};

/** A GPS5-era payload (HERO5–10): GPSF fix and GPSU time, plus an unrelated stream before it. */
const gps5Payload = (fix: number, gpsu: string) =>
  nest('DEVC', nest('STRM', klv('STNM', 'c', 1, 5, ascii('Accel'))), nest('STRM', klv('GPSF', 'L', 4, 1, u32(fix)), klv('GPSU', 'U', 16, 1, ascii(gpsu))));

function box(type: string, ...payload: Uint8Array[]): Uint8Array {
  const body = cat(...payload);
  return cat(u32(8 + body.length), ascii(type), body);
}

/** An MP4 with only a GoPro metadata track: payloads of 1.001 s each, one per chunk, in the mdat. */
function goproFile(payloads: Uint8Array[]): Uint8Array {
  const ftyp = box('ftyp', ascii('mp41'), u32(0));
  const mdatHeader = 8;
  const offsets: number[] = [];
  let o = ftyp.length + mdatHeader;
  for (const p of payloads) (offsets.push(o), (o += p.length));
  const mdat = box('mdat', ...payloads);
  const n = payloads.length;
  const stbl = box(
    'stbl',
    box('stsd', u32(0, 1), box('gpmd', new Uint8Array(8))),
    box('stts', u32(0, 1, n, 1001)),
    box('stsc', u32(0, 1, 1, 1, 1)),
    box('stsz', u32(0, 0, n, ...payloads.map((p) => p.length))),
    box('stco', u32(0, n, ...offsets)),
  );
  const mdia = box('mdia', box('mdhd', u32(0, 0, 0, 1000, n * 1001, 0)), box('hdlr', u32(0, 0), ascii('meta'), new Uint8Array(12), ascii('GoPro MET\0')), box('minf', stbl));
  const mvhd = box('mvhd', u32(0, 0, 0, 1000, n * 1001), new Uint8Array(80));
  return cat(ftyp, mdat, box('moov', mvhd, box('trak', mdia)));
}

const source = (b: Uint8Array): ByteSource => ({ size: b.length, read: async (o, l) => b.slice(o, o + l) });

describe('GoPro GPS time (GPMF)', () => {
  it('parses GPSU', () => {
    expect(parseGpsu('261115103046.001')).toBe(Date.UTC(2026, 10, 15, 10, 30, 46, 1));
    expect(parseGpsu('000101000000.000')).toBeUndefined(); // default clock before a fix
  });

  it('start of the clip = first GPS time with a fix minus when that payload plays', async () => {
    // Payload 0 has no fix yet (stale time); payload 1 (plays at 1.001 s) has a 3D fix at 10:30:46.001 UTC.
    const file = goproFile([gps5Payload(0, '160101000000.000'), gps5Payload(3, '261115103046.001'), gps5Payload(3, '261115103047.002')]);
    const m = await readClipMetadata(source(file), 'GX010042.MP4');
    expect(m.hasGpmf).toBe(true);
    expect(m.gpmfStartUtcMs).toBe(Date.UTC(2026, 10, 15, 10, 30, 45));
  });

  it('beats a wrong camera clock: the GoPro profile uses the GPS start', async () => {
    const file = goproFile([gps5Payload(3, '261115103045.000')]);
    const m = await readClipMetadata(source(file), 'GX010042.MP4');
    // Camera clock an hour off (creation_time 11:30 local)
    const state = addClips({ cameras: [], clips: [] }, [{ ...m, creationTimeRawMs: Date.UTC(2026, 10, 15, 11, 30, 45) }], undefined, 'Europe/Lisbon');
    expect(state.clips[0].resolved.source).toBe('gpmf');
    expect(effectiveStart(state.clips[0], state.cameras[0])).toBe(Date.UTC(2026, 10, 15, 10, 30, 45));
  });

  it('no fix in any payload: no GPS start', async () => {
    const m = await readClipMetadata(source(goproFile([gps5Payload(0, '261115103045.000')])), 'GX010042.MP4');
    expect(m.gpmfStartUtcMs).toBeUndefined();
  });

  it('GPS9 (HERO11+): the time of the first row with a fix', () => {
    const rows = 10;
    const row = (fix: number, days: number, secsMs: number) => {
      const b = new Uint8Array(32);
      const v = new DataView(b.buffer);
      v.setInt32(20, days);
      v.setInt32(24, secsMs);
      v.setUint16(30, fix);
      return b;
    };
    const days = Math.round((Date.UTC(2026, 10, 15) - Date.UTC(2000, 0, 1)) / 86_400_000);
    const data = cat(...Array.from({ length: rows }, (_, i) => row(i < 4 ? 0 : 3, days, (10 * 3600 + 30 * 60 + 45) * 1000 + i * 100)));
    const scal = new Uint8Array(36);
    [1e7, 1e7, 1000, 1000, 100, 1, 1000, 100, 1].forEach((x, i) => new DataView(scal.buffer).setInt32(i * 4, x));
    const payload = nest('DEVC', nest('STRM', klv('SCAL', 'l', 4, 9, scal), klv('TYPE', 'c', 1, 9, ascii('lllllllSS')), klv('GPS9', '?', 32, rows, data)));
    expect(gpsTimeInPayload(payload)).toEqual({ utcMs: Date.UTC(2026, 10, 15, 10, 30, 45, 400), at: 0.4 });
  });
});
