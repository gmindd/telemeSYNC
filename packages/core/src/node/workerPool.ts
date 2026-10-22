import { Worker } from 'node:worker_threads';
import type { Fps } from '../media/types.ts';
import type { OverlayId, OverlayStyle } from '../overlays/types.ts';
import type { GadgetPlacement } from '../overlays/layout.ts';
import type { RideData } from '../telemetry/ride.ts';
import type { OutputFormat } from './render.ts';

export interface WorkerJob {
  ride: RideData;
  /** A single gadget, or 'composite' = all `overlays` positioned with `placements` in one frame. */
  overlay: OverlayId | 'composite';
  overlays?: OverlayId[];
  placements?: Record<OverlayId, GadgetPlacement>;
  compositeWidth?: number;
  compositeHeight?: number;
  style: OverlayStyle;
  clipStart: number;
  clipEnd: number;
  durationMs: number;
  fps: Fps;
  frames?: number;
  outPath: string;
  format: OutputFormat;
}

/** Worker entry: the compiled worker, or a JS boot file that loads the TypeScript worker through tsx. */
function workerEntry(): URL {
  return new URL(import.meta.url.endsWith('.js') ? './renderWorker.js' : './renderWorkerBoot.mjs', import.meta.url);
}

/** Runs one overlay render in a worker thread. */
export function renderInWorker(job: WorkerJob, opts: { signal?: AbortSignal; onProgress?: (f: number) => void } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerEntry(), { workerData: job });
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      opts.signal?.removeEventListener('abort', onAbort);
      void worker.terminate();
      if (err) reject(err);
      else resolve();
    };
    const onAbort = () => worker.postMessage('abort');
    if (opts.signal?.aborted) onAbort();
    opts.signal?.addEventListener('abort', onAbort);
    worker.on('message', (m: { type: string; value?: number; message?: string }) => {
      if (m.type === 'progress') opts.onProgress?.(m.value!);
      else if (m.type === 'done') finish();
      else if (m.type === 'aborted') finish(new DOMException('Cancelled', 'AbortError'));
      else if (m.type === 'error') finish(new Error(m.message));
    });
    worker.on('error', (e) => finish(e));
    worker.on('exit', (code) => finish(code === 0 ? undefined : new Error(`The render process stopped (code ${code}).`)));
  });
}
