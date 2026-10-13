import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { encodeFit, syntheticRide } from '../../../packages/core/test/helpers/synthetic.ts';

const cfg = mkdtempSync(join(tmpdir(), 'tsync-cfg-'));
const out = mkdtempSync(join(tmpdir(), 'tsync-out-'));
process.env.TELEMESYNC_CONFIG_DIR = cfg;

let app: FastifyInstance;
const opened: string[] = [];
const synth = syntheticRide();

beforeAll(async () => {
  const { buildApp } = await import('../src/app.ts');
  app = await buildApp({ webDist: join(cfg, 'none'), openPath: (p) => opened.push(p) });
  await app.ready();
});
afterAll(() => app.close());

async function uploadRide(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/telemetry?name=volta.fit',
    headers: { 'content-type': 'application/octet-stream' },
    payload: Buffer.from(encodeFit(synth.samples)),
  });
  expect(res.statusCode).toBe(200);
  const body = res.json();
  expect(body.available).toContain('speed');
  return body.id;
}

async function waitJob(id: string) {
  for (let i = 0; i < 200; i++) {
    const s = (await app.inject({ url: `/api/jobs/${id}` })).json();
    if (s.status !== 'running') return s;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('timeout');
}

describe('server API', () => {
  it('settings: default + update output dir', async () => {
    const s = (await app.inject({ url: '/api/settings' })).json();
    expect(s.outputDir).toMatch(/telemeSYNC$/);
    const r = await app.inject({ method: 'PUT', url: '/api/settings', payload: { outputDir: out } });
    expect(r.json().outputDir).toBe(out);
    expect((await app.inject({ method: 'PUT', url: '/api/settings', payload: { outputDir: 'relativo' } })).statusCode).toBe(400);
  });

  it('rejects invalid telemetry', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/telemetry?name=x.fit', headers: { 'content-type': 'application/octet-stream' }, payload: Buffer.from('nope') });
    expect(r.statusCode).toBe(400);
  });

  it('renders clips × overlays into {out}/{ride}/{clip}/{clip}_{metric}.mov', async () => {
    const rideId = await uploadRide();
    const start = synth.climb.startT;
    const res = await app.inject({
      method: 'POST',
      url: '/api/render',
      payload: {
        rideId,
        rideName: 'Volta: Sintra?',
        clips: [
          { id: 'a', fileName: 'GX010001.MP4', startUtcMs: start, durationMs: 1000, fps: { num: 30, den: 1 } },
          { id: 'b', fileName: 'DJI_20240615093005_0001_D.MP4', startUtcMs: start + 5000, durationMs: 500, fps: { num: 25, den: 1 }, frameCount: 12 },
        ],
        overlays: ['speed', 'map'],
        format: 'prores',
      },
    });
    expect(res.statusCode).toBe(200);
    const snap = await waitJob(res.json().id);
    expect(snap.status).toBe('done');
    expect(snap.tasks).toHaveLength(4);
    const rideDir = join(out, 'Volta_ Sintra_');
    expect(existsSync(join(rideDir, 'GX010001', 'GX010001_velocidade.mov'))).toBe(true);
    expect(existsSync(join(rideDir, 'DJI_20240615093005_0001_D', 'DJI_20240615093005_0001_D_mapa.mov'))).toBe(true);

    // SSE stream for a finished job sends one snapshot and closes
    const sse = await app.inject({ url: `/api/jobs/${snap.id}/events` });
    expect(sse.headers['content-type']).toMatch(/text\/event-stream/);
    expect(sse.body).toMatch(/^data: \{.*"status":"done"/);

    // open folder: allowed inside output, refused elsewhere
    expect((await app.inject({ method: 'POST', url: '/api/open-folder', payload: { path: rideDir } })).statusCode).toBe(200);
    expect(opened).toContain(rideDir);
    expect((await app.inject({ method: 'POST', url: '/api/open-folder', payload: { path: tmpdir() } })).statusCode).toBe(403);
  });

  it('cancels a running job', async () => {
    const rideId = await uploadRide();
    const res = await app.inject({
      method: 'POST',
      url: '/api/render',
      payload: {
        rideId,
        rideName: 'cancel',
        clips: [{ id: 'a', fileName: 'long.mp4', startUtcMs: synth.climb.startT, durationMs: 120_000, fps: { num: 60, den: 1 } }],
        overlays: ['map'],
        format: 'prores',
      },
    });
    const id = res.json().id;
    await new Promise((r) => setTimeout(r, 300));
    await app.inject({ method: 'POST', url: `/api/jobs/${id}/cancel` });
    const snap = await waitJob(id);
    expect(snap.status).toBe('cancelled');
    expect(existsSync(snap.tasks[0].outPath)).toBe(false);
  });

  it('validates render requests', async () => {
    const rideId = await uploadRide();
    const bad = await app.inject({ method: 'POST', url: '/api/render', payload: { rideId, clips: [], overlays: ['speed'] } });
    expect(bad.statusCode).toBe(400);
    const missing = await app.inject({ method: 'POST', url: '/api/render', payload: { rideId: 'nope', clips: [], overlays: [] } });
    expect(missing.statusCode).toBe(404);
  });
});
