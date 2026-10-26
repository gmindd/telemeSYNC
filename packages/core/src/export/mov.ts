import type { Fps } from '../media/types.ts';

/** Where a MOV is written: appended in order, plus one patch of the `mdat` header at the end. */
export interface ByteSink {
  write(data: Uint8Array): void | Promise<void>;
  writeAt(offset: number, data: Uint8Array): void | Promise<void>;
}

export interface MovVideoTrack {
  width: number;
  height: number;
  fps: Fps;
  /** Sample description fourcc, e.g. 'rle ' (QuickTime Animation). */
  codec: string;
  /** Bits per pixel in the sample description (32 = with alpha). */
  depth: number;
  compressorName: string;
}

const FTYP_SIZE = 20;
/** ftyp, then an 8-byte `wide` that becomes a 64-bit mdat header if the data passes 4 GB. */
const DATA_START = FTYP_SIZE + 8 + 8;

/**
 * Minimal QuickTime writer for one video track: `mdat` first (streamed), `moov` at the end.
 * One sample per chunk, constant frame rate (timescale = fps numerator).
 */
export class MovWriter {
  private sizes = new Uint32Array(1024);
  private count = 0;
  private keys: number[] = [];
  private dataBytes = 0;

  constructor(
    private sink: ByteSink,
    private track: MovVideoTrack,
  ) {}

  async start(): Promise<void> {
    const b = new Box();
    b.u32(FTYP_SIZE).str('ftyp').str('qt  ').u32(0x20050300).str('qt  ');
    b.u32(8).str('wide');
    b.u32(0).str('mdat'); // size patched in finish()
    await this.sink.write(b.bytes());
  }

  async addSample(data: Uint8Array, key: boolean): Promise<void> {
    if (this.count === this.sizes.length) {
      const grown = new Uint32Array(this.sizes.length * 2);
      grown.set(this.sizes);
      this.sizes = grown;
    }
    this.sizes[this.count++] = data.byteLength;
    if (key) this.keys.push(this.count);
    this.dataBytes += data.byteLength;
    await this.sink.write(data);
  }

  async finish(): Promise<void> {
    const mdat = 8 + this.dataBytes;
    if (mdat <= 0xffffffff) await this.sink.writeAt(FTYP_SIZE + 8, new Box().u32(mdat).str('mdat').bytes());
    else await this.sink.writeAt(FTYP_SIZE, new Box().u32(1).str('mdat').u64(16 + this.dataBytes).bytes());
    await this.sink.write(this.moov());
  }

