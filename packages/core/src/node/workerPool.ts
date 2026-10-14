import { Worker } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
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

function tsLoaderArgs(): string[] {
  // Source files are TypeScript; make sure the worker can load them (tsx), unless already compiled.
  if (import.meta.url.endsWith('.js')) return [];
  const req = createRequire(import.meta.url);
  return ['--import', pathToFileURL(req.resolve('tsx/esm')).href];
}

/** Runs one overlay render in a worker thread. */
export function renderInWorker(job: WorkerJob, opts: { signal?: AbortSignal; onProgress?: (f: number) => void } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./renderWorker.ts', import.meta.url), { workerData: job, execArgv: tsLoaderArgs() });
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
      else if (m.type === 'aborted') finish(new DOMException('Cancelado', 'AbortError'));
      else if (m.type === 'error') finish(new Error(m.message));
    });
    worker.on('error', (e) => finish(e));
    worker.on('exit', (code) => finish(code === 0 ? undefined : new Error(`O processo de renderização terminou (código ${code}).`)));
  });
}
