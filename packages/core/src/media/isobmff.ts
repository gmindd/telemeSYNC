import type { ClipMetadata, Fps } from './types.ts';
import { LocalizedError } from '../i18n/index.ts';
import { gpmfStartUtcMs, type GpmfSample } from './gpmf.ts';

/** Random-access byte source: a browser File (via slice) or a Node file handle. */
export interface ByteSource {
  size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

const MAC_EPOCH_OFFSET_S = 2082844800; // 1904-01-01 → 1970-01-01
const CONTAINER_BOXES = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'udta', 'edts', 'dinf']);
const MAX_MOOV = 256 * 1024 * 1024;

interface Box {
  type: string;
  start: number;
  headerSize: number;
  size: number;
}

function fourcc(b: Uint8Array, o: number): string {
  return String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
}

function isPrintableType(t: string): boolean {
  for (let i = 0; i < 4; i++) {
    const c = t.charCodeAt(i);
    if (c < 0x20 || c > 0x7e) {
      if (c !== 0xa9) return false; // © allowed
    }
  }
  return true;
}

class Reader {
  view: DataView;
  constructor(public b: Uint8Array) {
    this.view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  }
  u8(o: number) {
    return this.view.getUint8(o);
  }
  u16(o: number) {
    return this.view.getUint16(o);
  }
  u32(o: number) {
    return this.view.getUint32(o);
  }
  u64(o: number) {
    return this.view.getUint32(o) * 2 ** 32 + this.view.getUint32(o + 4);
  }
  /** Children of a box payload range [start, end). */
  children(start: number, end: number): Box[] {
    const out: Box[] = [];
    let o = start;
    while (o + 8 <= end) {
      let size = this.u32(o);
      const type = fourcc(this.b, o + 4);
      let header = 8;
      if (size === 1) {
        if (o + 16 > end) break;
        size = this.u64(o + 8);
        header = 16;
      } else if (size === 0) size = end - o;
      if (size < header || o + size > end || !isPrintableType(type)) break;
      out.push({ type, start: o, headerSize: header, size });
      o += size;
    }
    return out;
  }
}

function snapFps(fps: number): Fps {
  const candidates: Fps[] = [
    { num: 24000, den: 1001 }, { num: 24, den: 1 }, { num: 25, den: 1 }, { num: 30000, den: 1001 }, { num: 30, den: 1 },
    { num: 48000, den: 1001 }, { num: 48, den: 1 }, { num: 50, den: 1 }, { num: 60000, den: 1001 }, { num: 60, den: 1 },
    { num: 100, den: 1 }, { num: 120000, den: 1001 }, { num: 120, den: 1 }, { num: 200, den: 1 }, { num: 240000, den: 1001 }, { num: 240, den: 1 },
  ];
  for (const c of candidates) if (Math.abs(fps - c.num / c.den) / fps < 0.0005) return c;
  return { num: Math.round(fps * 1000), den: 1000 };
}

export function fpsValue(f: Fps): number {
  return f.num / f.den;
}

function macTimeToMs(s: number): number | undefined {
  if (!s) return undefined;
  return (s - MAC_EPOCH_OFFSET_S) * 1000;
}

