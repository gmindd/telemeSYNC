import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  effectiveStart,
  shownSize,
  gadgetOpacity,
  formatDuration,
  gadgetZones,
  resolveLayout,
  zonesPath,
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

/**
 * One gadget on the preview: click to select it, drag to move, drag the corner to resize, × (or Delete) to remove it.
 * Positions are fractions of the frame.
 */
function Gadget(props: {
  id: OverlayId;
  p: GadgetPlacement;
  style: OverlayStyle;
  box: React.RefObject<HTMLDivElement | null>;
  canvasRef: (el: HTMLCanvasElement | null) => void;
  onChange: (p: GadgetPlacement) => void;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  /** Covered by a social app's interface ('ui') or maybe covered ('maybe'). */
  zone?: 'ui' | 'maybe';
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
    props.onSelect();
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
      className={`gadget${props.zone ? ` zone-${props.zone}` : ''}${props.selected ? ' selected' : ''}`}
      style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: `${p.w * 100}%` }}
      title={t('preview.gadget', { name: overlayLabel(id, lang) })}
      onPointerDown={start('move')}
      onPointerMove={move}
      onPointerUp={end}
    >
      <canvas ref={props.canvasRef} width={width} height={height} />
      <span className="gadget-resize" onPointerDown={start('resize')} onPointerMove={move} onPointerUp={end} />
      <button
        type="button"
        className="gadget-delete"
        aria-label={t('preview.remove', { name: overlayLabel(id, lang) })}
        title={t('preview.remove', { name: overlayLabel(id, lang) })}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          props.onDelete();
        }}
      >
        ×
      </button>
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
  const toggleOverlay = useApp((s) => s.toggleOverlay);
  // Gadget clicked last: shows its × button, and Delete / Backspace removes it.
  const [selected, setSelected] = useState<OverlayId>();
  const sel = selected && overlays.includes(selected) ? selected : undefined;
  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        toggleOverlay(sel, false);
        setSelected(undefined);
      } else if (e.key === 'Escape') setSelected(undefined);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel, toggleOverlay]);
  const streets = useApp((s) => s.streets);
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
  const rotation = camera.videoRotation ?? 0;
  const rotated = rotation !== 0;
  // Sideways camera: the frame swaps width and height, the picture is turned inside it.
  const quarter = rotation === 90 || rotation === 270;
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
      const octx = { ride, clipStart: s, clipEnd: s + clip.meta.durationMs, streets };
      for (const id of overlays) {
        const c = canvases.current.get(id);
        const ctx = c?.getContext('2d');
        if (ctx) renderOverlayFrame(ctx as unknown as Ctx2D, getOverlay(id), t, style, octx);
        if (c) {
          // Gadget with a condition: as it will look in the video; while hidden, a faint outline so it can still be placed.
          const a = gadgetOpacity(id, t, style, ride);
          c.style.opacity = String(a > 0 ? a : 0.12);
          c.parentElement?.classList.toggle('is-hidden', a <= 0);
        }
      }
      const now = performance.now();
      if (now - lastStoreUpdate.current > 100) {
        lastStoreUpdate.current = now;
        setPlayhead({ t, source: 'video' });
      }
    },
    [ride, overlays, style, clip.meta.durationMs, setPlayhead, streets],
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

  const shown = shownSize(clip, camera);
  const aspect = shown.width && shown.height ? shown.width / shown.height : 16 / 9;
  const placements = resolveLayout(overlays, props.layout, aspect, style);
  const platforms = useApp((s) => s.safeZones);
  const zones = gadgetZones(overlays, placements, aspect, style, platforms);
  const canvasRef = (id: OverlayId) => (el: HTMLCanvasElement | null) => {
    if (el) canvases.current.set(id, el);
    else canvases.current.delete(id);
  };
  // Redraw right after (re)mounting canvases.
  useEffect(() => draw(localRef.current), [overlays.join(','), draw]);

  return (
    <div className="preview">
      <div className={`preview-box${aspect < 1 ? ' portrait' : ''}`} ref={box} style={{ aspectRatio: `${shown.width ?? 16} / ${shown.height ?? 9}` }} onPointerDown={() => setSelected(undefined)}>
        {url && state !== 'error' ? (
          <video
            ref={video}
            src={url}
            controls={!rotated}
            muted
            playsInline
            className={rotated ? `rotated rot-${rotation}` : undefined}
            // Turned a quarter: the video is laid out at the source's proportions, centred, then turned to fill the frame.
            style={quarter && clip.meta.width && clip.meta.height ? { width: `${(clip.meta.width / clip.meta.height) * 100}%`, height: `${(clip.meta.height / clip.meta.width) * 100}%` } : undefined}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(e) => rotated && setLocalMs(e.currentTarget.currentTime * 1000)}
            onLoadedData={() => setState('ok')}
            onError={() => setState('error')}
          />
        ) : (
          <div className="preview-nodata" />
        )}
        {platforms.length ? (
          <svg className="safe-zones" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden>
            <path d={zonesPath(platforms, 'maybe')} fill="rgba(0,0,0,0.28)" />
            <path d={zonesPath(platforms, 'ui')} fill="rgba(0,0,0,0.5)" />
          </svg>
        ) : null}
        <div className="overlay-layer">
          {overlays.map((id) => (
            <Gadget
              key={id}
              id={id}
              p={placements[id]}
              style={style}
              box={box}
              canvasRef={canvasRef(id)}
              onChange={(p) => props.onPlacement(id, p)}
              selected={id === sel}
              onSelect={() => setSelected(id)}
              onDelete={() => {
                toggleOverlay(id, false);
                setSelected(undefined);
              }}
              zone={zones[id]}
            />
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
