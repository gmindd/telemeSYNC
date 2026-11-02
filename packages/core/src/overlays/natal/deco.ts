import { mixColor, withAlpha } from '../panel/paint.ts';
import type { Ctx2D } from '../types.ts';

// Christmas decorations drawn with paths only (the same code runs in the browser and in the exporter):
// snow, string lights, holly, candy canes, Santa hat, pine wreath, bow, ribbon, wood, antlers, tree.
// Random details use a seeded generator, so every frame draws them in the same place.

/** Small deterministic random generator (xorshift), 0..1. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100_000) / 100_000;
  };
}

function noShadow(ctx: Ctx2D) {
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

function snowPaint(ctx: Ctx2D, top: number, bottom: number) {
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.6, '#eef5fb');
  g.addColorStop(1, '#c9dbea');
  return g;
}

/** Snow lying on top of a ring (between angles a0..a1, top of the circle is -π/2). */
export function snowOnArc(ctx: Ctx2D, cx: number, cy: number, r: number, a0: number, a1: number, thick: number, seed = 1) {
  const rand = rng(seed);
  const n = 40;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    // Thicker in the middle (snow piles up on top), lumpy outline.
    const mid = Math.sin((Math.PI * i) / n);
    const lump = Math.sin(i * 1.7 + seed) * 0.18 + Math.sin(i * 0.6 + seed * 2) * 0.12;
    const rr = r + thick * (0.25 + 0.75 * mid) * (0.85 + lump);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = n; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / n;
    const mid = Math.sin((Math.PI * i) / n);
    // Icicle-like drips on the inner edge.
    const drip = i % 6 === 3 ? thick * (0.35 + rand() * 0.4) * mid : rand() * thick * 0.12;
    const rr = r - thick * 0.35 * mid - drip;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = snowPaint(ctx, cy - r - thick, cy - r + thick);
  ctx.fill();
  noShadow(ctx);
}

/** Snow on top of a horizontal edge from x to x + w at height y (roof, sign, card). */
export function snowOnEdge(ctx: Ctx2D, x: number, y: number, w: number, thick: number, seed = 1) {
  const rand = rng(seed);
  const n = Math.max(8, Math.round(w / 9));
  ctx.beginPath();
  ctx.moveTo(x - 3, y + 2);
  for (let i = 0; i <= n; i++) {
    const xx = x + (w * i) / n;
    const edge = Math.min(1, Math.min(i, n - i) / 2.5);
    ctx.lineTo(xx, y - thick * (0.45 + 0.55 * edge) * (0.75 + rand() * 0.35));
  }
  ctx.lineTo(x + w + 3, y + 2);
  for (let i = n; i >= 0; i--) {
    const xx = x + (w * i) / n;
    const drip = i % 4 === 2 ? thick * (0.5 + rand() * 0.7) : thick * (0.15 + rand() * 0.2);
    ctx.lineTo(xx, y + drip);
  }
  ctx.closePath();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = snowPaint(ctx, y - thick, y + thick);
  ctx.fill();
  noShadow(ctx);
}

const BULBS = ['#ff3b3b', '#ffd23f', '#3ddc5a', '#3fa9ff', '#ff8a1f', '#ff5fd2'];

