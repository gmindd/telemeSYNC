import { LocalizedError } from '../i18n/index.ts';
/**
 * Minimal FIT decoder (own implementation, no third-party code). Reads the binary FIT container
 * and returns raw field values per message, for the few messages telemeSYNC needs.
 * Format reference: the public FIT protocol description (file header, definition and data messages,
 * compressed timestamp headers, developer fields).
 */

export interface FitMessage {
  /** Global message number (0 = file_id, 20 = record, 34 = activity…). */
  num: number;
  /** Field definition number → first value (invalid values are omitted). */
  fields: Map<number, number | string>;
}

interface FieldDef {
  num: number;
  size: number;
  baseType: number;
}

interface Definition {
  globalNum: number;
  littleEndian: boolean;
  fields: FieldDef[];
  devBytes: number;
  totalSize: number;
}

const TIMESTAMP_FIELD = 253;

/** Base type id (low 5 bits) → [size, invalid value]. */
const BASE: Record<number, { size: number; invalid: number | bigint | null }> = {
  0x00: { size: 1, invalid: 0xff }, // enum
  0x01: { size: 1, invalid: 0x7f }, // sint8
  0x02: { size: 1, invalid: 0xff }, // uint8
  0x03: { size: 2, invalid: 0x7fff }, // sint16
  0x04: { size: 2, invalid: 0xffff }, // uint16
  0x05: { size: 4, invalid: 0x7fffffff }, // sint32
  0x06: { size: 4, invalid: 0xffffffff }, // uint32
  0x07: { size: 1, invalid: null }, // string
  0x08: { size: 4, invalid: null }, // float32 (NaN pattern)
  0x09: { size: 8, invalid: null }, // float64
  0x0a: { size: 1, invalid: 0x00 }, // uint8z
  0x0b: { size: 2, invalid: 0x0000 }, // uint16z
  0x0c: { size: 4, invalid: 0x00000000 }, // uint32z
  0x0d: { size: 1, invalid: 0xff }, // byte
  0x0e: { size: 8, invalid: null }, // sint64
  0x0f: { size: 8, invalid: null }, // uint64
  0x10: { size: 8, invalid: null }, // uint64z
};

