import { OUTPUT_FORMATS, type ClipSyncInfo, type Fps, type GadgetLayout, type Lang, type OutputFormat, type OverlayId, type OverlayStyle, type RideData } from '@telemesync/core';
import { currentLang, t } from '../i18n/index.tsx';
import { android } from './local/android.ts';
import { createLocalApi } from './local/localApi.ts';

/** Every request says the app language, so the server answers errors in it. */
function headers(extra?: Record<string, string>): Record<string, string> {
  return { 'x-telemesync-lang': currentLang(), ...extra };
}

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
  if (!res.ok) throw new Error((body as { error?: string }).error ?? t('api.error', { status: res.status }));
  return body as T;
}

export interface RenderBody {
  rideId: string;
  rideName: string;
  clips: { id: string; fileName: string; startUtcMs: number; durationMs: number; fps: Fps; frameCount?: number; width?: number; height?: number; sync?: ClipSyncInfo }[];
  overlays: OverlayId[];
  style: OverlayStyle;
  format: OutputFormat;
  maxFps: number;
  outputDir: string;
  separate: boolean;
  composite: boolean;
  layout: GadgetLayout;
  compositeShortSide: number;
  language: Lang;
}

/** Where exports are rendered: the local server (computer) or this app itself (Android). */
export interface Backend {
  /** True when this app renders the exports itself, without the server. */
  local: boolean;
  uploadTelemetry(file: File, ride: RideData): Promise<{ id: string }>;
  getSettings(): Promise<{ outputDir: string }>;
  saveSettings(outputDir: string): Promise<{ outputDir: string }>;
  startRender(body: RenderBody): Promise<JobSnapshot>;
  cancel(jobId: string): Promise<void>;
  openFolder(path?: string): Promise<void>;
  watchJob(jobId: string, onSnapshot: (s: JobSnapshot) => void): () => void;
  /** Output formats this backend can write. */
  formats(): Promise<OutputFormat[]>;
  /** Saves a project file; returns where, or undefined when the browser downloads it. */
  saveProject(fileName: string, text: string): Promise<string | undefined>;
}

const serverApi: Backend = {
  local: false,
  async uploadTelemetry(file) {
    const res = await fetch(`/api/telemetry?name=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: headers({ 'content-type': 'application/octet-stream' }),
      body: file,
    });
    return json(res);
  },
  async getSettings() {
    return json(await fetch('/api/settings', { headers: headers() }));
  },
  async saveSettings(outputDir) {
    return json(await fetch('/api/settings', { method: 'PUT', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify({ outputDir }) }));
  },
  async startRender(body) {
    return json(await fetch('/api/render', { method: 'POST', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify(body) }));
  },
  async cancel(jobId) {
    await json(await fetch(`/api/jobs/${jobId}/cancel`, { method: 'POST', headers: headers() }));
  },
  async openFolder(path) {
    await json(await fetch('/api/open-folder', { method: 'POST', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify({ path }) }));
  },
  watchJob(jobId, onSnapshot) {
    const es = new EventSource(`/api/jobs/${jobId}/events`);
    es.onmessage = (ev) => {
      const s = JSON.parse(ev.data) as JobSnapshot;
      onSnapshot(s);
      if (s.status !== 'running') es.close();
    };
    es.onerror = () => es.close();
    return () => es.close();
  },
  async formats() {
    return OUTPUT_FORMATS.map((f) => f.id);
  },
  async saveProject(fileName, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return undefined;
  },
};

export const api: Backend = android ? createLocalApi(android) : serverApi;
