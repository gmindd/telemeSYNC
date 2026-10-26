import {
  cappedFps,
  clipBaseName,
  compositeSize,
  DEFAULT_STYLE,
  getOverlay,
  outputFileName,
  resolveLayout,
  safeName,
  syncReport,
  tr,
  type ClipSyncInfo,
  type OutputFormat,
  type RideData,
} from '@telemesync/core';
import { APP_INFO } from '../../config.ts';
import { t } from '../../i18n/index.tsx';
import type { Backend, JobSnapshot, RenderBody, TaskState } from '../api.ts';
import { ANDROID_OUTPUT_ROOTS, mimeOf, normalizeOutputDir, type AndroidBridge } from './android.ts';
import { localFormats } from './formats.ts';
import type { LocalTaskJob, ToMain, ToWorker } from './protocol.ts';

const OUTPUT_KEY = 'telemesync.outputDir';
const MAX_RIDES = 5;

/** Bridge result: '' = ok, anything else is the error. */
function check(result: string) {
  if (result) throw new Error(result);
}

/** Renders in this app (Android): a worker per export, files written through the Android bridge. */
export function createLocalApi(bridge: AndroidBridge): Backend {
  const rides = new Map<string, RideData>();
  const jobs = new Map<string, LocalJob>();
  let counter = 0;
  let formats: Promise<OutputFormat[]> | undefined;

  const outputDir = () => {
    try {
      const v = localStorage.getItem(OUTPUT_KEY);
      if (v && normalizeOutputDir(v)) return v;
    } catch {
      /* ignore */
    }
    return bridge.defaultOutputDir();
  };
  const validDir = (dir: string) => {
    const clean = normalizeOutputDir(dir);
    if (!clean) throw new Error(t('android.outputRoots', { roots: ANDROID_OUTPUT_ROOTS.join(', ') }));
    return clean;
  };

  return {
    local: true,
    async uploadTelemetry(_file, ride) {
      const id = `ride${++counter}`;
      rides.set(id, ride);
      while (rides.size > MAX_RIDES) rides.delete(rides.keys().next().value!);
      return { id };
    },
    async getSettings() {
      return { outputDir: outputDir() };
    },
    async saveSettings(dir) {
      const clean = validDir(dir);
      try {
        localStorage.setItem(OUTPUT_KEY, clean);
      } catch {
        /* ignore */
      }
      return { outputDir: clean };
    },
    async startRender(body) {
      const ride = rides.get(body.rideId);
      if (!ride) throw new Error(tr(body.language, 'srv.rideMissing'));
      if (!body.clips.length) throw new Error(tr(body.language, 'srv.noClips'));
      if (!body.overlays.length) throw new Error(tr(body.language, 'srv.noOverlays'));
      if (!body.separate && !body.composite) throw new Error(tr(body.language, 'srv.noOutput'));
      if (!(await this.formats()).includes(body.format)) throw new Error(t('android.formatUnavailable'));
      const id = `job${Date.now().toString(36)}${++counter}`;
      const job = new LocalJob(id, ride, body, validDir(body.outputDir || outputDir()), bridge);
      jobs.set(id, job);
      void job.run();
      return job.snapshot();
    },
    async cancel(jobId) {
      jobs.get(jobId)?.cancel();
    },
    async openFolder(path) {
      const dir = path || outputDir();
      if (!bridge.openFolder(dir)) throw new Error(t('android.openFolderFailed', { path: dir }));
    },
    watchJob(jobId, onSnapshot) {
      const job = jobs.get(jobId);
      if (!job) return () => undefined;
      onSnapshot(job.snapshot());
      return job.subscribe(onSnapshot);
    },
    formats() {
      return (formats ??= localFormats());
    },
    async saveProject(fileName, text) {
      const path = `${outputDir()}/${fileName}`;
      check(bridge.writeText(path, text, mimeOf(path)));
      return path;
    },
  };
}