function readValue(view: DataView, offset: number, baseType: number, size: number, le: boolean): number | string | undefined {
  const id = baseType & 0x1f;
  const info = BASE[id];
  if (!info) return undefined;
  if (id === 0x07) {
    let s = '';
    for (let i = 0; i < size; i++) {
      const c = view.getUint8(offset + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    try {
      s = decodeURIComponent(escape(s));
    } catch {
      /* keep latin-1 */
    }
    return s || undefined;
  }
  if (size < info.size) return undefined;
  let v: number;
  switch (id) {
    case 0x00:
    case 0x02:
    case 0x0a:
    case 0x0d:
      v = view.getUint8(offset);
      break;
    case 0x01:
      v = view.getInt8(offset);
      break;
    case 0x03:
      v = view.getInt16(offset, le);
      break;
    case 0x04:
    case 0x0b:
      v = view.getUint16(offset, le);
      break;
    case 0x05:
      v = view.getInt32(offset, le);
      break;
    case 0x06:
    case 0x0c:
      v = view.getUint32(offset, le);
      break;
    case 0x08:
      v = view.getFloat32(offset, le);
      return Number.isFinite(v) ? v : undefined;
    case 0x09:
      v = view.getFloat64(offset, le);
      return Number.isFinite(v) ? v : undefined;
    default:
      return undefined; // 64-bit integers are not needed
  }
  return v === info.invalid ? undefined : v;
}

/** Decodes all messages of a FIT file (supports chained FIT files). Throws on invalid files. */
export function decodeFit(bytes: Uint8Array, wanted?: Set<number>): FitMessage[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: FitMessage[] = [];
  let fileStart = 0;
  let files = 0;
  while (fileStart + 12 <= bytes.length) {
    const headerSize = view.getUint8(fileStart);
    const isFit = bytes[fileStart + 8] === 0x2e && bytes[fileStart + 9] === 0x46 && bytes[fileStart + 10] === 0x49 && bytes[fileStart + 11] === 0x54;
    if (!isFit || (headerSize !== 12 && headerSize !== 14)) {
      if (files === 0) throw new LocalizedError('err.fitInvalid');
      break;
    }
    const dataSize = view.getUint32(fileStart + 4, true);
    const end = Math.min(bytes.length, fileStart + headerSize + dataSize);
    const defs = new Map<number, Definition>();
    let lastTimestamp = 0;
    let o = fileStart + headerSize;
    try {
      while (o < end) {
        const header = view.getUint8(o++);
        if (header & 0x80) {
          // Compressed timestamp header
          const local = (header >> 5) & 0x03;
          const offset = header & 0x1f;
          const def = defs.get(local);
          if (!def) throw new Error(`missing definition (${local})`);
          let ts = (lastTimestamp & ~0x1f) + offset;
          if (offset < (lastTimestamp & 0x1f)) ts += 0x20;
          lastTimestamp = ts;
          const msg = readData(view, o, def, wanted);
          if (msg) {
            msg.fields.set(TIMESTAMP_FIELD, ts);
            out.push(msg);
          }
          o += def.totalSize;
          continue;
        }
        const local = header & 0x0f;
        if (header & 0x40) {
          // Definition message
          const hasDev = (header & 0x20) !== 0;
          const le = view.getUint8(o + 1) === 0;
          const globalNum = view.getUint16(o + 2, le);
          const n = view.getUint8(o + 4);
          o += 5;
          const fields: FieldDef[] = [];
          let total = 0;
          for (let i = 0; i < n; i++) {
            const f = { num: view.getUint8(o), size: view.getUint8(o + 1), baseType: view.getUint8(o + 2) };
            fields.push(f);
            total += f.size;
            o += 3;
          }
          let devBytes = 0;
          if (hasDev) {
            const nd = view.getUint8(o++);
            for (let i = 0; i < nd; i++) {
              devBytes += view.getUint8(o + 1);
              o += 3;
            }
          }
          defs.set(local, { globalNum, littleEndian: le, fields, devBytes, totalSize: total + devBytes });
        } else {
          const def = defs.get(local);
          if (!def) throw new Error(`missing definition (${local})`);
          const msg = readData(view, o, def, wanted);
          const ts = msg?.fields.get(TIMESTAMP_FIELD);
          if (typeof ts === 'number') lastTimestamp = ts;
          else if (!msg) {
            // still track timestamps of skipped messages
            const tsField = def.fields.find((f) => f.num === TIMESTAMP_FIELD);
            if (tsField) {
              let off = o;
              for (const f of def.fields) {
                if (f === tsField) break;
                off += f.size;
              }
              const v = readValue(view, off, tsField.baseType, tsField.size, def.littleEndian);
              if (typeof v === 'number') lastTimestamp = v;
            }
          }
          if (msg) out.push(msg);
          o += def.totalSize;
        }
      }
    } catch (e) {
      // Truncated file (e.g. device switched off): keep what was read.
      if (out.length === 0) throw new LocalizedError('err.fitCorrupt', { detail: (e as Error).message });
    }
    files++;
    fileStart = fileStart + headerSize + dataSize + 2; // + file CRC
  }
  return out;
}

function readData(view: DataView, o: number, def: Definition, wanted?: Set<number>): FitMessage | undefined {
  if (wanted && !wanted.has(def.globalNum)) return undefined;
  if (o + def.totalSize > view.byteLength) throw new Error('truncated message');
  const fields = new Map<number, number | string>();
  let off = o;
  for (const f of def.fields) {
    const v = readValue(view, off, f.baseType, f.size, def.littleEndian);
    if (v !== undefined) fields.set(f.num, v);
    off += f.size;
  }
  return { num: def.globalNum, fields };
}
