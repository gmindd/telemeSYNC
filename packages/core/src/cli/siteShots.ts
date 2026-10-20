/**
 * Renders the overlay images used by the landing page (site/assets/images) from a real ride:
 *   npm run site:shots -- <fit|gpx> [outDir]
 * Picks a climbing moment so speed, grade and heart rate look like a real ride.
 */
import { createCanvas, type Canvas } from '@napi-rs/canvas';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildRide, type RideData } from '../telemetry/ride.ts';
import { parseTelemetryFile } from '../telemetry/load.ts';
import { getOverlay, overlayPixelSize, renderOverlayFrame } from '../overlays/registry.ts';
import { drawComposite, type GadgetPlacement } from '../overlays/layout.ts';
import { DEFAULT_STYLE, type Ctx2D, type OverlayId, type OverlayStyle } from '../overlays/types.ts';
import { registerEmbeddedFonts } from '../node/fonts.ts';

const [file, outDir = 'site/assets/images'] = process.argv.slice(2);
if (!file) throw new Error('Uso: npm run site:shots -- <ficheiro.fit|gpx> [pasta]');
registerEmbeddedFonts();
const ride = buildRide(parseTelemetryFile(file, await readFile(file)));
await mkdir(outDir, { recursive: true });

/** First instant after 35 % of the ride on a steady climb (grade 6–10 %, moving). */
function climbInstant(r: RideData): number {
  for (let i = Math.floor(r.t.length * 0.35); i < r.t.length; i++) {
    if (r.grade[i] >= 6 && r.grade[i] <= 10 && r.speed[i] > 2) return r.t[i];
  }
  return (r.startTime + r.endTime) / 2;
}

const t = climbInstant(ride);
const octx = { ride, clipStart: t - 30_000, clipEnd: t + 30_000 };

async function save(name: string, canvas: Canvas) {
  const path = join(outDir, `${name}.webp`);
  await writeFile(path, await canvas.encode('webp', 90));
  console.log(path);
}

async function shot(name: string, id: OverlayId, style: OverlayStyle) {
  const def = getOverlay(id);
  const { width, height } = overlayPixelSize(def, style);
  const c = createCanvas(width, height);
  renderOverlayFrame(c.getContext('2d') as unknown as Ctx2D, def, t, style, octx);
  await save(name, c);
}

const base: OverlayStyle = { ...DEFAULT_STYLE, scale: 1.5 };
await shot('painel-velocidade', 'panelSpeed', { ...base, panels: { speed: { chart: 'altitude', window: 'distance' } } });
await shot('painel-fc', 'panelHeartRate', { ...base, gradientFrom: '#ff9a3c', gradientTo: '#ff1f5a' });
await shot('painel-altitude', 'panelAltitude', { ...base, gradientFrom: '#00e0a4', gradientTo: '#00a3ff' });
await shot('painel-temperatura', 'panelTemperature', { ...base, gradientFrom: '#00d2ff', gradientTo: '#ff7a1a' });
await shot('mapa', 'map', base);
await shot('perfil', 'elevationProfile', base);
for (const id of ['speed', 'grade', 'heartRate', 'distance'] as OverlayId[]) await shot(`texto-${id}`, id, base);
// Mostradores (round gadgets, minimap, profile card, compact panel).
const dials: [string, OverlayId][] = [
  ['mostrador-fc', 'dialHeartRate'],
  ['mostrador-velocidade', 'dialSpeed'],
  ['mostrador-altitude', 'dialAltitude'],
  ['mostrador-inclinacao', 'dialGrade'],
  ['mapa-circular', 'dialMap'],
  ['mostrador-tempo', 'dialTime'],
  ['perfil-cartao', 'dialProfile'],
  ['painel-compacto', 'dialSummary'],
];
for (const [name, id] of dials) await shot(name, id, base);

// Hero: a 16:9 composition as it would sit over a clip.
const W = 1920;
const H = 1080;
const ids: OverlayId[] = ['speed', 'grade', 'map', 'panelSpeed'];
const placements = {
  speed: { x: 0.03, y: 0.04, w: 0.17 },
  grade: { x: 0.03, y: 0.19, w: 0.14 },
  map: { x: 0.8, y: 0.04, w: 0.17 },
  panelSpeed: { x: 0.03, y: 0.7, w: 0.6 },
} as Record<OverlayId, GadgetPlacement>;
const hero = createCanvas(W, H);
drawComposite(hero.getContext('2d') as unknown as Ctx2D, ids, placements, t, { ...DEFAULT_STYLE, panels: { speed: { chart: 'altitude', window: 'distance' } } }, octx, W, H);
await save('hero-composicao', hero);
