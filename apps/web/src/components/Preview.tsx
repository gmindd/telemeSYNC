import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  effectiveStart,
  formatDuration,
  resolveLayout,
  type GadgetLayout,
  type GadgetPlacement,
  getOverlay,
  overlayLabel,
  overlayPixelSize,
  renderOverlayFrame,
  type Camera,
  type Clip,
  type Ctx2D,
  type OverlayId,
  type OverlayStyle,
  type RideData,
} from '@telemesync/core';
import { useLang, useT, type T } from '../i18n/index.tsx';
import { useApp } from '../lib/store.ts';
import { currentPlatform } from '../lib/updates.ts';

type PlayState = 'loading' | 'ok' | 'error' | 'nofile' | 'unsupported';

function reasonText(state: PlayState, clip: Clip, t: T): string {
  if (state === 'nofile') return t('preview.noFile');
  if (state === 'unsupported') return t('preview.unsupported', { ext: clip.meta.fileName.split('.').pop()?.toUpperCase() ?? '' });
  const hevc = clip.meta.codec === 'hvc1' || clip.meta.codec === 'hev1';
  return hevc ? t('preview.hevc', { help: t(currentPlatform() === 'mac' ? 'preview.hevcMac' : 'preview.hevcWin') }) : t('preview.error');
}

/** One gadget on the preview: drag to move, drag the corner to resize. Positions are fractions of the frame. */
function Gadget(props: {
  id: OverlayId;
  p: GadgetPlacement;
  style: OverlayStyle;
  box: React.RefObject<HTMLDivElement | null>;
  canvasRef: (el: HTMLCanvasElement | null) => void;
  onChange: (p: GadgetPlacement) => void;
}) {
  const { id, p, style } = props;
  const t = useT();
  const lang = useLang((s) => s.lang);
  const { width, height } = overlayPixelSize(getOverlay(id), style);
  const drag = useRef<{ mode: 'move' | 'resize'; x0: number; y0: number; p0: GadgetPlacement; bw: number; bh: number } | null>(null);
  const start = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const r = props.box.current!.getBoundingClientRect();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { mode, x0: e.clientX, y0: e.clientY, p0: p, bw: r.width, bh: r.height };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x0) / d.bw;
    const dy = (e.clientY - d.y0) / d.bh;
    if (d.mode === 'move') props.onChange({ ...d.p0, x: d.p0.x + dx, y: d.p0.y + dy });
    else props.onChange({ ...d.p0, w: d.p0.w + dx });
  };
  const end = () => (drag.current = null);
  return (
    <div
      className="gadget"
      style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: `${p.w * 100}%` }}
      title={t('preview.gadget', { name: overlayLabel(id, lang) })}
      onPointerDown={start('move')}
      onPointerMove={move}
      onPointerUp={end}
    >
      <canvas ref={props.canvasRef} width={width} height={height} />
      <span className="gadget-resize" onPointerDown={start('resize')} onPointerMove={move} onPointerUp={end} />
    </div>
  );
}

