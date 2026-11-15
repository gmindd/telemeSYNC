// Minimal Mapbox Vector Tile reader (https://github.com/mapbox/vector-tile-spec, v2): layers, their features' string
// properties and line geometries in tile units. Enough to read the roads of a tile; polygons and points are skipped.

class Pbf {
  pos: number;
  constructor(
    public b: Uint8Array,
    start = 0,
    public end = b.length,
  ) {
    this.pos = start;
  }
  varint(): number {
    let v = 0;
    let shift = 0;
    for (;;) {
      const byte = this.b[this.pos++]!;
      v += (byte & 0x7f) * 2 ** shift;
      if (byte < 0x80) return v;
      shift += 7;
      if (shift > 63) throw new Error('bad varint');
    }
  }
  /** Skips a field of the given wire type. */
  skip(wire: number) {
    if (wire === 0) this.varint();
    else if (wire === 1) this.pos += 8;
    else if (wire === 2) this.pos += this.varint();
    else if (wire === 5) this.pos += 4;
    else throw new Error(`wire type ${wire}`);
  }
  /** A length-delimited field as a sub-reader (and moves past it). */
  sub(): Pbf {
    const len = this.varint();
    const r = new Pbf(this.b, this.pos, this.pos + len);
    this.pos += len;
    return r;
  }
  string(): string {
    const r = this.sub();
    return new TextDecoder().decode(this.b.subarray(r.pos, r.end));
  }
  packed(): number[] {
    const r = this.sub();
    const out: number[] = [];
    while (r.pos < r.end) out.push(r.varint());
    return out;
  }
}

const zigzag = (n: number) => (n % 2 ? -(n + 1) / 2 : n / 2);

export interface MvtFeature {
  /** 1 point, 2 line, 3 polygon. */
  type: number;
  props: Record<string, string | number | boolean>;
  /** Lines of [x, y] in tile units (0..extent). */
  lines: [number, number][][];
}

export interface MvtLayer {
  name: string;
  extent: number;
  features: MvtFeature[];
}

function readValue(r: Pbf): string | number | boolean {
  let v: string | number | boolean = '';
  while (r.pos < r.end) {
    const tag = r.varint();
    const field = tag >> 3;
    if (field === 1) v = r.string();
    else if (field === 2) {
      v = new DataView(r.b.buffer, r.b.byteOffset + r.pos, 4).getFloat32(0, true);
      r.pos += 4;
    } else if (field === 3) {
      v = new DataView(r.b.buffer, r.b.byteOffset + r.pos, 8).getFloat64(0, true);
      r.pos += 8;
    } else if (field === 4 || field === 5) v = r.varint();
    else if (field === 6) v = zigzag(r.varint());
    else if (field === 7) v = r.varint() !== 0;
    else r.skip(tag & 7);
  }
  return v;
}

function geometry(cmds: number[]): [number, number][][] {
  const lines: [number, number][][] = [];
  let cur: [number, number][] | null = null;
  let x = 0;
  let y = 0;
  for (let i = 0; i < cmds.length; ) {
    const c = cmds[i++]!;
    const id = c & 7;
    const count = c >> 3;
    if (id === 7) {
      if (cur?.length) cur.push(cur[0]!);
      continue;
    }
    for (let k = 0; k < count && i + 1 < cmds.length; k++) {
      x += zigzag(cmds[i++]!);
      y += zigzag(cmds[i++]!);
      if (id === 1) {
        cur = [[x, y]];
        lines.push(cur);
      } else cur?.push([x, y]);
    }
  }
  return lines;
}

/** The layers of a tile (already decompressed), each with only the features of `want` types. */
export function readMvt(bytes: Uint8Array, layerNames?: string[], want: number[] = [2]): MvtLayer[] {
  const tile = new Pbf(bytes);
  const layers: MvtLayer[] = [];
  while (tile.pos < tile.end) {
    const tag = tile.varint();
    if (tag >> 3 !== 3 || (tag & 7) !== 2) {
      tile.skip(tag & 7);
      continue;
    }
    const r = tile.sub();
    let name = '';
    let extent = 4096;
    const keys: string[] = [];
    const values: (string | number | boolean)[] = [];
    const raw: Pbf[] = [];
    while (r.pos < r.end) {
      const t = r.varint();
      const field = t >> 3;
      if (field === 1) name = r.string();
      else if (field === 2) raw.push(r.sub());
      else if (field === 3) keys.push(r.string());
      else if (field === 4) values.push(readValue(r.sub()));
      else if (field === 5) extent = r.varint();
      else r.skip(t & 7);
    }
    if (layerNames && !layerNames.includes(name)) continue;
    const features: MvtFeature[] = [];
    for (const f of raw) {
      let type = 0;
      let tags: number[] = [];
      let cmds: number[] = [];
      while (f.pos < f.end) {
        const t = f.varint();
        const field = t >> 3;
        if (field === 2) tags = f.packed();
        else if (field === 3) type = f.varint();
        else if (field === 4) cmds = f.packed();
        else f.skip(t & 7);
      }
      if (!want.includes(type)) continue;
      const props: MvtFeature['props'] = {};
      for (let i = 0; i + 1 < tags.length; i += 2) props[keys[tags[i]!]!] = values[tags[i + 1]!]!;
      features.push({ type, props, lines: geometry(cmds) });
    }
    layers.push({ name, extent, features });
  }
  return layers;
}
