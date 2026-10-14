import { create } from 'zustand';
import {
  addClips,
  blobSource,
  buildRide,
  CAMERA_PROFILES,
  DEFAULT_OUTPUT_FORMAT,
  DEFAULT_STYLE,
  defaultCamera,
  effectiveStart,
  getOverlay,
  parseProject,
  parseTelemetryFile,
  PROJECT_VERSION,
  readClipMetadata,
  resolveAll,
  serializeProject,
  type CameraProfileId,
  type GadgetLayout,
  type GadgetPlacement,
  type ClipMetadata,
  type Clip,
  type OverlayId,
  type OutputFormat,
  type OverlayStyle,
  type ProjectFile,
  type RideData,
  type SyncState,
} from '@telemesync/core';
import { api, type JobSnapshot } from './api.ts';

export type Step = 'welcome' | 'telemetry' | 'clips' | 'sync' | 'overlays' | 'render';

export interface Playhead {
  t: number;
  /** Who moved it: the video element, or the user on the timeline/slider. */
  source: 'video' | 'user';
}

interface State {
  step: Step;
  rideFile?: { name: string; size: number };
  ride?: RideData;
  rideId?: string;
  rideError?: string;
  rideLoading: boolean;
  sync: SyncState;
  files: Record<string, File>;
  selected: Record<string, boolean>;
  clipErrors: string[];
  activeClipId?: string;
  playhead?: Playhead;
  overlays: OverlayId[];
  style: OverlayStyle;
  format: OutputFormat;
  /** Cap on the overlay frame rate (0 = same as the clip). */
  maxFps: number;
  outputDir: string;
  rideName: string;
  job?: JobSnapshot;
  renderError?: string;
  /** Gadget positions dragged in the preview (fractions of the frame). */
  layout: GadgetLayout;
  exportSeparate: boolean;
  exportComposite: boolean;
  /** Short side of the composite (1080 = Full HD). */
  compositeShortSide: number;
  notice?: string;
}

interface Actions {
  setStep(s: Step): void;
  loadTelemetry(file: File): Promise<void>;
  addClipFiles(files: File[]): Promise<void>;
  removeClip(id: string): void;
  setActiveClip(id?: string): void;
  setPlayhead(p?: Playhead): void;
  setCameraOffset(cameraId: string, ms: number): void;
  setClipOffset(clipId: string, ms: number): void;
  setManualStart(clipId: string, utcMs: number | undefined): void;
  assignCamera(clipId: string, target: string): void;
  setCameraTimeZone(cameraId: string, tz: string): void;
  setCameraLabel(cameraId: string, label: string): void;
  toggleOverlay(id: OverlayId, on: boolean): void;
  setStyle(p: Partial<OverlayStyle>): void;
  setFormat(f: OutputFormat): void;
  setMaxFps(fps: number): void;
  setOutputDir(d: string): void;
  saveOutputDir(): Promise<void>;
  setRideName(n: string): void;
  toggleSelected(clipId: string, on: boolean): void;
  startRender(): Promise<void>;
  cancelRender(): Promise<void>;
  saveProject(): void;
  openProject(file: File): Promise<void>;
  setPlacement(id: OverlayId, p: GadgetPlacement): void;
  resetLayout(): void;
  setExportOptions(o: Partial<Pick<State, 'exportSeparate' | 'exportComposite' | 'compositeShortSide'>>): void;
  dismissNotice(): void;
  init(): Promise<void>;
}

const STYLE_KEY = 'telemesync.style';
const LAYOUT_KEY = 'telemesync.layout';
const FORMAT_KEY = 'telemesync.format';
const MAX_FPS_KEY = 'telemesync.maxFps';

function loadStored<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null');
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

function loadStoredStyle(): OverlayStyle {
  try {
    const s = JSON.parse(localStorage.getItem(STYLE_KEY) ?? 'null');
    if (s) return { ...DEFAULT_STYLE, ...s, units: { ...DEFAULT_STYLE.units, ...s.units } };
  } catch {
    /* ignore */
  }
  return DEFAULT_STYLE;
}

