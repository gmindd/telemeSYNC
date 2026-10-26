import type { Fps } from '../media/types.ts';
import type { ByteSink } from './mov.ts';

/**
 * Minimal WebM writer for one VP9 track with alpha, laid out like FFmpeg's (libvpx yuva420p): the colour
 * frame in the Block and the alpha plane, encoded as a second VP9 stream, in BlockAdditional ID 1.
 * Clusters are written as they fill (one per key frame); SeekHead, duration, segment size and Cues at the end.
 */
export class WebmWriter {
  private segmentData = 0;
  private durationAt = 0;
  private seekAt = 0;
  private infoPos = 0;
  private tracksPos = 0;
  private written = 0;
  private cluster: Uint8Array[] = [];
  private clusterTime = 0;
  private cues: { time: number; pos: number }[] = [];
  private frames = 0;

  constructor(
    private sink: ByteSink,
    private track: { width: number; height: number; fps: Fps },
  ) {}

  private frameMs(i: number): number {
    return Math.round((i * 1000 * this.track.fps.den) / this.track.fps.num);
  }

  private async out(data: Uint8Array) {
    await this.sink.write(data);
    this.written += data.byteLength;
  }

  async start(): Promise<void> {
    const { width, height, fps } = this.track;
    const header = el(0x1a45dfa3, [
      uintEl(0x4286, 1),
      uintEl(0x42f7, 1),
      uintEl(0x42f2, 4),
      uintEl(0x42f3, 8),
      strEl(0x4282, 'webm'),
      uintEl(0x4287, 4),
      uintEl(0x4285, 2),
    ]);
    await this.out(header);
    // Segment with an 8-byte size, patched in finish().
    await this.out(concat([id(0x18538067), new Uint8Array([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])]));
    this.segmentData = this.written;

    this.seekAt = this.written;
    await this.out(voidEl(SEEK_RESERVED));

    this.infoPos = this.written - this.segmentData;
    const infoHead = concat([uintEl(0x2ad7b1, 1_000_000), strEl(0x4d80, 'telemeSYNC'), strEl(0x5741, 'telemeSYNC')]);
    const durationEl = concat([id(0x4489), size(8), new Uint8Array(8)]);
    const info = el(0x1549a966, [infoHead, durationEl]);
    this.durationAt = this.written + info.byteLength - 8;
    await this.out(info);

    this.tracksPos = this.written - this.segmentData;
    const video = el(0xe0, [uintEl(0xb0, width), uintEl(0xba, height), uintEl(0x53c0, 1)]);
    const entry = el(0xae, [
      uintEl(0xd7, 1),
      uintEl(0x73c5, 1),
      uintEl(0x83, 1),
      uintEl(0x9c, 0),
      uintEl(0x55ee, 1),
      strEl(0x86, 'V_VP9'),
      uintEl(0x23e383, Math.round((1e9 * fps.den) / fps.num)),
      video,
    ]);
    await this.out(el(0x1654ae6b, [entry]));
  }

  /** Adds frame `i` in order: the VP9 colour frame and the VP9 frame of its alpha plane. */
  async addFrame(color: Uint8Array, alpha: Uint8Array, key: boolean): Promise<void> {
    const t = this.frameMs(this.frames);
    if (key || this.cluster.length === 0 || t - this.clusterTime > 30_000) {
      await this.flushCluster();
      this.clusterTime = t;
    }
    const rel = t - this.clusterTime;
    const block = concat([new Uint8Array([0x81, (rel >> 8) & 0xff, rel & 0xff, 0x00]), color]);
    const parts = [rawEl(0xa1, block)];
    if (!key) parts.push(intEl(0xfb, this.frameMs(this.frames - 1) - t));
    parts.push(el(0x75a1, [el(0xa6, [uintEl(0xee, 1), rawEl(0xa5, alpha)])]));
    this.cluster.push(el(0xa0, parts));
    this.frames++;
  }

  private async flushCluster() {
    if (!this.cluster.length) return;
    this.cues.push({ time: this.clusterTime, pos: this.written - this.segmentData });
    await this.out(el(0x1f43b675, [uintEl(0xe7, this.clusterTime), ...this.cluster]));
    this.cluster = [];
  }

  async finish(): Promise<void> {
    await this.flushCluster();
    const cuesPos = this.written - this.segmentData;
    const points = this.cues.map((c) => el(0xbb, [uintEl(0xb3, c.time), el(0xb7, [uintEl(0xf7, 1), uintEl(0xf1, c.pos)])]));
    await this.out(el(0x1c53bb6b, points));

    const seek = (target: number, pos: number) => el(0x4dbb, [rawEl(0x53ab, id(target)), rawEl(0x53ac, fixedUint(pos, 8))]);
    const seekHead = el(0x114d9b74, [seek(0x1549a966, this.infoPos), seek(0x1654ae6b, this.tracksPos), seek(0x1c53bb6b, cuesPos)]);
    await this.sink.writeAt(this.seekAt, concat([seekHead, voidEl(SEEK_RESERVED - seekHead.byteLength)]));

    const duration = new Uint8Array(8);
    new DataView(duration.buffer).setFloat64(0, this.frameMs(this.frames));
    await this.sink.writeAt(this.durationAt, duration);

    const segSize = this.written - this.segmentData;
    const s = fixedUint(segSize, 8);
    s[0] |= 0x01; // 8-byte EBML size marker
    await this.sink.writeAt(this.segmentData - 8, s);
  }
}

/** Room for the SeekHead (3 entries with 8-byte positions = 72 bytes) plus a Void header. */
const SEEK_RESERVED = 96;

function id(v: number): Uint8Array {
  const bytes: number[] = [];
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v = Math.floor(v / 256);
  }
  return new Uint8Array(bytes);
}

/** EBML size as a variable-length integer (shortest form). */
function size(n: number): Uint8Array {
  for (let len = 1; len <= 8; len++) {
    if (n < 2 ** (7 * len) - 1) {
      const b = fixedUint(n, len);
      b[0] |= 0x80 >> (len - 1);
      return b;
    }
  }
  throw new Error('EBML size too large');
}

function fixedUint(v: number, len: number): Uint8Array {
  const b = new Uint8Array(len);
  for (let i = len - 1; i >= 0; i--) {
    b[i] = v % 256;
    v = Math.floor(v / 256);
  }
  return b;
}

function minUint(v: number): Uint8Array {
  let len = 1;
  while (len < 8 && v >= 2 ** (8 * len)) len++;
  return fixedUint(v, len);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.byteLength, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}

function rawEl(elId: number, data: Uint8Array): Uint8Array {
  return concat([id(elId), size(data.byteLength), data]);
}

function el(elId: number, children: Uint8Array[]): Uint8Array {
  return rawEl(elId, concat(children));
}

function uintEl(elId: number, v: number): Uint8Array {
  return rawEl(elId, minUint(v));
}

function intEl(elId: number, v: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setInt16(0, v);
  return rawEl(elId, b);
}

function strEl(elId: number, s: string): Uint8Array {
  return rawEl(elId, new TextEncoder().encode(s));
}

/** Void element of exactly `total` bytes (1-byte id, 8-byte size). */
function voidEl(total: number): Uint8Array {
  const s = fixedUint(total - 9, 8);
  s[0] |= 0x01;
  return concat([new Uint8Array([0xec]), s, new Uint8Array(total - 9)]);
}
