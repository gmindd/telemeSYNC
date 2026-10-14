import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  effectiveStart,
  getOverlay,
  overlayPixelSize,
  renderOverlayFrame,
  type Camera,
  type Clip,
  type Ctx2D,
  type OverlayId,
  type OverlayStyle,
  type RideData,
} from '@telemesync/core';
import { useApp } from '../lib/store.ts';

type PlayState = 'loading' | 'ok' | 'error' | 'nofile' | 'unsupported';

const TEXT_IDS = new Set<OverlayId>(['speed', 'altitude', 'grade', 'heartRate', 'cadence', 'power', 'temperature', 'distance', 'elevationGain', 'elapsedTime', 'localTime']);

function reasonText(state: PlayState, clip: Clip): string {
  if (state === 'nofile') return 'O ficheiro de vídeo não está associado (projeto reaberto). Arraste-o de novo no passo "Clips" para ver o vídeo. Abaixo mostram-se só os dados.';
  if (state === 'unsupported') return `O browser não reproduz ficheiros ${clip.meta.fileName.split('.').pop()?.toUpperCase()} (vídeo 360° em bruto). Mostram-se só os dados — use o slider para percorrer o clip.`;
  const hevc = clip.meta.codec === 'hvc1' || clip.meta.codec === 'hev1';
  return hevc
    ? 'O browser não consegue reproduzir este vídeo HEVC (H.265). No Windows pode instalar as "Extensões de Vídeo HEVC" da Microsoft Store, ou usar o Edge. Mostram-se só os dados.'
    : 'O browser não consegue reproduzir este ficheiro. Mostram-se só os dados — use o slider para percorrer o clip.';
}

export function Preview(props: { clip: Clip; camera: Camera; file?: File; ride: RideData; overlays: OverlayId[]; style: OverlayStyle; previewScale: number }) {
  const { clip, camera, file, ride, overlays, style } = props;
  const setPlayhead = useApp((s) => s.setPlayhead);
  const playhead = useApp((s) => s.playhead);
  const start = effectiveStart(clip, camera);
  const startRef = useRef(start);
  startRef.current = start;

  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const canvases = useRef(new Map<OverlayId, HTMLCanvasElement>());
  const [boxW, setBoxW] = useState(640);
  const [localMs, setLocalMs] = useState(0);
  const localRef = useRef(0);
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

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  const clipW = clip.meta.width ?? 1920;
  // Overlays are rendered at `style.scale`× for sharpness; show them at their 1× size by default.
  const k = (boxW / clipW / style.scale) * props.previewScale;
  const textOverlays = overlays.filter((o) => TEXT_IDS.has(o));
  const canvasFor = (id: OverlayId) => {
    const { width, height } = overlayPixelSize(getOverlay(id), style);
    return (
      <canvas
        key={id}
        ref={(el) => {
          if (el) canvases.current.set(id, el);
          else canvases.current.delete(id);
        }}
        width={width}
        height={height}
        style={{ width: width * k, height: height * k }}
      />
    );
  };

  return (
    <div className="preview">
      <div className="preview-box" ref={box} style={{ aspectRatio: `${clip.meta.width ?? 16} / ${clip.meta.height ?? 9}` }}>
        {url && state !== 'error' ? (
          <video
            ref={video}
            src={url}
            controls
            muted
            playsInline
            onLoadedData={() => setState('ok')}
            onError={() => setState('error')}
          />
        ) : (
          <div className="preview-nodata" />
        )}
        <div className="overlay-layer">
          <div className="ov-col">{textOverlays.map(canvasFor)}</div>
          {overlays.includes('map') ? <div className="ov-map">{canvasFor('map')}</div> : null}
          {overlays.includes('elevationProfile') ? <div className="ov-profile">{canvasFor('elevationProfile')}</div> : null}
        </div>
      </div>
      {state === 'error' || state === 'nofile' || state === 'unsupported' ? (
        <>
          <p className="notice">{reasonText(state, clip)}</p>
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