/** Exports at once: each worker holds full frames (a 4K composite needs ~150 MB), so phones get few. */
function concurrency(): number {
  return Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
}

class LocalJob {
  readonly tasks: TaskState[] = [];
  readonly rideDir: string;
  private status: JobSnapshot['status'] = 'running';
  private startedAt = Date.now();
  private finishedAt?: number;
  private aborted = false;
  private workers = new Set<Worker>();
  private listeners = new Set<(s: JobSnapshot) => void>();
  private timer?: ReturnType<typeof setTimeout>;

  constructor(
    readonly id: string,
    private ride: RideData,
    private req: RenderBody,
    private outputDir: string,
    private bridge: AndroidBridge,
  ) {
    this.rideDir = `${outputDir}/${safeName(req.rideName || 'ride', req.language)}`;
    for (const clip of req.clips) {
      const base = clipBaseName(clip.fileName, req.language);
      const outputs = [...(req.composite ? ['composite' as const] : []), ...(req.separate ? req.overlays : [])];
      for (const overlay of outputs) {
        this.tasks.push({
          clipId: clip.id,
          overlay,
          outPath: `${this.rideDir}/${base}/${outputFileName(base, overlay, req.format, req.language)}`,
          status: 'queued',
          progress: 0,
        });
      }
    }
  }

  snapshot(): JobSnapshot {
    const progress = this.tasks.length ? this.tasks.reduce((a, k) => a + k.progress, 0) / this.tasks.length : 1;
    return {
      id: this.id,
      status: this.status,
      outputDir: this.outputDir,
      rideDir: this.rideDir,
      tasks: this.tasks.map((k) => ({ ...k })),
      progress,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
    };
  }

