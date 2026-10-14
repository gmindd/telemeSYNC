/** Worker-thread entry: renders one overlay so several renders run truly in parallel. */
import { parentPort, workerData } from 'node:worker_threads';
import { getOverlay } from '../overlays/registry.ts';
import { renderOverlay } from './render.ts';
import type { WorkerJob } from './workerPool.ts';

const job = workerData as WorkerJob;
const abort = new AbortController();
parentPort!.on('message', (m) => {
  if (m === 'abort') abort.abort();
});

renderOverlay({
  def: getOverlay(job.overlay),
  style: job.style,
  octx: { ride: job.ride, clipStart: job.clipStart, clipEnd: job.clipEnd },
  durationMs: job.durationMs,
  fps: job.fps,
  frames: job.frames,
  outPath: job.outPath,
  format: job.format,
  signal: abort.signal,
  onProgress: (f) => parentPort!.postMessage({ type: 'progress', value: f }),
})
  .then((r) => parentPort!.postMessage({ type: 'done', result: r }))
  .catch((e) => parentPort!.postMessage({ type: e?.name === 'AbortError' || abort.signal.aborted ? 'aborted' : 'error', message: e instanceof Error ? e.message : String(e) }));