function bulb(ctx: Ctx2D, x: number, y: number, r: number, color: string, on: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.shadowColor = withAlpha(color, 0.95 * on);
  ctx.shadowBlur = 10 * on + 2;
  ctx.fillStyle = mixColor('#3a3a3a', color, 0.35 + 0.65 * on);
  ctx.fill();
  noShadow(ctx);
  // Highlight.
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.45 * on})`;
  ctx.fill();
}

/** Twinkle level 0.55..1 of bulb `i` at time `t` (ms): slow, so it reads on video. */
function twinkle(i: number, t: number): number {
  return 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t / 650 + i * 2.1));
}

/** String of lights hanging along an arc of a circle. */
export function lightsOnArc(ctx: Ctx2D, cx: number, cy: number, r: number, a0: number, a1: number, n: number, t: number, size = 4.5) {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + ((a1 - a0) * (i + 0.5)) / n;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  ctx.beginPath();
  for (let i = 0; i <= n * 4; i++) {
    const a = a0 + ((a1 - a0) * i) / (n * 4);
    const sag = Math.abs(Math.sin((Math.PI * i) / 4)) * 3;
    const x = cx + Math.cos(a) * (r - sag);
    const y = cy + Math.sin(a) * (r - sag);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = 'rgba(20,40,20,0.9)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  pts.forEach(([x, y], i) => bulb(ctx, x, y, size, BULBS[i % BULBS.length], twinkle(i, t)));
}

/** String of lights hanging between two points. */
export function lightsOnLine(ctx: Ctx2D, x0: number, y0: number, x1: number, y1: number, n: number, t: number, size = 4.5, sag = 6) {
  ctx.beginPath();
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    pts.push([x0 + (x1 - x0) * f, y0 + (y1 - y0) * f + sag * 0.9]);
  }
  ctx.moveTo(x0, y0);
  for (let i = 0; i < n; i++) {
    const f0 = i / n;
    const f1 = (i + 1) / n;
    const mx = x0 + (x1 - x0) * ((f0 + f1) / 2);
    const my = y0 + (y1 - y0) * ((f0 + f1) / 2) + sag * 2;
    ctx.quadraticCurveTo(mx, my, x0 + (x1 - x0) * f1, y0 + (y1 - y0) * f1);
  }
  ctx.strokeStyle = 'rgba(20,40,20,0.9)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  pts.forEach(([x, y], i) => bulb(ctx, x, y, size, BULBS[(i + 2) % BULBS.length], twinkle(i + 3, t)));
}

/** One spiky holly leaf from the origin along +x, length `l`. */
function hollyLeaf(ctx: Ctx2D, l: number, w: number) {
  const spikes = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  for (let i = 1; i <= spikes * 2; i++) {
    const f = i / (spikes * 2);
    const x = l * f;
    const half = Math.sin(Math.PI * f) * w;
    ctx.lineTo(x, i % 2 ? -half * 1.15 : -half * 0.7);
  }
  for (let i = spikes * 2 - 1; i >= 1; i--) {
    const f = i / (spikes * 2);
    const half = Math.sin(Math.PI * f) * w;
    ctx.lineTo(l * f, i % 2 ? half * 1.15 : half * 0.7);
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -w, 0, w);
  g.addColorStop(0, '#2e9e48');
  g.addColorStop(1, '#14612a');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,30,10,0.6)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(2, 0);
  ctx.lineTo(l * 0.9, 0);
  ctx.strokeStyle = 'rgba(190,240,190,0.45)';
  ctx.stroke();
}

/** Two holly leaves and three red berries at (x, y), size `s`, turned by `rot`. */
export function holly(ctx: Ctx2D, x: number, y: number, s: number, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  for (const a of [-0.55, 0.55, Math.PI]) {
    ctx.save();
    ctx.rotate(a - Math.PI / 2);
    hollyLeaf(ctx, s * (a === Math.PI ? 0.8 : 1), s * 0.32);
    ctx.restore();
  }
  for (const [bx, by] of [[-s * 0.14, -s * 0.05], [s * 0.14, -s * 0.05], [0, s * 0.14]]) {
    ctx.beginPath();
    ctx.arc(bx, by, s * 0.14, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(bx - s * 0.05, by - s * 0.05, 1, bx, by, s * 0.14);
    g.addColorStop(0, '#ff6b6b');
    g.addColorStop(1, '#a50d17');
    ctx.fillStyle = g;
    ctx.fill();
  }
  ctx.restore();
}

/** Red and white candy-cane ring between radius r - w/2 and r + w/2. */
export function candyRing(ctx: Ctx2D, cx: number, cy: number, r: number, w: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#f7f7f7';
  ctx.lineWidth = w;
  ctx.stroke();
  const n = 22;
  const sw = (Math.PI * 2) / n / 2.2;
  const twist = 0.16;
  ctx.fillStyle = '#d4202c';
  for (let k = 0; k < n; k++) {
    const a = (k * Math.PI * 2) / n;
    ctx.beginPath();
    ctx.arc(cx, cy, r - w / 2, a, a + sw);
    ctx.arc(cx, cy, r + w / 2, a + sw + twist, a + twist, true);
    ctx.closePath();
    ctx.fill();
  }
  // Round, glossy look: dark edges and a highlight on the top.
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(cx, cy, r - w / 2, cx, cy, r + w / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.35)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.strokeStyle = g;
  ctx.lineWidth = w;
  ctx.stroke();
}

/** Candy cane: straight stick with a hook, red stripes, from (x, y) up, length `len`, turned by `rot`. */
export function candyCane(ctx: Ctx2D, x: number, y: number, len: number, w: number, rot = 0) {
  const hookR = len * 0.2;
  const pts: [number, number][] = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) pts.push([0, -(len - hookR) * (i / steps)]);
  for (let i = 1; i <= 24; i++) {
    const a = Math.PI - (Math.PI * i) / 24;
    pts.push([hookR + Math.cos(a) * hookR, -(len - hookR) - Math.sin(a) * hookR]);
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = w + 3;
  ctx.stroke();
  ctx.strokeStyle = '#f7f7f7';
  ctx.lineWidth = w;
  ctx.stroke();
  // Stripes: every other short stretch of the path in red.
  ctx.lineCap = 'butt';
  ctx.strokeStyle = '#d4202c';
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    acc += d;
    if (Math.floor(acc / (w * 0.9)) % 2 === 0) {
      ctx.beginPath();
      ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
      ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Fluffy white trim: a row of overlapping circles from (x0, y) to (x1, y). */
function fluff(ctx: Ctx2D, x0: number, x1: number, y: number, r: number) {
  const n = Math.max(3, Math.round((x1 - x0) / (r * 0.9)));
  ctx.fillStyle = '#f4f6f8';
  for (let i = 0; i <= n; i++) {
    ctx.beginPath();
    ctx.arc(x0 + ((x1 - x0) * i) / n, y + (i % 2 ? -r * 0.15 : r * 0.1), r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Santa hat with its band centred at (x, y), width `w`, tilted by `rot`. */
export function santaHat(ctx: Ctx2D, x: number, y: number, w: number, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const h = w * 0.95;
  ctx.beginPath();
  ctx.moveTo(-w * 0.48, 0);
  ctx.bezierCurveTo(-w * 0.42, -h * 0.7, w * 0.1, -h * 1.05, w * 0.62, -h * 0.62);
  ctx.bezierCurveTo(w * 0.35, -h * 0.55, w * 0.42, -h * 0.25, w * 0.48, 0);
  ctx.closePath();
  const g = ctx.createLinearGradient(-w / 2, -h, w / 2, 0);
  g.addColorStop(0, '#ff4d4d');
  g.addColorStop(1, '#a3111d');
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = g;
  ctx.fill();
  noShadow(ctx);
  fluff(ctx, -w * 0.5, w * 0.5, 0, w * 0.13);
  ctx.beginPath();
  ctx.arc(w * 0.64, -h * 0.6, w * 0.13, 0, Math.PI * 2);
  ctx.fillStyle = '#f4f6f8';
  ctx.fill();
  ctx.restore();
}

/** Pine wreath ring of radius r and width w, with a few red berries and gold baubles. */
export function wreathRing(ctx: Ctx2D, cx: number, cy: number, r: number, w: number, seed = 7) {
  const rand = rng(seed);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#0f3b1d';
  ctx.lineWidth = w;
  ctx.stroke();
  const greens = ['#1d6b34', '#2a8a45', '#15532a'];
  const n = Math.round(r * 0.9);
  for (const [ci, color] of greens.entries()) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = ((i + rand()) / n) * Math.PI * 2;
      if (i % greens.length !== ci) continue;
      const rr = r + (rand() - 0.5) * w * 0.8;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      // A sprig: five needles fanning along the ring.
      const dir = a + Math.PI / 2 + (rand() - 0.5) * 0.6;
      for (let k = -2; k <= 2; k++) {
        const d = dir + k * 0.35;
        const len = w * (0.32 + rand() * 0.18);
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(d) * len, y + Math.sin(d) * len);
      }
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  for (let i = 0; i < 9; i++) {
    const a = ((i + 0.3) / 9) * Math.PI * 2 + rand() * 0.2;
    const rr = r + (rand() - 0.5) * w * 0.4;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    const gold = i % 3 === 1;
    ctx.beginPath();
    ctx.arc(x, y, gold ? w * 0.17 : w * 0.12, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(x - 1.5, y - 1.5, 0.5, x, y, w * 0.17);
    g.addColorStop(0, gold ? '#fff2b0' : '#ff7a7a');
    g.addColorStop(1, gold ? '#c08a12' : '#a50d17');
    ctx.fillStyle = g;
    ctx.fill();
  }
}

/** Red bow centred at (x, y), width `w`. */
export function bow(ctx: Ctx2D, x: number, y: number, w: number) {
  ctx.save();
  ctx.translate(x, y);
  const red = (a: string, b: string, y0: number, y1: number) => {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    return g;
  };
  // Tails.
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sgn * w * 0.05, 0);
    ctx.lineTo(sgn * w * 0.32, w * 0.62);
    ctx.lineTo(sgn * w * 0.2, w * 0.55);
    ctx.lineTo(sgn * w * 0.14, w * 0.66);
    ctx.lineTo(-sgn * w * 0.04, w * 0.05);
    ctx.closePath();
    ctx.fillStyle = red('#e5323e', '#8e0f18', 0, w * 0.66);
    ctx.fill();
  }
  // Loops.
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(sgn * w * 0.25, -w * 0.42, sgn * w * 0.62, -w * 0.28, sgn * w * 0.5, w * 0.02);
    ctx.bezierCurveTo(sgn * w * 0.42, w * 0.2, sgn * w * 0.2, w * 0.12, 0, 0);
    ctx.closePath();
    ctx.fillStyle = red('#ff4b55', '#a3111d', -w * 0.4, w * 0.2);
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 4;
    ctx.fill();
    noShadow(ctx);
  }
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.1, w * 0.12, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#c21824';
  ctx.fill();
  ctx.restore();
}

/** Ribbon banner with folded ends, centred at (cx, cy). Returns nothing; text is drawn by the caller. */
export function ribbon(ctx: Ctx2D, cx: number, cy: number, w: number, h: number, color = '#c4141f') {
  const dark = mixColor(color, '#000000', 0.45);
  for (const sgn of [-1, 1]) {
    const x = cx + sgn * (w / 2 - h * 0.2);
    ctx.beginPath();
    ctx.moveTo(x, cy - h * 0.3);
    ctx.lineTo(x + sgn * h * 0.95, cy - h * 0.3);
    ctx.lineTo(x + sgn * h * 0.6, cy + h * 0.2);
    ctx.lineTo(x + sgn * h * 0.95, cy + h * 0.7);
    ctx.lineTo(x, cy + h * 0.7);
    ctx.closePath();
    ctx.fillStyle = dark;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, cy - h / 2);
  ctx.quadraticCurveTo(cx, cy - h / 2 - h * 0.18, cx + w / 2, cy - h / 2);
  ctx.lineTo(cx + w / 2, cy + h / 2);
  ctx.quadraticCurveTo(cx, cy + h / 2 - h * 0.18, cx - w / 2, cy + h / 2);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
  g.addColorStop(0, mixColor(color, '#ffffff', 0.15));
  g.addColorStop(1, mixColor(color, '#000000', 0.2));
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = g;
  ctx.fill();
  noShadow(ctx);
  ctx.strokeStyle = 'rgba(255,215,120,0.7)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

/** Wood fill for the current path: warm gradient with grain lines inside (x, y, w, h). */
export function woodFill(ctx: Ctx2D, x: number, y: number, w: number, h: number, seed = 3, horizontal = true) {
  const g = horizontal ? ctx.createLinearGradient(0, y, 0, y + h) : ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, '#9a5f32');
  g.addColorStop(0.5, '#7a4523');
  g.addColorStop(1, '#5a3118');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  const rand = rng(seed);
  ctx.lineWidth = 1;
  const lines = Math.round((horizontal ? h : w) / 5);
  for (let i = 0; i < lines; i++) {
    const p = (i + rand()) / lines;
    ctx.beginPath();
    const amp = 1 + rand() * 2.5;
    const ph = rand() * 6;
    for (let k = 0; k <= 24; k++) {
      const f = k / 24;
      const wav = Math.sin(f * 9 + ph) * amp;
      const px = horizontal ? x + f * w : x + p * w + wav;
      const py = horizontal ? y + p * h + wav : y + f * h;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = rand() > 0.5 ? 'rgba(40,18,6,0.35)' : 'rgba(255,200,140,0.12)';
    ctx.stroke();
  }
  ctx.restore();
}

/** Wooden board (planks) with dark edge and nails. */
export function woodBoard(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number, seed = 3, planks = 3) {
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    ctx.lineTo(x + w, y + h - r);
    ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    ctx.lineTo(x + r, y + h);
    ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    ctx.lineTo(x, y + r);
    ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
    ctx.closePath();
  };
  path();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = '#5a3118';
  ctx.fill();
  noShadow(ctx);
  path();
  woodFill(ctx, x, y, w, h, seed);
  ctx.strokeStyle = 'rgba(30,12,4,0.55)';
  ctx.lineWidth = 1.5;
  for (let i = 1; i < planks; i++) {
    const py = y + (h * i) / planks;
    ctx.beginPath();
    ctx.moveTo(x + 4, py);
    ctx.lineTo(x + w - 4, py);
    ctx.stroke();
  }
  path();
  ctx.strokeStyle = '#3a1d0c';
  ctx.lineWidth = 3;
  ctx.stroke();
  for (const [nx, ny] of [[x + 10, y + 10], [x + w - 10, y + 10], [x + 10, y + h - 10], [x + w - 10, y + h - 10]]) {
    ctx.beginPath();
    ctx.arc(nx, ny, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = '#c9b38a';
    ctx.fill();
  }
}

/** Dark panel inside a wooden frame, for numbers that must read clearly. */
export function darkInset(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number, opacity: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
  ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  ctx.closePath();
  ctx.fillStyle = `rgba(14,10,8,${Math.max(0.55, opacity)})`;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,220,170,0.18)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

/** Wooden ring (annulus) between r0 and r1 with circular grain. */
export function woodRing(ctx: Ctx2D, cx: number, cy: number, r0: number, r1: number, seed = 5) {
  const rand = rng(seed);
  ctx.beginPath();
  ctx.arc(cx, cy, r1, 0, Math.PI * 2);
  ctx.arc(cx, cy, r0, 0, Math.PI * 2, true);
  const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
  g.addColorStop(0, '#5a3118');
  g.addColorStop(0.45, '#9a5f32');
  g.addColorStop(1, '#5a3118');
  ctx.fillStyle = g;
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 8;
  ctx.fill();
  noShadow(ctx);
  ctx.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    const rr = r0 + ((r1 - r0) * (i + 0.5)) / 7;
    const a = rand() * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, a, a + Math.PI * (0.6 + rand()));
    ctx.strokeStyle = rand() > 0.5 ? 'rgba(40,18,6,0.4)' : 'rgba(255,200,140,0.15)';
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r1, 0, Math.PI * 2);
  ctx.strokeStyle = '#3a1d0c';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r0, 0, Math.PI * 2);
  ctx.stroke();
}

/** Tree-log ring: rough bark outside, cut face with growth rings. */
export function logRing(ctx: Ctx2D, cx: number, cy: number, r0: number, r1: number, seed = 9) {
  const rand = rng(seed);
  // Bark: lumpy dark outer edge.
  ctx.beginPath();
  const n = 60;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r1 + (rand() - 0.5) * 4;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = '#3b2210';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 8;
  ctx.fill();
  noShadow(ctx);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + rand() * 0.05;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (r1 - 7), cy + Math.sin(a) * (r1 - 7));
    ctx.lineTo(cx + Math.cos(a) * (r1 + 1), cy + Math.sin(a) * (r1 + 1));
    ctx.stroke();
  }
  // Cut face.
  const face = r1 - 8;
  ctx.beginPath();
  ctx.arc(cx, cy, face, 0, Math.PI * 2);
  ctx.arc(cx, cy, r0, 0, Math.PI * 2, true);
  const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, face);
  g.addColorStop(0, '#e2b77e');
  g.addColorStop(1, '#b7834b');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const rr = r0 + ((face - r0) * (i + 0.6)) / 5.5;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(110,60,20,0.45)';
    ctx.stroke();
  }
}

/** Reindeer antler rising from (x, y); `dir` = -1 for the left one, 1 for the right one. */
export function antler(ctx: Ctx2D, x: number, y: number, s: number, dir: 1 | -1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const beam = () => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(s * 0.15, -s * 0.35, s * 0.45, -s * 0.55, s * 0.55, -s * 0.95);
    ctx.moveTo(s * 0.12, -s * 0.22);
    ctx.quadraticCurveTo(s * 0.02, -s * 0.45, -s * 0.12, -s * 0.55);
    ctx.moveTo(s * 0.32, -s * 0.5);
    ctx.quadraticCurveTo(s * 0.25, -s * 0.75, s * 0.12, -s * 0.88);
    ctx.moveTo(s * 0.47, -s * 0.72);
    ctx.quadraticCurveTo(s * 0.62, -s * 0.8, s * 0.78, -s * 0.78);
  };
  beam();
  ctx.strokeStyle = '#3a200d';
  ctx.lineWidth = s * 0.16;
  ctx.stroke();
  beam();
  ctx.strokeStyle = '#8a5a30';
  ctx.lineWidth = s * 0.1;
  ctx.stroke();
  ctx.restore();
}

/** Five-pointed star centred at (x, y). */
export function star(ctx: Ctx2D, x: number, y: number, r: number, color = '#ffd23f') {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.shadowColor = withAlpha(color, 0.9);
  ctx.shadowBlur = 8;
  ctx.fillStyle = color;
  ctx.fill();
  noShadow(ctx);
}

/** Small Christmas tree with its base at (x, y) and height h. */
export function tree(ctx: Ctx2D, x: number, y: number, h: number, t = 0) {
  const w = h * 0.62;
  ctx.fillStyle = '#5a3118';
  ctx.fillRect(x - w * 0.08, y - h * 0.12, w * 0.16, h * 0.12);
  for (let k = 0; k < 3; k++) {
    const top = y - h * (0.42 + k * 0.22);
    const bottom = y - h * (0.1 + k * 0.2);
    const half = w * (0.5 - k * 0.12);
    ctx.beginPath();
    ctx.moveTo(x, top - h * 0.1);
    ctx.lineTo(x + half, bottom);
    ctx.lineTo(x - half, bottom);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, '#3ddc5a');
    g.addColorStop(1, '#17722f');
    ctx.fillStyle = g;
    ctx.fill();
  }
  const dots: [number, number][] = [[-0.18, 0.2], [0.2, 0.27], [-0.05, 0.42], [0.12, 0.55], [-0.12, 0.66]];
  dots.forEach(([dx, dy], i) => bulb(ctx, x + dx * w, y - h * (0.12 + dy * 0.75), h * 0.035, BULBS[i % BULBS.length], twinkle(i, t)));
  star(ctx, x, y - h * 1.02, h * 0.1);
}

/** Small six-armed snowflakes scattered in the box (x, y, w, h). */
export function snowflakes(ctx: Ctx2D, x: number, y: number, w: number, h: number, n: number, size: number, seed = 11, alpha = 0.7) {
  const rand = rng(seed);
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const px = x + rand() * w;
    const py = y + rand() * h;
    const s = size * (0.5 + rand() * 0.6);
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI) / 3 + rand() * 0.2;
      ctx.moveTo(px - Math.cos(a) * s, py - Math.sin(a) * s);
      ctx.lineTo(px + Math.cos(a) * s, py + Math.sin(a) * s);
    }
  }
  ctx.lineWidth = Math.max(1, size * 0.22);
  ctx.stroke();
}