  private moov(): Uint8Array {
    const { width, height, fps } = this.track;
    const n = this.count;
    const movieScale = 1000;
    const mediaDuration = n * fps.den;
    const movieDuration = Math.round((mediaDuration * movieScale) / fps.num);
    const matrix = (b: Box) => b.u32(0x10000).u32(0).u32(0).u32(0).u32(0x10000).u32(0).u32(0).u32(0).u32(0x40000000);

    const mvhd = box('mvhd', (b) => {
      b.u32(0).u32(0).u32(0).u32(movieScale).u32(movieDuration);
      b.u32(0x10000).u16(0x100).zeros(10);
      matrix(b);
      b.zeros(24).u32(2);
    });
    const tkhd = box('tkhd', (b) => {
      b.u32(3).u32(0).u32(0).u32(1).u32(0).u32(movieDuration).zeros(8);
      b.u16(0).u16(0).u16(0).u16(0);
      matrix(b);
      b.u32(width * 0x10000).u32(height * 0x10000);
    });
    const mdhd = box('mdhd', (b) => b.u32(0).u32(0).u32(0).u32(fps.num).u32(mediaDuration).u16(0).u16(0));
    const hdlr = (type: string, sub: string, name: string) =>
      box('hdlr', (b) => b.u32(0).str(type).str(sub).u32(0).u32(0).u32(0).pascal(name));
    const vmhd = box('vmhd', (b) => b.u32(1).zeros(8));
    const dinf = box('dinf', (b) => b.raw(box('dref', (d) => d.u32(0).u32(1).u32(12).str('alis').u32(1))));

    const stsd = box('stsd', (b) => {
      b.u32(0).u32(1);
      const entry = new Box();
      entry.str(this.track.codec).zeros(6).u16(1);
      entry.u16(0).u16(0).str('FFMP').u32(0).u32(0x400);
      entry.u16(width).u16(height).u32(0x480000).u32(0x480000).u32(0).u16(1);
      const name = new Uint8Array(32);
      const enc = new TextEncoder().encode(this.track.compressorName).subarray(0, 31);
      name[0] = enc.length;
      name.set(enc, 1);
      entry.raw(name).u16(this.track.depth).u16(0xffff);
      b.u32(8 + entry.length).raw(entry.bytes());
    });
    const stts = box('stts', (b) => b.u32(0).u32(1).u32(n).u32(fps.den));
    const stss = box('stss', (b) => {
      b.u32(0).u32(this.keys.length);
      for (const k of this.keys) b.u32(k);
    });
    const stsc = box('stsc', (b) => b.u32(0).u32(1).u32(1).u32(1).u32(1));
    const stsz = box('stsz', (b) => {
      b.u32(0).u32(0).u32(n);
      for (let i = 0; i < n; i++) b.u32(this.sizes[i]);
    });
    const wide = DATA_START + this.dataBytes > 0xffffffff;
    const stco = box(wide ? 'co64' : 'stco', (b) => {
      b.u32(0).u32(n);
      let off = DATA_START;
      for (let i = 0; i < n; i++) {
        if (wide) b.u64(off);
        else b.u32(off);
        off += this.sizes[i];
      }
    });

    const stbl = container('stbl', [stsd, stts, stss, stsc, stsz, stco]);
    const minf = container('minf', [vmhd, hdlr('dhlr', 'alis', 'DataHandler'), dinf, stbl]);
    const mdia = container('mdia', [mdhd, hdlr('mhlr', 'vide', 'VideoHandler'), minf]);
    const trak = container('trak', [tkhd, mdia]);
    return container('moov', [mvhd, trak]);
  }
}

/** Growable big-endian byte builder. */
class Box {
  private buf = new Uint8Array(256);
  private view = new DataView(this.buf.buffer);
  length = 0;

  private need(n: number) {
    if (this.length + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.length + n) size *= 2;
    const grown = new Uint8Array(size);
    grown.set(this.buf.subarray(0, this.length));
    this.buf = grown;
    this.view = new DataView(grown.buffer);
  }

  u16(v: number): this {
    this.need(2);
    this.view.setUint16(this.length, v);
    this.length += 2;
    return this;
  }

  u32(v: number): this {
    this.need(4);
    this.view.setUint32(this.length, v >>> 0);
    this.length += 4;
    return this;
  }

  u64(v: number): this {
    return this.u32(Math.floor(v / 0x100000000)).u32(v % 0x100000000);
  }

  str(s: string): this {
    this.need(s.length);
    for (let i = 0; i < s.length; i++) this.buf[this.length++] = s.charCodeAt(i);
    return this;
  }

  pascal(s: string): this {
    this.need(1);
    this.buf[this.length++] = s.length;
    return this.str(s);
  }

  zeros(n: number): this {
    this.need(n);
    this.buf.fill(0, this.length, this.length + n);
    this.length += n;
    return this;
  }

  raw(data: Uint8Array): this {
    this.need(data.byteLength);
    this.buf.set(data, this.length);
    this.length += data.byteLength;
    return this;
  }

  bytes(): Uint8Array {
    return this.buf.slice(0, this.length);
  }
}

function box(type: string, fill: (b: Box) => void): Uint8Array {
  const body = new Box();
  fill(body);
  return new Box().u32(8 + body.length).str(type).raw(body.bytes()).bytes();
}

function container(type: string, children: Uint8Array[]): Uint8Array {
  return box(type, (b) => children.forEach((c) => b.raw(c)));
}
