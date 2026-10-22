import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildRide,
  DEFAULT_STYLE,
  errorText,
  getOverlay,
  isLang,
  isOutputFormat,
  tr,
  type Lang,
  parseTelemetryFile,
  type OverlayId,
  type RideData,
} from '@telemesync/core';
import { JobManager, type RenderRequest } from './jobs.ts';
import { openPath } from './openPath.ts';
import { loadSettings, saveSettings } from './settings.ts';

export interface AppOptions {
  webDist?: string;
  logger?: boolean;
  /** Replaces OS integration in tests. */
  openPath?: (p: string) => void;
}

const MAX_RIDES = 5;

/** Language of the app that made the request (header sent by the web app), English by default. */
function langOf(req: { headers: Record<string, unknown> }): Lang {
  const h = req.headers['x-telemesync-lang'];
  return isLang(h) ? h : 'en';
}

export async function buildApp(opts: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 300 * 1024 * 1024 });
  const rides = new Map<string, { ride: RideData; fileName: string }>();
  const jobs = new JobManager();
  const open = opts.openPath ?? openPath;
  let rideCounter = 0;
  /** Output directories used by render jobs (allowed for open-folder). */
  const outputRoots = new Set<string>();

  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));

  app.get('/api/health', async () => ({ ok: true, concurrency: jobs.concurrency }));

  app.get('/api/settings', async () => loadSettings());
  app.put<{ Body: { outputDir?: string } }>('/api/settings', async (req, reply) => {
    const cur = await loadSettings();
    const outputDir = req.body?.outputDir?.trim();
    if (outputDir !== undefined) {
      if (!isAbsolute(outputDir)) return reply.code(400).send({ error: tr(langOf(req), 'srv.outputAbsolute') });
      cur.outputDir = outputDir;
    }
    await saveSettings(cur);
    return cur;
  });

  /** Upload a FIT/GPX file (raw body). The server keeps the parsed ride for rendering. */
  app.post<{ Querystring: { name?: string } }>('/api/telemetry', async (req, reply) => {
    const body = req.body as Buffer;
    const name = req.query.name ?? 'telemetry';
    if (!Buffer.isBuffer(body) || body.length === 0) return reply.code(400).send({ error: tr(langOf(req), 'srv.emptyFile') });
    try {
      const ride = buildRide(parseTelemetryFile(name, body));
      const id = `ride${++rideCounter}`;
      rides.set(id, { ride, fileName: name });
      while (rides.size > MAX_RIDES) rides.delete(rides.keys().next().value!);
      return { id, startTime: ride.startTime, endTime: ride.endTime, available: [...ride.available], totals: ride.totals };
    } catch (e) {
      return reply.code(400).send({ error: errorText(e, langOf(req)) });
    }
  });

  app.post<{ Body: Omit<RenderRequest, 'outputDir' | 'separate' | 'composite' | 'layout' | 'compositeShortSide' | 'maxFps' | 'language'> & Partial<Pick<RenderRequest, 'separate' | 'composite' | 'layout' | 'compositeShortSide' | 'maxFps' | 'language'>> & { rideId: string; outputDir?: string } }>('/api/render', async (req, reply) => {
    const b = req.body;
    const lang = isLang(b?.language) ? b.language : langOf(req);
    const entry = rides.get(b?.rideId);
    if (!entry) return reply.code(404).send({ error: tr(lang, 'srv.rideMissing') });
    if (!Array.isArray(b.clips) || b.clips.length === 0) return reply.code(400).send({ error: tr(lang, 'srv.noClips') });
    if (!Array.isArray(b.overlays) || b.overlays.length === 0) return reply.code(400).send({ error: tr(lang, 'srv.noOverlays') });
    if (b.separate === false && b.composite !== true) return reply.code(400).send({ error: tr(lang, 'srv.noOutput') });
    for (const id of b.overlays) {
      try {
        if (!entry.ride.available.has(getOverlay(id as OverlayId).requires)) {
          return reply.code(400).send({ error: tr(lang, 'srv.noMetric', { id }) });
        }
      } catch (e) {
        return reply.code(400).send({ error: (e as Error).message });
      }
    }
    for (const c of b.clips) {
      if (!(c.durationMs > 0) || !(c.fps?.num > 0) || !(c.fps?.den > 0) || !Number.isFinite(c.startUtcMs)) {
        return reply.code(400).send({ error: tr(lang, 'srv.badClip', { file: c.fileName }) });
      }
    }
    const outputDir = b.outputDir?.trim() || (await loadSettings()).outputDir;
    await mkdir(outputDir, { recursive: true });
    outputRoots.add(resolve(outputDir));
    const job = jobs.start(entry.ride, {
      rideName: b.rideName || 'ride',
      clips: b.clips,
      overlays: b.overlays,
      style: { ...DEFAULT_STYLE, ...b.style, units: { ...DEFAULT_STYLE.units, ...b.style?.units } },
      format: isOutputFormat(b.format) ? b.format : 'prores',
      outputDir,
      separate: b.separate !== false,
      composite: b.composite === true,
      layout: b.layout ?? {},
      compositeShortSide: [720, 1080, 1440, 2160].includes(Number(b.compositeShortSide)) ? Number(b.compositeShortSide) : 1080,
      maxFps: Number(b.maxFps) === 30 ? 30 : 0,
      language: lang,
    });
    return job.snapshot();
  });

  app.get<{ Params: { id: string } }>('/api/jobs/:id', async (req, reply) => {
    const job = jobs.get(req.params.id);
    if (!job) return reply.code(404).send({ error: tr(langOf(req), 'srv.jobMissing') });
    return job.snapshot();
  });

  /** Server-sent events with job progress (throttled). */
  app.get<{ Params: { id: string } }>('/api/jobs/:id/events', (req, reply) => {
    const job = jobs.get(req.params.id);
    if (!job) {
      reply.code(404).send({ error: tr(langOf(req), 'srv.jobMissing') });
      return;
    }
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const send = () => res.write(`data: ${JSON.stringify(job.snapshot())}\n\n`);
    let timer: NodeJS.Timeout | undefined;
    const onUpdate = () => {
      if (!timer) timer = setTimeout(() => ((timer = undefined), send()), 200);
    };
    const onEnd = () => {
      clearTimeout(timer);
      send();
      res.end();
      cleanup();
    };
    const cleanup = () => {
      job.off('update', onUpdate);
      job.off('end', onEnd);
    };
    send();
    if (job.status !== 'running') {
      res.end();
      return;
    }
    job.on('update', onUpdate);
    job.on('end', onEnd);
    req.raw.on('close', () => {
      clearTimeout(timer);
      cleanup();
    });
  });

  app.post<{ Params: { id: string } }>('/api/jobs/:id/cancel', async (req, reply) => {
    const job = jobs.get(req.params.id);
    if (!job) return reply.code(404).send({ error: tr(langOf(req), 'srv.jobMissing') });
    job.cancel();
    return { ok: true };
  });

  /** Opens a folder in the OS explorer. Only folders inside an output directory are allowed. */
  app.post<{ Body: { path?: string } }>('/api/open-folder', async (req, reply) => {
    const settings = await loadSettings();
    const target = resolve(req.body?.path || settings.outputDir);
    const roots = [resolve(settings.outputDir), ...outputRoots];
    const inside = roots.some((root) => {
      const rel = relative(root, target);
      return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
    });
    if (!inside) return reply.code(403).send({ error: tr(langOf(req), 'srv.onlyOutput') });
    await mkdir(target, { recursive: true });
    open(target);
    return { ok: true, path: target };
  });

  const webDist = opts.webDist ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'web', 'dist');
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: tr(langOf(req), 'srv.notFound') });
      return reply.sendFile('index.html');
    });
  }
  return app;
}