function readString(b: Uint8Array, start: number, end: number): string {
  let s = '';
  for (let i = start; i < end; i++) {
    const c = b[i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  try {
    return decodeURIComponent(escape(s)); // utf-8 decode
  } catch {
    return s;
  }
}

interface TrackInfo {
  handler?: string;
  handlerName?: string;
  timescale?: number;
  duration?: number;
  width?: number;
  height?: number;
  codec?: string;
  sampleCount?: number;
  sampleDurationSum?: number;
  tmcd?: { timescale: number; frameDuration: number; numberOfFrames: number; firstChunkOffset?: number };
  /** Sample table boxes, to find where a metadata track's samples are (GoPro GPMF). */
  table: Partial<Record<'stts' | 'stsc' | 'stsz' | 'stco' | 'co64', Box>>;
}

/** Where the first `limit` samples of a track are in the file, and when they play. */
function trackSamples(r: Reader, t: TrackInfo, limit: number): GpmfSample[] {
  const { stts, stsc, stsz } = t.table;
  const chunks = t.table.stco ?? t.table.co64;
  if (!stts || !stsc || !stsz || !chunks || !t.timescale) return [];
  const body = (b: Box) => b.start + b.headerSize;
  const end = (b: Box) => b.start + b.size;
  const count = Math.min(limit, r.u32(body(stsz) + 8));
  const fixedSize = r.u32(body(stsz) + 4);
  const sizeOf = (i: number) => (fixedSize ? fixedSize : body(stsz) + 12 + i * 4 + 4 <= end(stsz) ? r.u32(body(stsz) + 12 + i * 4) : 0);
  const chunkCount = r.u32(body(chunks) + 4);
  const is64 = chunks.type === 'co64';
  const chunkOffset = (c: number) => (is64 ? r.u64(body(chunks) + 8 + c * 8) : r.u32(body(chunks) + 8 + c * 4));
  const stscEntries: { first: number; perChunk: number }[] = [];
  for (let i = 0, n = r.u32(body(stsc) + 4); i < n && body(stsc) + 8 + i * 12 + 12 <= end(stsc); i++) {
    stscEntries.push({ first: r.u32(body(stsc) + 8 + i * 12), perChunk: r.u32(body(stsc) + 12 + i * 12) });
  }
  const deltas: number[] = [];
  for (let i = 0, n = r.u32(body(stts) + 4); i < n && deltas.length < count && body(stts) + 8 + i * 8 + 8 <= end(stts); i++) {
    const c = r.u32(body(stts) + 8 + i * 8);
    const d = r.u32(body(stts) + 12 + i * 8);
    for (let k = 0; k < c && deltas.length < count; k++) deltas.push(d);
  }
  const out: GpmfSample[] = [];
  let sample = 0;
  let time = 0;
  for (let c = 0; c < chunkCount && sample < count; c++) {
    const entry = [...stscEntries].reverse().find((e) => e.first <= c + 1);
    let offset = chunkOffset(c);
    for (let k = 0; k < (entry?.perChunk ?? 1) && sample < count; k++, sample++) {
      const size = sizeOf(sample);
      const d = deltas[sample] ?? 0;
      out.push({ offset, size, startS: time / t.timescale, durationS: d / t.timescale });
      offset += size;
      time += d;
    }
  }
  return out;
}

function parseTrak(r: Reader, trak: Box): TrackInfo {
  const info: TrackInfo = { table: {} };
  const walk = (box: Box) => {
    const p = box.start + box.headerSize;
    const end = box.start + box.size;
    if (box.type === 'stts' || box.type === 'stsc' || box.type === 'stsz' || box.type === 'stco' || box.type === 'co64') info.table[box.type] = box;
    switch (box.type) {
      case 'mdia':
      case 'minf':
      case 'stbl':
        r.children(p, end).forEach(walk);
        break;
      case 'tkhd': {
        const v = r.u8(p);
        const base = v === 1 ? p + 4 + 32 : p + 4 + 20;
        // after: reserved(8) layer(2) alt(2) volume(2) reserved(2) matrix(36) width(4) height(4)
        const wOff = base + 8 + 8 + 36;
        if (wOff + 8 <= end) {
          const w = r.u32(wOff) / 65536;
          const h = r.u32(wOff + 4) / 65536;
          if (w > 0 && h > 0) {
            info.width = Math.round(w);
            info.height = Math.round(h);
          }
        }
        break;
      }
      case 'mdhd': {
        const v = r.u8(p);
        if (v === 1) {
          info.timescale = r.u32(p + 20);
          info.duration = r.u64(p + 24);
        } else {
          info.timescale = r.u32(p + 12);
          info.duration = r.u32(p + 16);
        }
        break;
      }
      case 'hdlr':
        // QuickTime also has a data-handler hdlr inside minf ('alis'/'url '); keep the media one.
        if (info.handler) break;
        info.handler = fourcc(r.b, p + 8);
        info.handlerName = readString(r.b, p + 24, end).replace(/^[\x00-\x1f]/, '').trim();
        break;
      case 'stsd': {
        const entries = r.children(p + 8, end);
        const e = entries[0];
        if (!e) break;
        info.codec = e.type.trim();
        const ep = e.start + e.headerSize;
        if (e.type === 'tmcd' && ep + 26 <= e.start + e.size) {
          info.tmcd = {
            timescale: r.u32(ep + 16),
            frameDuration: r.u32(ep + 20),
            numberOfFrames: r.u8(ep + 24),
          };
        } else if (ep + 28 <= e.start + e.size && info.handler === 'vide') {
          const w = r.u16(ep + 24);
          const h = r.u16(ep + 26);
          if (w && h) {
            info.width ??= w;
            info.height ??= h;
          }
        }
        break;
      }
      case 'stts': {
        const n = r.u32(p + 4);
        let count = 0;
        let sum = 0;
        for (let i = 0; i < n && p + 8 + i * 8 + 8 <= end; i++) {
          const c = r.u32(p + 8 + i * 8);
          const d = r.u32(p + 12 + i * 8);
          count += c;
          sum += c * d;
        }
        info.sampleCount = count;
        info.sampleDurationSum = sum;
        break;
      }
      case 'stco':
        if (info.tmcd && r.u32(p + 4) > 0) info.tmcd.firstChunkOffset = r.u32(p + 8);
        break;
      case 'co64':
        if (info.tmcd && r.u32(p + 4) > 0) info.tmcd.firstChunkOffset = r.u64(p + 8);
        break;
    }
  };
  r.children(trak.start + trak.headerSize, trak.start + trak.size).forEach(walk);
  return info;
}

function parseUdta(r: Reader, box: Box, tags: Record<string, string>) {
  for (const c of r.children(box.start + box.headerSize, box.start + box.size)) {
    const p = c.start + c.headerSize;
    const end = c.start + c.size;
    if (c.size > 4096) continue;
    let value: string | undefined;
    if (c.type.charCodeAt(0) === 0xa9 && end - p >= 4) {
      // QuickTime international text: size(2) lang(2) text
      const len = r.u16(p);
      value = readString(r.b, p + 4, Math.min(end, p + 4 + len));
    } else {
      // Plain ASCII payloads (GoPro FIRM, LENS, CAME…); keep only if mostly printable.
      const raw = r.b.subarray(p, end);
      let printable = 0;
      for (const ch of raw) if ((ch >= 0x20 && ch < 0x7f) || ch === 0) printable++;
      if (raw.length > 0 && raw.length <= 256 && printable / raw.length > 0.9) value = readString(r.b, p, end);
    }
    if (value) tags[c.type] = value;
  }
}

/** Apple-style moov/meta (hdlr 'mdta', keys, ilst). */
function parseMeta(r: Reader, box: Box, tags: Record<string, string>) {
  // meta may be a full box (QuickTime spec says not, ISO says yes) — detect.
  let p = box.start + box.headerSize;
  const end = box.start + box.size;
  const t = fourcc(r.b, p + 4);
  if (!['hdlr', 'keys', 'ilst'].includes(t)) p += 4;
  const kids = r.children(p, end);
  const keys: string[] = [];
  const keysBox = kids.find((k) => k.type === 'keys');
  if (keysBox) {
    const kp = keysBox.start + keysBox.headerSize;
    const n = r.u32(kp + 4);
    let o = kp + 8;
    for (let i = 0; i < n && o + 8 <= keysBox.start + keysBox.size; i++) {
      const size = r.u32(o);
      if (size < 8) break;
      keys.push(readString(r.b, o + 8, o + size));
      o += size;
    }
  }
  const ilst = kids.find((k) => k.type === 'ilst');
  if (!ilst) return;
  for (const item of r.children(ilst.start + ilst.headerSize, ilst.start + ilst.size)) {
    const idx = r.u32(item.start + 4);
    const name = keys[idx - 1] ?? item.type;
    const data = r.children(item.start + item.headerSize, item.start + item.size).find((d) => d.type === 'data');
    if (!data) continue;
    const dp = data.start + data.headerSize;
    const typ = r.u32(dp) & 0xffffff;
    if (typ === 1 && data.size < 4096) tags[name] = readString(r.b, dp + 8, data.start + data.size);
  }
}

/** Reads container metadata from an MP4/MOV/INSV file, touching only box headers and the moov box. */
export async function readClipMetadata(src: ByteSource, fileName: string, lastModifiedMs?: number): Promise<ClipMetadata> {
  let offset = 0;
  let moov: Uint8Array | undefined;
  let majorBrand: string | undefined;
  while (offset + 8 <= src.size) {
    const head = await src.read(offset, 16);
    const r = new Reader(head);
    let size = r.u32(0);
    const type = fourcc(head, 4);
    if (!isPrintableType(type)) break;
    if (size === 1) size = r.u64(8);
    else if (size === 0) size = src.size - offset;
    if (size < 8) break;
    if (type === 'ftyp') majorBrand = fourcc(await src.read(offset + 8, 4), 0).trim();
    if (type === 'moov') {
      if (size > MAX_MOOV) throw new Error('moov too large');
      moov = await src.read(offset, size);
      break;
    }
    offset += size;
  }
  if (!moov) throw new LocalizedError('err.moov', { file: fileName });

  const r = new Reader(moov);
  const moovBox = r.children(0, moov.length)[0];
  const tags: Record<string, string> = {};
  const tracks: TrackInfo[] = [];
  let mvhd: { creation?: number; modification?: number; timescale: number; duration: number } | undefined;

  for (const b of r.children(moovBox.start + moovBox.headerSize, moovBox.start + moovBox.size)) {
    const p = b.start + b.headerSize;
    if (b.type === 'mvhd') {
      const v = r.u8(p);
      mvhd = v === 1
        ? { creation: r.u64(p + 4), modification: r.u64(p + 12), timescale: r.u32(p + 20), duration: r.u64(p + 24) }
        : { creation: r.u32(p + 4), modification: r.u32(p + 8), timescale: r.u32(p + 12), duration: r.u32(p + 16) };
    } else if (b.type === 'trak') tracks.push(parseTrak(r, b));
    else if (b.type === 'udta') {
      parseUdta(r, b, tags);
      for (const c of r.children(p, b.start + b.size)) if (c.type === 'meta') parseMeta(r, c, tags);
    } else if (b.type === 'meta') parseMeta(r, b, tags);
  }

  const video = tracks.find((t) => t.handler === 'vide');
  let durationMs = 0;
  if (video?.timescale && video.duration) durationMs = (video.duration / video.timescale) * 1000;
  else if (mvhd?.timescale) durationMs = (mvhd.duration / mvhd.timescale) * 1000;

  let fps: Fps | undefined;
  if (video?.timescale && video.sampleCount && video.sampleDurationSum) {
    fps = snapFps((video.sampleCount * video.timescale) / video.sampleDurationSum);
  }

  let timecodeStartSec: number | undefined;
  const tc = tracks.find((t) => t.tmcd);
  if (tc?.tmcd?.firstChunkOffset !== undefined && tc.tmcd.firstChunkOffset + 4 <= src.size && tc.tmcd.numberOfFrames > 0) {
    const fb = await src.read(tc.tmcd.firstChunkOffset, 4);
    const frames = new Reader(fb).u32(0);
    const tcFps = tc.tmcd.frameDuration ? tc.tmcd.timescale / tc.tmcd.frameDuration : tc.tmcd.numberOfFrames;
    timecodeStartSec = frames / Math.round(tcFps);
  }

  // GoPro with GPS: the start in UTC from the satellites (first minute of samples, enough to get a fix).
  let gpmfStart: number | undefined;
  const gpmd = tracks.find((t) => t.codec === 'gpmd');
  if (gpmd) {
    try {
      gpmfStart = await gpmfStartUtcMs((o, l) => src.read(o, l), trackSamples(r, gpmd, 90));
    } catch {
      gpmfStart = undefined;
    }
  }

  return {
    fileName,
    sizeBytes: src.size,
    lastModifiedMs,
    durationMs,
    fps,
    frameCount: video?.sampleCount,
    width: video?.width,
    height: video?.height,
    codec: video?.codec,
    majorBrand,
    creationTimeRawMs: mvhd ? macTimeToMs(mvhd.creation ?? 0) : undefined,
    modificationTimeRawMs: mvhd ? macTimeToMs(mvhd.modification ?? 0) : undefined,
    timecodeStartSec,
    handlers: tracks.map((t) => t.handler ?? '?'),
    handlerNames: tracks.map((t) => t.handlerName ?? '').filter(Boolean),
    hasGpmf: !!gpmd,
    gpmfStartUtcMs: gpmfStart,
    tags,
  };
}

/** ByteSource for a browser File/Blob. */
export function blobSource(blob: Blob): ByteSource {
  return {
    size: blob.size,
    read: async (offset, length) => new Uint8Array(await blob.slice(offset, Math.min(blob.size, offset + length)).arrayBuffer()),
  };
}
