/**
 * Renders every available overlay at one instant into a single PNG over a checkerboard,
 * for quick visual review:  npx tsx packages/core/src/cli/contactSheet.ts <fit|gpx> <isoTime> <out.png> [en|pt|fr|es|de]
 */
import { createCanvas } from '@napi-rs/canvas';
import { readFile, writeFile } from 'node:fs/promises';
import { buildRide } from '../telemetry/ride.ts';
import { parseTelemetryFile } from '../telemetry/load.ts';
import { availableOverlays, overlayPixelSize, renderOverlayFrame } from '../overlays/registry.ts';
import { DEFAULT_STYLE, type Ctx2D } from '../overlays/types.ts';
import { registerEmbeddedFonts } from '../node/fonts.ts';
import { isLang } from '../i18n/index.ts';

const [file, iso, out = 'contact-sheet.png', lang] = process.argv.slice(2);
registerEmbeddedFonts();
const ride = buildRide(parseTelemetryFile(file, await readFile(file)));
const t = iso ? Date.parse(iso) : (ride.startTime + ride.endTime) / 2;
const style = { ...DEFAULT_STYLE, scale: 1, language: isLang(lang) ? lang : DEFAULT_STYLE.language };
const defs = availableOverlays(ride);
const W = 1400;
let x = 10;
let y = 10;
let rowH = 0;
const placed: { def: (typeof defs)[number]; x: number; y: number }[] = [];
for (const def of defs) {
  const s = overlayPixelSize(def, style);
  if (x + s.width > W) {
    x = 10;
    y += rowH + 10;
    rowH = 0;
  }
  placed.push({ def, x, y });
  x += s.width + 10;
  rowH = Math.max(rowH, s.height);
}
const H = y + rowH + 10;
const sheet = createCanvas(W, H);
const sctx = sheet.getContext('2d');
for (let yy = 0; yy < H; yy += 20) for (let xx = 0; xx < W; xx += 20) {
  sctx.fillStyle = (xx + yy) % 40 === 0 ? '#6b8e5a' : '#4a6b3d';
  sctx.fillRect(xx, yy, 20, 20);
}
for (const p of placed) {
  const s = overlayPixelSize(p.def, style);
  const c = createCanvas(s.width, s.height);
  renderOverlayFrame(c.getContext('2d') as unknown as Ctx2D, p.def, t, style, { ride, clipStart: t - 5000, clipEnd: t + 25000 });
  sctx.drawImage(c, p.x, p.y);
  sctx.strokeStyle = 'rgba(255,255,255,0.25)';
  sctx.strokeRect(p.x + 0.5, p.y + 0.5, s.width - 1, s.height - 1);
}
await writeFile(out, await sheet.encode('png'));
console.log(out);
