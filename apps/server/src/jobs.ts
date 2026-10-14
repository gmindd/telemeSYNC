import { EventEmitter } from 'node:events';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import {
  cappedFps,
  compositeSize,
  outputExtension,
  resolveLayout,
  type GadgetLayout,
  getOverlay,
  OVERLAY_FILE_SLUG,
  type Fps,
  type OverlayId,
  type OverlayStyle,
  type RideData,
} from '@telemesync/core';
import { renderInWorker, type OutputFormat } from '@telemesync/core/node';

export interface RenderClipInput {
  id: string;
  fileName: string;
  startUtcMs: number;
  durationMs: number;
  fps: Fps;
  frameCount?: number;
  width?: number;
  height?: number;
}

export interface RenderRequest {
  rideName: string;
  clips: RenderClipInput[];
  overlays: OverlayId[];
  style: OverlayStyle;
  format: OutputFormat;
  outputDir: string;
  /** One file per gadget (to position manually in the editor). */
  separate: boolean;
  /** One file per clip with every gadget in its dragged position. */
  composite: boolean;
  layout: GadgetLayout;
  /** Short side of the composite in px (1080 = Full HD). */
  compositeShortSide: number;
  /** Cap on the overlay frame rate (0 = same as the clip). */
  maxFps: number;
}

export type TaskStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';

export const COMPOSITE_SLUG = 'composicao';

export interface TaskState {
  clipId: string;
  overlay: OverlayId | 'composite';
  outPath: string;
  status: TaskStatus;
  progress: number;
  error?: string;
}

export interface JobSnapshot {
  id: string;
  status: 'running' | 'done' | 'cancelled' | 'error';
  outputDir: string;
  rideDir: string;
  tasks: TaskState[];
  progress: number;
  startedAt: number;
  finishedAt?: number;
}

/** Windows-safe file/folder name. */
export function safeName(s: string): string {
  const cleaned = s
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();
  return cleaned.slice(0, 120) || 'sem-nome';
}

export function clipBaseName(fileName: string): string {
  return safeName(fileName.replace(/\.[^.]+$/, ''));
}

export class Job extends EventEmitter {
  readonly id: string;
  readonly tasks: TaskState[];
  readonly rideDir: string;
  status: JobSnapshot['status'] = 'running';
  private abort = new AbortController();
  private startedAt = Date.now();
  private finishedAt?: number;

  constructor(id: string, private ride: RideData, private req: RenderRequest, private concurrency: number) {
    super();
    this.id = id;
    this.rideDir = join(req.outputDir, safeName(req.rideName));
    this.tasks = [];
    for (const clip of req.clips) {
      const base = clipBaseName(clip.fileName);
      const outputs: (OverlayId | 'composite')[] = [...(req.composite ? ['composite' as const] : []), ...(req.separate ? req.overlays : [])];
      for (const overlay of outputs) {
        const name = `${base}_${overlay === 'composite' ? COMPOSITE_SLUG : OVERLAY_FILE_SLUG[overlay]}`;
        this.tasks.push({
          clipId: clip.id,
          overlay,
          outPath: join(this.rideDir, base, `${name}${outputExtension(req.format)}`),
          status: 'queued',
          progress: 0,
        });
      }
    }
  }

  snapshot(): JobSnapshot {
    const progress = this.tasks.length ? this.tasks.reduce((a, t) => a + t.progress, 0) / this.tasks.length : 1;
    return {
      id: this.id,
      status: this.status,
      outputDir: this.req.outputDir,
      rideDir: this.rideDir,
      tasks: this.tasks,
      progress,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
    };
  }

  cancel() {
    this.abort.abort();
  }

  async run(): Promise<void> {
    const clipsById = new Map(this.req.clips.map((c) => [c.id, c]));
    let next = 0;
    const worker = async () => {
      while (next < this.tasks.length) {
        const task = this.tasks[next++];
        if (this.abort.signal.aborted) {
          task.status = 'cancelled';
          continue;
        }
        const clip = clipsById.get(task.clipId)!;
        task.status = 'running';
        this.emit('update');
        try {
          let composite = {};
          if (task.overlay === 'composite') {
            const size = compositeSize(clip.width, clip.height, this.req.compositeShortSide);
            composite = {
              overlays: this.req.overlays,
              placements: resolveLayout(this.req.overlays, this.req.layout, size.width / size.height, this.req.style),
              compositeWidth: size.width,
              compositeHeight: size.height,
            };
          } else getOverlay(task.overlay); // validates the id
          const rate = cappedFps(clip.fps, clip.frameCount, this.req.maxFps);
          await renderInWorker(
            {
              ride: this.ride,
              overlay: task.overlay,
              ...composite,
              style: this.req.style,
              clipStart: clip.startUtcMs,
              clipEnd: clip.startUtcMs + clip.durationMs,
              durationMs: clip.durationMs,
              fps: rate.fps,
              frames: rate.frames,
              outPath: task.outPath,
              format: this.req.format,
            },
            {
              signal: this.abort.signal,
              onProgress: (f) => {
                task.progress = f;
                this.emit('update');
              },
            },
          );
          task.status = 'done';
          task.progress = 1;
        } catch (e) {
          if (this.abort.signal.aborted) task.status = 'cancelled';
          else {
            task.status = 'error';
            task.error = e instanceof Error ? e.message : String(e);
          }
        }
        this.emit('update');
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.concurrency, this.tasks.length) }, worker));
    this.finishedAt = Date.now();
    this.status = this.abort.signal.aborted ? 'cancelled' : this.tasks.some((t) => t.status === 'error') ? 'error' : 'done';
    this.emit('update');
    this.emit('end');
  }
}

export class JobManager {
  private jobs = new Map<string, Job>();
  private counter = 0;
  readonly concurrency = Math.max(1, availableParallelism() - 1);

  start(ride: RideData, req: RenderRequest): Job {
    const id = `job${Date.now().toString(36)}${++this.counter}`;
    const job = new Job(id, ride, req, this.concurrency);
    this.jobs.set(id, job);
    void job.run();
    return job;
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }
}