export function Preview(props: {
  clip: Clip;
  camera: Camera;
  file?: File;
  ride: RideData;
  overlays: OverlayId[];
  style: OverlayStyle;
  layout: GadgetLayout;
  onPlacement: (id: OverlayId, p: GadgetPlacement) => void;
}) {
  const { clip, camera, file, ride, overlays, style } = props;
  const setPlayhead = useApp((s) => s.setPlayhead);
  const t = useT();
  const playhead = useApp((s) => s.playhead);
  const start = effectiveStart(clip, camera);
  const startRef = useRef(start);
  startRef.current = start;

  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const canvases = useRef(new Map<OverlayId, HTMLCanvasElement>());
  const [localMs, setLocalMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const localRef = useRef(0);
  // Upside-down camera: only the video turns; the native controls would turn with it, so own controls are shown.
  const rotated = camera.videoRotation === 180;
  useEffect(() => {
    if (rotated && video.current) setLocalMs(video.current.currentTime * 1000);
  }, [rotated]);
  const lastStoreUpdate = useRef(0);

  const isInsv = /\.insv$/i.test(clip.meta.fileName);
  const url = useMemo(() => (file && !isInsv ? URL.createObjectURL(file) : undefined), [file, isInsv]);
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);
  const [state, setState] = useState<PlayState>(!file ? 'nofile' : isInsv ? 'unsupported' : 'loading');
  useEffect(() => setState(!file ? 'nofile' : isInsv ? 'unsupported' : 'loading'), [file, isInsv, clip.id]);
  useEffect(() => {
    setLocalMs(0);
    localRef.current = 0;
  }, [clip.id]);

  const draw = useCallback(
    (ms: number) => {
      const s = startRef.current;
      if (s === undefined) return;
      const t = s + ms;
      const octx = { ride, clipStart: s, clipEnd: s + clip.meta.durationMs };
      for (const id of overlays) {
        const c = canvases.current.get(id);
        const ctx = c?.getContext('2d');
        if (ctx) renderOverlayFrame(ctx as unknown as Ctx2D, getOverlay(id), t, style, octx);
      }
      const now = performance.now();
      if (now - lastStoreUpdate.current > 100) {
        lastStoreUpdate.current = now;
        setPlayhead({ t, source: 'video' });
      }
    },
    [ride, overlays, style, clip.meta.durationMs, setPlayhead],
  );

  // Redraw when anything that affects the image changes.
  useEffect(() => draw(localRef.current), [draw, start]);

  // Follow the video frame by frame.
  useEffect(() => {
    const v = video.current;
    if (!v || state !== 'ok') return;
    let handle = 0;
    let stopped = false;
    const anyV = v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number; cancelVideoFrameCallback?: (h: number) => void };
    if (anyV.requestVideoFrameCallback) {
      const tick = (_n: number, meta: { mediaTime: number }) => {
        if (stopped) return;
        localRef.current = meta.mediaTime * 1000;
        draw(localRef.current);
        handle = anyV.requestVideoFrameCallback!(tick);
      };
      handle = anyV.requestVideoFrameCallback(tick);
      const onSeek = () => {
        localRef.current = v.currentTime * 1000;
        draw(localRef.current);
      };
      v.addEventListener('seeked', onSeek);
      return () => {
        stopped = true;
        anyV.cancelVideoFrameCallback?.(handle);
        v.removeEventListener('seeked', onSeek);
      };
    }
    const loop = () => {
      if (stopped) return;
      localRef.current = v.currentTime * 1000;
      draw(localRef.current);
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => {
      stopped = true;
      cancelAnimationFrame(handle);
    };
  }, [state, draw]);

  // Timeline click → seek.
  useEffect(() => {
    if (!playhead || playhead.source !== 'user' || start === undefined) return;
    const ms = playhead.t - start;
    if (ms < 0 || ms > clip.meta.durationMs) return;
    if (state === 'ok' && video.current) video.current.currentTime = ms / 1000;
    else {
      localRef.current = ms;
      setLocalMs(ms);
      draw(ms);
    }
  }, [playhead, start, clip.meta.durationMs, state, draw]);

  const aspect = clip.meta.width && clip.meta.height ? clip.meta.width / clip.meta.height : 16 / 9;
  const placements = resolveLayout(overlays, props.layout, aspect, style);
  const canvasRef = (id: OverlayId) => (el: HTMLCanvasElement | null) => {
    if (el) canvases.current.set(id, el);
    else canvases.current.delete(id);
  };
  // Redraw right after (re)mounting canvases.
  useEffect(() => draw(localRef.current), [overlays.join(','), draw]);

  return (
    <div className="preview">
      <div className="preview-box" ref={box} style={{ aspectRatio: `${clip.meta.width ?? 16} / ${clip.meta.height ?? 9}` }}>
        {url && state !== 'error' ? (
          <video
            ref={video}
            src={url}
            controls={!rotated}
            muted
            playsInline
            className={rotated ? 'rotated' : undefined}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(e) => rotated && setLocalMs(e.currentTarget.currentTime * 1000)}
            onLoadedData={() => setState('ok')}
            onError={() => setState('error')}
          />
        ) : (
          <div className="preview-nodata" />
        )}
        <div className="overlay-layer">
          {overlays.map((id) => (
            <Gadget key={id} id={id} p={placements[id]} style={style} box={box} canvasRef={canvasRef(id)} onChange={(p) => props.onPlacement(id, p)} />
          ))}
        </div>
      </div>
      {rotated && state === 'ok' ? (
        <div className="video-controls">
          <button className="small" onClick={() => (video.current?.paused ? void video.current.play() : video.current?.pause())}>
            {playing ? `❚❚ ${t('preview.pause')}` : `▶ ${t('preview.play')}`}
          </button>
          <input
            type="range"
            className="scrub"
            min={0}
            max={clip.meta.durationMs}
            step={40}
            value={localMs}
            onChange={(e) => {
              if (video.current) video.current.currentTime = Number(e.target.value) / 1000;
              setLocalMs(Number(e.target.value));
            }}
          />
          <span className="muted">
            {formatDuration(localMs)} / {formatDuration(clip.meta.durationMs)}
          </span>
        </div>
      ) : null}
      {state === 'error' || state === 'nofile' || state === 'unsupported' ? (
        <>
          <p className="notice">{reasonText(state, clip, t)}</p>
          <input
            type="range"
            className="scrub"
            min={0}
            max={clip.meta.durationMs}
            step={100}
            value={localMs}
            onChange={(e) => {
              const ms = Number(e.target.value);
              localRef.current = ms;
              setLocalMs(ms);
              draw(ms);
            }}
          />
        </>
      ) : null}
    </div>
  );
}
