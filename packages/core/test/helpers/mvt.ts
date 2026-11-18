// Tiny vector tile (MVT) writer for tests: an OpenMapTiles "transportation" layer with the given lines.
function varint(n: number): number[] {
  const out: number[] = [];
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return out;
}
const zz = (n: number) => (n < 0 ? -2 * n - 1 : 2 * n);
const field = (num: number, bytes: number[]) => [...varint((num << 3) | 2), ...varint(bytes.length), ...bytes];
const str = (s: string) => Array.from(new TextEncoder().encode(s));

export function mvtTile(lines: { cls: string; pts: number[][] }[]): Uint8Array {
  const classes = [...new Set(lines.map((l) => l.cls))];
  const feats = lines.map((l) => {
    const cmds: number[] = [];
    let x = 0;
    let y = 0;
    l.pts.forEach(([px, py], i) => {
      if (i === 0) cmds.push((1 << 3) | 1);
      if (i === 1) cmds.push(((l.pts.length - 1) << 3) | 2);
      cmds.push(zz(px - x), zz(py - y));
      x = px;
      y = py;
    });
    const packed = (a: number[]) => a.flatMap(varint);
    return field(2, [...field(2, packed([0, classes.indexOf(l.cls)])), ...varint((3 << 3) | 0), 2, ...field(4, packed(cmds))]);
  });
  const layer = [...varint((15 << 3) | 0), 2, ...field(1, str('transportation')), ...feats.flat(), ...field(3, str('class')), ...classes.flatMap((c) => field(4, field(1, str(c)))), ...varint((5 << 3) | 0), ...varint(4096)];
  return Uint8Array.from(field(3, layer));
}

/** A tile full of streets: a grid of roads every ~240 m, and a main road across. */
export function gridTile(): Uint8Array {
  const lines: { cls: string; pts: number[][] }[] = [];
  for (let k = 0; k <= 4096; k += 400) {
    lines.push({ cls: 'minor', pts: [[k, 0], [k, 4096]] });
    lines.push({ cls: 'service', pts: [[0, k], [4096, k]] });
  }
  lines.push({ cls: 'primary', pts: [[0, 0], [4096, 4096]] });
  return mvtTile(lines);
}
