// GoPro's own GPS clock: the GPMF metadata track ('gpmd') of a GoPro with GPS carries UTC time from the satellites,
// so the clip's start no longer depends on the camera's clock or time zone being set right.
// Format: https://github.com/gopro/gpmf-parser (KLV: fourcc, type, struct size, repeat, data padded to 4 bytes).
//  - HERO5–HERO10: stream GPS5 with GPSU ("yymmddhhmmss.sss", UTC) and GPSF (fix: 0 none, 2 2D, 3 3D) per payload.
//  - HERO11 and later: GPS9 samples carry their own time (days since 2000, seconds since midnight) and fix.

/** One sample of the gpmd track: where it is in the file and when it plays (seconds from the clip's start). */
export interface GpmfSample {
  offset: number;
  size: number;
  startS: number;
  durationS: number;
}

interface Klv {
  key: string;
  type: number;
  structSize: number;
  repeat: number;
  data: number;
  length: number;
}

function* klvs(b: Uint8Array, start: number, end: number): Generator<Klv> {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = start;
  while (o + 8 <= end) {
    const key = String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
    const structSize = b[o + 5];
    const repeat = v.getUint16(o + 6);
    const length = structSize * repeat;
    const data = o + 8;
    if (data + length > end || !/^[A-Z0-9 ]{4}$/i.test(key)) return;
    yield { key, type: b[o + 4], structSize, repeat, data, length };
    o = data + ((length + 3) & ~3);
  }
}

const TYPE_SIZE: Record<string, number> = { b: 1, B: 1, c: 1, s: 2, S: 2, l: 4, L: 4, f: 4, q: 4, d: 8, j: 8, J: 8, Q: 8 };

function readNumber(v: DataView, o: number, t: string): number {
  switch (t) {
    case 'b':
      return v.getInt8(o);
    case 'B':
    case 'c':
      return v.getUint8(o);
    case 's':
      return v.getInt16(o);
    case 'S':
      return v.getUint16(o);
    case 'l':
      return v.getInt32(o);
    case 'L':
      return v.getUint32(o);
    case 'f':
      return v.getFloat32(o);
    case 'd':
      return v.getFloat64(o);
    default:
      return NaN;
  }
}

function values(b: Uint8Array, k: Klv): number[] {
  const t = String.fromCharCode(k.type);
  const size = TYPE_SIZE[t];
  if (!size) return [];
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: number[] = [];
  for (let o = k.data; o + size <= k.data + k.length; o += size) out.push(readNumber(v, o, t));
  return out;
}

function text(b: Uint8Array, k: Klv): string {
  let s = '';
  for (let i = k.data; i < k.data + k.length && b[i]; i++) s += String.fromCharCode(b[i]);
  return s;
}

const plausible = (ms: number) => ms > Date.UTC(2015, 0, 1) && ms < Date.UTC(2100, 0, 1);

/** "yymmddhhmmss.sss" (UTC) → ms. */
export function parseGpsu(s: string): number | undefined {
  const m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2}(?:\.\d+)?)/.exec(s);
  if (!m) return undefined;
  const sec = Number(m[6]);
  const ms = Date.UTC(2000 + Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) + Math.round(sec * 1000);
  return plausible(ms) ? ms : undefined;
}

/**
 * The first GPS time with a fix in one payload: UTC ms, and how far into the payload it was taken (0–1).
 * Payloads without a fix are skipped (before lock the camera may write a stale or default time).
 */
export function gpsTimeInPayload(b: Uint8Array): { utcMs: number; at: number } | undefined {
  for (const devc of klvs(b, 0, b.length)) {
    if (devc.key !== 'DEVC' || devc.type !== 0) continue;
    for (const strm of klvs(b, devc.data, devc.data + devc.length)) {
      if (strm.key !== 'STRM' || strm.type !== 0) continue;
      let fix = -1;
      let gpsu: number | undefined;
      let scal: number[] = [];
      let type = '';
      for (const k of klvs(b, strm.data, strm.data + strm.length)) {
        if (k.key === 'GPSF') fix = values(b, k)[0] ?? -1;
        else if (k.key === 'GPSU') gpsu = parseGpsu(text(b, k));
        else if (k.key === 'SCAL') scal = values(b, k);
        else if (k.key === 'TYPE') type = text(b, k);
        else if (k.key === 'GPS9') {
          const t = gps9Time(b, k, type || 'lllllllSS', scal);
          if (t) return t;
        }
      }
      if (gpsu !== undefined && fix >= 2) return { utcMs: gpsu, at: 0 };
    }
  }
  return undefined;
}

/** GPS9 rows: lat, lon, alt, 2D speed, 3D speed, days since 2000, seconds since midnight, DOP, fix. */
function gps9Time(b: Uint8Array, k: Klv, type: string, scal: number[]): { utcMs: number; at: number } | undefined {
  const fields = type.split('');
  const offsets: number[] = [];
  let rowSize = 0;
  for (const f of fields) {
    offsets.push(rowSize);
    rowSize += TYPE_SIZE[f] ?? 0;
  }
  if (fields.length < 9 || rowSize !== k.structSize) return undefined;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const scale = (i: number) => (scal.length > 1 ? scal[i] : scal[0]) || 1;
  const field = (row: number, i: number) => readNumber(v, k.data + row * rowSize + offsets[i], fields[i]) / scale(i);
  for (let row = 0; row < k.repeat; row++) {
    if (field(row, 8) < 2) continue;
    const ms = Date.UTC(2000, 0, 1) + field(row, 5) * 86_400_000 + Math.round(field(row, 6) * 1000);
    if (plausible(ms)) return { utcMs: ms, at: row / k.repeat };
  }
  return undefined;
}

/**
 * UTC time of the clip's first frame from the GoPro's GPS: the first payload with a fix, minus when that payload
 * plays in the clip. Undefined when the camera has no GPS, GPS was off, or it never got a fix in the samples read.
 */
export async function gpmfStartUtcMs(read: (offset: number, length: number) => Promise<Uint8Array>, samples: GpmfSample[]): Promise<number | undefined> {
  for (const s of samples) {
    if (s.size <= 0 || s.size > 4 * 1024 * 1024) continue;
    const t = gpsTimeInPayload(await read(s.offset, s.size));
    if (t) return Math.round(t.utcMs - (s.startS + t.at * s.durationS) * 1000);
  }
  return undefined;
}