function rideNameFrom(ride: RideData, fileName: string): string {
  const d = new Date(ride.startTime);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${date} ${ride.name && !/\.(fit|gpx)$/i.test(ride.name) ? ride.name : fileName.replace(/\.[^.]+$/, '')}`;
}

export const useApp = create<State & Actions>((set, get) => ({
  step: 'welcome',
  rideLoading: false,
  sync: { cameras: [], clips: [] },
  files: {},
  selected: {},
  clipErrors: [],
  overlays: ['speed', 'grade', 'map', 'elevationProfile'],
  style: loadStoredStyle(),
  format: loadStored<OutputFormat>(FORMAT_KEY, DEFAULT_OUTPUT_FORMAT),
  maxFps: loadStored<number>(MAX_FPS_KEY, 0),
  outputDir: '',
  rideName: 'volta',
  layout: loadStored<GadgetLayout>(LAYOUT_KEY, {}),
  exportSeparate: true,
  exportComposite: false,
  compositeShortSide: 1080,

  setStep: (step) => set({ step }),

  async init() {
    try {
      const s = await api.getSettings();
      set({ outputDir: s.outputDir });
    } catch {
      set({ notice: 'Não foi possível contactar o servidor local. Arrancou a app com "npm start"?' });
    }
  },

  async loadTelemetry(file) {
    set({ rideLoading: true, rideError: undefined });
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const ride = buildRide(parseTelemetryFile(file.name, buf));
      const { id } = await api.uploadTelemetry(file);
      const sync = resolveAll(get().sync, ride.startTime);
      // Keep only overlays that this ride supports.
      const overlays = get().overlays.filter((o) => ride.available.has(getOverlay(o).requires));
      set({
        ride,
        rideId: id,
        rideFile: { name: file.name, size: file.size },
        rideName: rideNameFrom(ride, file.name),
        sync,
        overlays: overlays.length ? overlays : (['speed'] as OverlayId[]).filter((o) => ride.available.has(getOverlay(o).requires)),
        rideLoading: false,
      });
    } catch (e) {
      set({ rideLoading: false, rideError: e instanceof Error ? e.message : String(e) });
    }
  },

  async addClipFiles(files) {
    const errors: string[] = [];
    const st = get();
    const newMetas: { file: File; meta: ClipMetadata }[] = [];
    const newFiles: Record<string, File> = { ...st.files };
    const pending: File[] = [];
    for (const f of files) {
      // Re-attach a file to a clip restored from a project (same name and size).
      const existing = st.sync.clips.find((c) => c.meta.fileName === f.name && c.meta.sizeBytes === f.size);
      if (existing) {
        newFiles[existing.id] = f;
        continue;
      }
      pending.push(f);
    }
    for (const f of pending) {
      try {
        newMetas.push({ file: f, meta: await readClipMetadata(blobSource(f), f.name, f.lastModified) });
      } catch (e) {
        errors.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    const before = new Set(st.sync.clips.map((c) => c.id));
    const sync = addClips(st.sync, newMetas.map((m) => m.meta), st.ride?.startTime);
    const selected = { ...st.selected };
    const added = sync.clips.filter((c) => !before.has(c.id));
    added.forEach((c, i) => {
      newFiles[c.id] = newMetas[i].file;
      selected[c.id] = true;
    });
    // Keep clips sorted by start.
    const cams = new Map(sync.cameras.map((c) => [c.id, c]));
    sync.clips.sort((a, b) => (effectiveStart(a, cams.get(a.cameraId)!) ?? Infinity) - (effectiveStart(b, cams.get(b.cameraId)!) ?? Infinity));
    set({ sync, files: newFiles, selected, clipErrors: errors, activeClipId: st.activeClipId ?? added[0]?.id });
  },

  removeClip(id) {
    const { sync, files, selected } = get();
    const clips = sync.clips.filter((c) => c.id !== id);
    const cameras = sync.cameras.filter((cam) => clips.some((c) => c.cameraId === cam.id));
    const f = { ...files };
    delete f[id];
    const s = { ...selected };
    delete s[id];
    set({ sync: resolveAll({ cameras, clips }, get().ride?.startTime), files: f, selected: s, activeClipId: get().activeClipId === id ? undefined : get().activeClipId });
  },

  setActiveClip: (activeClipId) => set({ activeClipId }),
  setPlayhead: (playhead) => set({ playhead }),

  setCameraOffset(cameraId, ms) {
    const sync = get().sync;
    set({ sync: { ...sync, cameras: sync.cameras.map((c) => (c.id === cameraId ? { ...c, offsetMs: Math.round(ms) } : c)) } });
  },

  setClipOffset(clipId, ms) {
    const sync = get().sync;
    set({ sync: { ...sync, clips: sync.clips.map((c) => (c.id === clipId ? { ...c, clipOffsetMs: Math.round(ms) } : c)) } });
  },

  setManualStart(clipId, utcMs) {
    const sync = get().sync;
    const clips = sync.clips.map((c) => (c.id === clipId ? { ...c, manualStartUtcMs: utcMs } : c));
    set({ sync: resolveAll({ ...sync, clips }, get().ride?.startTime) });
  },

  /** target = existing camera id, or "new:<profile>" to create another camera. */
  assignCamera(clipId, target) {
    const sync = get().sync;
    let cameras = [...sync.cameras];
    let camId = target;
    if (target.startsWith('new:')) {
      const profile = target.slice(4) as CameraProfileId;
      let n = 1;
      while (cameras.some((c) => c.id === (n === 1 ? profile : `${profile}-${n}`))) n++;
      const cam = defaultCamera(profile);
      cam.id = n === 1 ? profile : `${profile}-${n}`;
      cam.label = n === 1 ? CAMERA_PROFILES[profile].label : `${CAMERA_PROFILES[profile].label} ${n}`;
      cameras.push(cam);
      camId = cam.id;
    }
    const clips = sync.clips.map((c) => (c.id === clipId ? { ...c, cameraId: camId } : c));
    cameras = cameras.filter((cam) => clips.some((c) => c.cameraId === cam.id));
    set({ sync: resolveAll({ cameras, clips }, get().ride?.startTime) });
  },

  setCameraTimeZone(cameraId, tz) {
    const sync = get().sync;
    const cameras = sync.cameras.map((c) => (c.id === cameraId ? { ...c, timeZone: tz } : c));
    set({ sync: resolveAll({ ...sync, cameras }, get().ride?.startTime) });
  },

  setCameraLabel(cameraId, label) {
    const sync = get().sync;
    set({ sync: { ...sync, cameras: sync.cameras.map((c) => (c.id === cameraId ? { ...c, label } : c)) } });
  },

  toggleOverlay(id, on) {
    const cur = get().overlays.filter((o) => o !== id);
    set({ overlays: on ? [...cur, id] : cur });
  },

  setStyle(p) {
    const style = { ...get().style, ...p };
    set({ style });
    try {
      localStorage.setItem(STYLE_KEY, JSON.stringify(style));
    } catch {
      /* ignore */
    }
  },

  setFormat(format) {
    set({ format });
    store(FORMAT_KEY, format);
  },
  setMaxFps(maxFps) {
    set({ maxFps });
    store(MAX_FPS_KEY, maxFps);
  },
  setOutputDir: (outputDir) => set({ outputDir }),
  async saveOutputDir() {
    try {
      const s = await api.saveSettings(get().outputDir);
      set({ outputDir: s.outputDir, notice: 'Pasta de saída guardada.' });
    } catch (e) {
      set({ notice: (e as Error).message });
    }
  },
  setRideName: (rideName) => set({ rideName }),
  toggleSelected: (clipId, on) => set({ selected: { ...get().selected, [clipId]: on } }),

  async startRender() {
    const st = get();
    if (!st.rideId || !st.ride) return;
    const cams = new Map(st.sync.cameras.map((c) => [c.id, c]));
    const clips = st.sync.clips
      .filter((c) => st.selected[c.id])
      .map((c: Clip) => ({
        id: c.id,
        fileName: c.meta.fileName,
        startUtcMs: effectiveStart(c, cams.get(c.cameraId)!)!,
        durationMs: c.meta.durationMs,
        fps: c.meta.fps!,
        frameCount: c.meta.frameCount,
        width: c.meta.width,
        height: c.meta.height,
      }))
      .filter((c) => c.startUtcMs !== undefined && c.fps);
    set({ renderError: undefined });
    try {
      const job = await api.startRender({
        rideId: st.rideId,
        rideName: st.rideName,
        clips,
        overlays: st.overlays,
        style: st.style,
        format: st.format,
        maxFps: st.maxFps,
        outputDir: st.outputDir,
        separate: st.exportSeparate,
        composite: st.exportComposite,
        layout: st.layout,
        compositeShortSide: st.compositeShortSide,
      });
      set({ job });
      api.watchJob(job.id, (s) => set({ job: s }));
    } catch (e) {
      set({ renderError: (e as Error).message });
    }
  },

  async cancelRender() {
    const job = get().job;
    if (job) await api.cancel(job.id);
  },

  saveProject() {
    const st = get();
    const p: ProjectFile = {
      version: PROJECT_VERSION,
      name: st.rideName,
      telemetry: st.rideFile ? { fileName: st.rideFile.name, sizeBytes: st.rideFile.size } : undefined,
      cameras: st.sync.cameras,
      clips: st.sync.clips.map((c) => ({
        id: c.id,
        meta: c.meta,
        cameraId: c.cameraId,
        manualStartUtcMs: c.manualStartUtcMs,
        clipOffsetMs: c.clipOffsetMs,
        selected: !!st.selected[c.id],
      })),
      overlays: st.overlays,
      style: st.style,
      output: { format: st.format, separate: st.exportSeparate, composite: st.exportComposite, compositeShortSide: st.compositeShortSide, maxFps: st.maxFps },
      layout: st.layout,
    };
    const blob = new Blob([serializeProject(p)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${st.rideName.replace(/[<>:"/\\|?*]/g, '_')}.telemesync.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },

  async openProject(file) {
    try {
      const p = parseProject(await file.text());
      const clips: Clip[] = p.clips.map((c) => ({
        id: c.id,
        meta: c.meta,
        cameraId: c.cameraId,
        manualStartUtcMs: c.manualStartUtcMs,
        clipOffsetMs: c.clipOffsetMs,
        resolved: { candidates: [] },
      }));
      const sync = resolveAll({ cameras: p.cameras, clips }, get().ride?.startTime);
      const selected: Record<string, boolean> = {};
      p.clips.forEach((c) => (selected[c.id] = c.selected));
      set({
        sync,
        selected,
        files: {},
        overlays: p.overlays,
        style: p.style,
        format: p.output.format,
        maxFps: p.output.maxFps === 30 ? 30 : 0,
        exportSeparate: p.output.separate ?? true,
        exportComposite: p.output.composite ?? false,
        compositeShortSide: p.output.compositeShortSide ?? 1080,
        layout: p.layout ?? {},
        rideName: p.name,
        activeClipId: clips[0]?.id,
        step: get().ride ? 'sync' : 'telemetry',
        notice: `Projeto aberto. ${p.telemetry ? `Carregue a telemetria (${p.telemetry.fileName})` : 'Carregue a telemetria'} e volte a arrastar os vídeos para os pré-visualizar.`,
      });
    } catch (e) {
      set({ notice: (e as Error).message });
    }
  },

  setPlacement(id, p) {
    const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
    const w = clamp(p.w, 0.03, 1);
    const layout = { ...get().layout, [id]: { w, x: clamp(p.x, -w * 0.8, 0.98), y: clamp(p.y, -0.2, 0.98) } };
    set({ layout });
    store(LAYOUT_KEY, layout);
  },
  resetLayout() {
    set({ layout: {} });
    store(LAYOUT_KEY, {});
  },
  setExportOptions: (o) => set(o),
  dismissNotice: () => set({ notice: undefined }),
}));
