import type { Fps, GadgetLayout, OutputFormat, OverlayId, OverlayStyle } from '@telemesync/core';

export interface TaskState {
  clipId: string;
  overlay: OverlayId | 'composite';
  outPath: string;
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled';
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

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Erro ${res.status}`);
  return body as T;
}

export const api = {
  async uploadTelemetry(file: File): Promise<{ id: string }> {
    const res = await fetch(`/api/telemetry?name=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: file,
    });
    return json(res);
  },
  async getSettings(): Promise<{ outputDir: string }> {
    return json(await fetch('/api/settings'));
  },
  async saveSettings(outputDir: string): Promise<{ outputDir: string }> {
    return json(await fetch('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ outputDir }) }));
  },
  async startRender(body: {
    rideId: string;
    rideName: string;
    clips: { id: string; fileName: string; startUtcMs: number; durationMs: number; fps: Fps; frameCount?: number; width?: number; height?: number }[];
    overlays: OverlayId[];
    style: OverlayStyle;
    format: OutputFormat;
    maxFps: number;
    outputDir: string;
    separate: boolean;
    composite: boolean;
    layout: GadgetLayout;
    compositeShortSide: number;
  }): Promise<JobSnapshot> {
    return json(await fetch('/api/render', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  },
  async cancel(jobId: string): Promise<void> {
    await json(await fetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' }));
  },
  async openFolder(path?: string): Promise<void> {
    await json(await fetch('/api/open-folder', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path }) }));
  },
  watchJob(jobId: string, onSnapshot: (s: JobSnapshot) => void): () => void {
    const es = new EventSource(`/api/jobs/${jobId}/events`);
    es.onmessage = (ev) => {
      const s = JSON.parse(ev.data) as JobSnapshot;
      onSnapshot(s);
      if (s.status !== 'running') es.close();
    };
    es.onerror = () => es.close();
    return () => es.close();
  },
};
