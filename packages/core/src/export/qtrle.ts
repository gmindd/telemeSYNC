/**
 * QuickTime Animation (`rle `, 32-bit ARGB) encoder in plain TypeScript: the same bitstream as FFmpeg's
 * `qtrle`, so the browser and the Android app write lossless .mov files with alpha without FFmpeg.
 *
 * Each sample: chunk size (u32), header (u16; 8 = only lines start..start+n change), then per line a skip
 * byte (pixels to skip + 1) and RLE codes: n > 0 = n literal pixels, -n = one pixel repeated n times,
 * 0 = another skip byte follows, -1 = end of line. Pixels are big-endian ARGB, straight alpha.
 */
export class QtrleEncoder {
  private prev: Uint32Array;
  private hasPrev = false;
  private out: Uint8Array;
  private pos = 0;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.prev = new Uint32Array(width * height);
    // Worst case (alternating changed/unchanged pixels or no runs) stays under 5 bytes per pixel.
    this.out = new Uint8Array(16 + height * (width * 5 + 8));
  }

  /**
   * Encodes one RGBA frame (canvas `getImageData` order). A key frame stores every pixel; the others
   * only what changed since the previous frame. The returned view is reused by the next call.
   */
  encode(rgba: Uint8Array | Uint8ClampedArray, key: boolean): Uint8Array {
    const { width: w, height: h } = this;
    if (rgba.byteLength !== w * h * 4) throw new Error(`Frame is ${rgba.byteLength} bytes, expected ${w * h * 4}`);
    const cur = new Uint32Array(rgba.buffer, rgba.byteOffset, w * h);
    const full = key || !this.hasPrev;
    const prev = this.prev;

    let start = 0;
    let end = h;
    if (!full) {
      while (start < h && rowEqual(cur, prev, start * w, w)) start++;
      while (end > start && rowEqual(cur, prev, (end - 1) * w, w)) end--;
    }

    this.pos = 0;
    this.u32(0); // chunk size, patched below
    if ((start === 0 && end === h) || start === h) this.u16(0);
    else {
      this.u16(8);
      this.u16(start);
      this.u16(0);
      this.u16(end - start);
      this.u16(0);
    }
    for (let y = start; y < end; y++) this.line(cur, y * w, full);
    this.out[this.pos++] = 0;
    const size = this.pos;
    this.out[0] = size >>> 24;
    this.out[1] = (size >>> 16) & 255;
    this.out[2] = (size >>> 8) & 255;
    this.out[3] = size & 255;

    prev.set(cur);
    this.hasPrev = true;
    return this.out.subarray(0, size);
  }

  private line(cur: Uint32Array, row: number, full: boolean) {
    const w = this.width;
    const prev = this.prev;
    let x = 0;
    let first = true;
    while (x < w) {
      let skip = 0;
      if (!full) while (x + skip < w && cur[row + x + skip] === prev[row + x + skip]) skip++;
      if (x + skip === w) break;
      this.skip(skip, first);
      first = false;
      x += skip;
      // Changed span: up to the next unchanged pixel (a 2-byte skip is cheaper than any 4-byte pixel).
      let end = x + 1;
      if (full) end = w;
      else while (end < w && cur[row + end] !== prev[row + end]) end++;
      this.span(cur, row, x, end);
      x = end;
    }
    if (first) this.out[this.pos++] = 1;
    this.out[this.pos++] = 0xff;
  }

  /** Skip code: the first of a line is a bare byte, later ones are preceded by a 0 code. */
  private skip(n: number, first: boolean) {
    if (first) {
      const k = Math.min(n, 254);
      this.out[this.pos++] = k + 1;
      n -= k;
    }
    while (n > 0) {
      const k = Math.min(n, 254);
      this.out[this.pos++] = 0;
      this.out[this.pos++] = k + 1;
      n -= k;
    }
  }

  /** Runs of 2+ equal pixels as repeat codes, the rest as literals. */
  private span(cur: Uint32Array, row: number, x: number, end: number) {
    while (x < end) {
      const p = cur[row + x];
      let run = 1;
      while (x + run < end && run < 128 && cur[row + x + run] === p) run++;
      if (run >= 2) {
        this.out[this.pos++] = 256 - run;
        this.pixel(p);
        x += run;
        continue;
      }
      let n = 1;
      while (x + n < end && n < 127 && !(x + n + 1 < end && cur[row + x + n] === cur[row + x + n + 1])) n++;
      this.out[this.pos++] = n;
      for (let i = 0; i < n; i++) this.pixel(cur[row + x + i]);
      x += n;
    }
  }

  /** RGBA word (little-endian view of r, g, b, a) → A R G B bytes. */
  private pixel(p: number) {
    const o = this.out;
    o[this.pos++] = p >>> 24;
    o[this.pos++] = p & 255;
    o[this.pos++] = (p >>> 8) & 255;
    o[this.pos++] = (p >>> 16) & 255;
  }

  private u16(v: number) {
    this.out[this.pos++] = v >>> 8;
    this.out[this.pos++] = v & 255;
  }

  private u32(v: number) {
    this.u16(v >>> 16);
    this.u16(v & 0xffff);
  }
}

function rowEqual(a: Uint32Array, b: Uint32Array, off: number, w: number): boolean {
  for (let i = off, e = off + w; i < e; i++) if (a[i] !== b[i]) return false;
  return true;
}
