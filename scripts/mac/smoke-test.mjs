// Smoke test of an extracted macOS package: starts it through the launcher, loads the panel, uploads the synthetic
// FIT and renders a short clip (separate gadget + composite) with the bundled Node, canvas and FFmpeg.
//   node scripts/mac/smoke-test.mjs <extracted telemeSYNC folder>
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = resolve(process.argv[2] ?? '');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const port = 5174;
const base = `http://127.0.0.1:${port}`;
const outDir = mkdtempSync(join(tmpdir(), 'telemesync-smoke-'));

const server = spawn('bash', [join(appDir, 'Iniciar telemeSYNC.command')], {
  env: { ...process.env, TELEMESYNC_NO_OPEN: '1', TELEMESYNC_CONFIG_DIR: outDir, TERM: 'dumb' },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
let log = '';
server.stdout.on('data', (d) => (log += d));
server.stderr.on('data', (d) => (log += d));

const fail = (msg) => {
  console.error(`✖ ${msg}\n--- saída do lançador ---\n${log}`);
  stop();
  process.exit(1);
};
const stop = () => {
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (path, init) => {
  const res = await fetch(base + path, init);
  const body = await res.json();
  if (!res.ok) fail(`${path}: ${res.status} ${JSON.stringify(body)}`);
  return body;
};

for (let i = 0; ; i++) {
  if (i > 120) fail('o servidor não respondeu em 60 s');
  if (server.exitCode !== null) fail(`o lançador terminou (código ${server.exitCode})`);
  try {
    if ((await fetch(`${base}/api/health`)).ok) break;
  } catch {
    /* not up yet */
  }
  await sleep(500);
}
console.log('✔ servidor no ar');

const page = await (await fetch(base + '/')).text();
if (!page.includes('<div id="root">')) fail('o painel web não foi servido');
console.log('✔ painel web');

const fit = readFileSync(join(root, 'fixtures/synthetic/synthetic.fit'));
const ride = await api('/api/telemetry?name=synthetic.fit', {
  method: 'POST',
  headers: { 'content-type': 'application/octet-stream' },
  body: fit,
});
const start = typeof ride.startTime === 'number' ? ride.startTime : Date.parse(ride.startTime);
console.log(`✔ telemetria lida (${ride.available.join(', ')})`);

const job = await api('/api/render', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    rideId: ride.id,
    rideName: 'smoke',
    clips: [{ id: 'a', fileName: 'GX010001.MP4', startUtcMs: start + 60_000, durationMs: 2000, fps: { num: 30, den: 1 }, width: 1920, height: 1080 }],
    overlays: ['speed'],
    separate: true,
    composite: true,
    format: 'animation',
    outputDir: outDir,
  }),
});
let snap = job;
for (let i = 0; snap.status === 'running'; i++) {
  if (i > 240) fail('a renderização não terminou em 2 min');
  await sleep(500);
  snap = await api(`/api/jobs/${job.id}`);
}
if (snap.status !== 'done') fail(`renderização: ${JSON.stringify(snap)}`);

const files = [];
const walk = (d) => readdirSync(d).forEach((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : files.push(join(d, n))));
walk(outDir);
const movs = files.filter((f) => f.endsWith('.mov'));
if (movs.length !== 2) fail(`esperava 2 .mov, saíram: ${files.join(', ')}`);
// The bundled FFmpeg decodes what it wrote.
const ffmpeg = join(appDir, 'runtime', process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64', 'ffmpeg');
for (const f of movs) {
  const r = spawnSync(ffmpeg, ['-v', 'error', '-i', f, '-f', 'null', '-']);
  if (r.status !== 0 || statSync(f).size === 0) fail(`ficheiro inválido ${f}: ${r.stderr}`);
}
console.log(`✔ renderização: ${movs.map((f) => f.slice(outDir.length + 1)).join(', ')}`);

const quarantined = spawnSync('xattr', ['-r', appDir], { encoding: 'utf8' }).stdout.split('\n').filter((l) => l.includes('quarantine'));
if (quarantined.length) fail(`ficheiros ainda em quarentena:\n${quarantined.slice(0, 5).join('\n')}`);
console.log('✔ quarentena removida pelo lançador');

stop();
console.log('✔ smoke test concluído');