  subscribe(fn: (s: JobSnapshot) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Progress at most every 200 ms; status changes right away. */
  private update(now = false) {
    const send = () => {
      this.timer = undefined;
      const s = this.snapshot();
      this.listeners.forEach((fn) => fn(s));
    };
    if (now) {
      clearTimeout(this.timer);
      send();
    } else this.timer ??= setTimeout(send, 200);
  }

  cancel() {
    this.aborted = true;
    for (const w of this.workers) w.postMessage({ type: 'abort' } satisfies ToWorker);
  }

  private writeSyncReport() {
    const { req } = this;
    try {
      const text = syncReport({
        rideName: req.rideName,
        ride: this.ride,
        timeZone: req.style.timeZone,
        exportedAt: Date.now(),
        version: APP_INFO.version,
        lang: req.language,
        clips: req.clips.map(
          (c): ClipSyncInfo =>
            c.sync ?? { fileName: c.fileName, camera: '—', timeZone: req.style.timeZone, source: '—', cameraOffsetMs: 0, clipOffsetMs: 0, startUtcMs: c.startUtcMs, durationMs: c.durationMs, fps: c.fps, warnings: [] },
        ),
      });
      const path = `${this.rideDir}/${tr(req.language, 'file.report')}`;
      this.bridge.writeText(path, text.replace(/\n/g, '\r\n'), mimeOf(path));
    } catch {
      /* the report is a help, never a reason to fail the export */
    }
  }

  async run(): Promise<void> {
    this.bridge.keepAwake(true);
    this.writeSyncReport();
    let next = 0;
    const runner = async () => {
      while (next < this.tasks.length) {
        const task = this.tasks[next++];
        if (this.aborted) {
          task.status = 'cancelled';
          continue;
        }
        task.status = 'running';
        this.update(true);
        try {
          await this.renderTask(task);
          task.status = 'done';
          task.progress = 1;
        } catch (e) {
          if (this.aborted) task.status = 'cancelled';
          else {
            task.status = 'error';
            task.error = e instanceof Error ? e.message : String(e);
          }
        }
        this.update(true);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency(), this.tasks.length) }, runner));
    this.bridge.keepAwake(false);
    this.finishedAt = Date.now();
    this.status = this.aborted ? 'cancelled' : this.tasks.some((k) => k.status === 'error') ? 'error' : 'done';
    this.update(true);
  }

  private taskJob(task: TaskState): LocalTaskJob {
    const { req } = this;
    const clip = req.clips.find((c) => c.id === task.clipId)!;
    const style = { ...DEFAULT_STYLE, ...req.style, units: { ...DEFAULT_STYLE.units, ...req.style?.units } };
    let composite = {};
    if (task.overlay === 'composite') {
      const size = compositeSize(clip.width, clip.height, req.compositeShortSide);
      composite = {
        overlays: req.overlays,
        placements: resolveLayout(req.overlays, req.layout, size.width / size.height, style),
        compositeWidth: size.width,
        compositeHeight: size.height,
      };
    } else getOverlay(task.overlay); // validates the id
    const rate = cappedFps(clip.fps, clip.frameCount, req.maxFps);
    return {
      ride: this.ride,
      overlay: task.overlay,
      ...composite,
      style,
      clipStart: clip.startUtcMs,
      clipEnd: clip.startUtcMs + clip.durationMs,
      durationMs: clip.durationMs,
      fps: rate.fps,
      frames: rate.frames,
      format: req.format,
    };
  }

  /** One export in its own worker; the bytes it sends are written here, through the bridge. */
  private renderTask(task: TaskState): Promise<void> {
    const job = this.taskJob(task);
    const bridge = this.bridge;
    const sequence = job.format === 'png';
    let fileId: number | undefined;
    if (!sequence) {
      const res = JSON.parse(bridge.createFile(task.outPath, mimeOf(task.outPath))) as { id?: number; error?: string };
      if (res.error !== undefined || res.id === undefined) return Promise.reject(new Error(res.error ?? 'createFile'));
      fileId = res.id;
    }
    const worker = new Worker(new URL('./renderWorker.ts', import.meta.url), { type: 'module' });
    this.workers.add(worker);
    if (this.aborted) worker.postMessage({ type: 'abort' } satisfies ToWorker);

    return new Promise<void>((resolve, reject) => {
      const finish = (err?: Error) => {
        worker.terminate();
        this.workers.delete(worker);
        if (fileId !== undefined) {
          if (err) bridge.abort(fileId);
          else {
            const closed = bridge.close(fileId);
            if (closed) err = new Error(closed);
          }
        }
        if (err) reject(err);
        else resolve();
      };
      worker.onmessage = (ev: MessageEvent<ToMain>) => {
        const m = ev.data;
        switch (m.type) {
          case 'write':
          case 'writeAt':
          case 'file': {
            let error = '';
            try {
              if (m.type === 'write') error = bridge.write(fileId!, m.b64);
              else if (m.type === 'writeAt') error = bridge.writeAt(fileId!, m.offset, m.b64);
              else {
                const path = `${task.outPath}/${m.name}`;
                const res = JSON.parse(bridge.createFile(path, mimeOf(path))) as { id?: number; error?: string };
                if (res.error !== undefined || res.id === undefined) error = res.error ?? 'createFile';
                else {
                  error = bridge.write(res.id, m.b64);
                  if (error) bridge.abort(res.id);
                  else error = bridge.close(res.id);
                }
              }
            } catch (e) {
              error = e instanceof Error ? e.message : String(e);
            }
            // A failed write (storage full…) rejects the worker's request: it stops and reports the error.
            worker.postMessage({ type: 'ack', seq: m.seq, error: error || undefined } satisfies ToWorker);
            break;
          }
          case 'progress':
            task.progress = m.value;
            this.update();
            break;
          case 'done':
            finish();
            break;
          case 'aborted':
            finish(new DOMException('Cancelled', 'AbortError'));
            break;
          case 'error':
            finish(new Error(m.message));
            break;
        }
      };
      worker.onerror = (e) => finish(new Error(e.message || 'Worker error'));
      worker.postMessage({ type: 'start', job } satisfies ToWorker);
    });
  }
}
