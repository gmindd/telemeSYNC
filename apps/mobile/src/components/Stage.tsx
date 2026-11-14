// The editor's picture: the clip playing in the chosen format, the gadgets drawn on top by the core (the same
// renderer as the export), and touch handling: tap a gadget to select it, drag to move, drag the corner or pinch with
// two fingers to resize. With a social network's areas shown, gadgets dropped on them move to the nearest clear spot.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { drawComposite, gadgetBox, gadgetZones, overlayLabel, zonesPath, type Ctx2D, type GadgetPlacement, type OverlayId } from '@telemesync/core';
import { LANG, t } from '../i18n.ts';
import { cropsSideways, isVertical } from '../lib/formats.ts';
import { FramePlayer } from '../lib/framePlayer.ts';
import { attachFrames, attachVideo, togglePlay } from '../lib/player.ts';
import { clipStart, frameAspect, placements, STYLE, useProject } from '../state.ts';

const MIN_W = 0.06;

type Gesture =
  | { mode: 'tap'; x: number; y: number; at: number }
  | { mode: 'move' | 'resize'; id: OverlayId; x: number; y: number; p0: GadgetPlacement }
  | { mode: 'pinch'; id: OverlayId; dist0: number; p0: GadgetPlacement; h0: number };

export function Stage() {
  const s = useProject();
  const wrap = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const bg = useRef<HTMLCanvasElement>(null);
  const framePlayer = useRef<FramePlayer | null>(null);
  const lastFrame = useRef<HTMLCanvasElement | OffscreenCanvas | null>(null);
  // The <video> couldn't play the clip: frames come from the WebCodecs decoder instead
  const [useFrames, setUseFrames] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const aspect = frameAspect(s);
  const pl = placements(s);
  const showZones = isVertical(aspect) && s.platforms.length > 0;
  const zones = showZones ? gadgetZones(s.overlays, pl, aspect, STYLE, s.platforms) : {};

  // Largest frame of the format's shape that fits the space
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => {
      const { width, height } = el.getBoundingClientRect();
      const w = Math.min(width, height * aspect);
      setSize({ w: Math.floor(w), h: Math.floor(w / aspect) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);

  const url = useMemo(() => (s.clip ? URL.createObjectURL(s.clip.file) : ''), [s.clip]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  useEffect(() => setUseFrames(false), [url]);

  const sideways = s.info ? cropsSideways(s.format, s.info.width, s.info.height) : null;
  // Frame-player picture: the decoded frame scaled to cover the frame, slid like the <video>'s object-position
  const drawBg = useRef((_f: HTMLCanvasElement | OffscreenCanvas) => {});
  drawBg.current = (f) => {
    const c = bg.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx || !size.w) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.round(size.w * dpr);
    const ch = Math.round(size.h * dpr);
    if (c.width !== cw || c.height !== ch) {
      c.width = cw;
      c.height = ch;
    }
    const k = Math.max(cw / f.width, ch / f.height);
    const sw = cw / k;
    const sh = ch / k;
    const pos = (axis: 'x' | 'y') => (sideways === axis ? s.cropPos : 0.5);
    ctx.drawImage(f, (f.width - sw) * pos('x'), (f.height - sh) * pos('y'), sw, sh, 0, 0, cw, ch);
  };

  // Draws the gadgets for a moment of the clip (seconds); the latest settings are read when it runs
  const draw = useRef((_sec: number) => {});
  draw.current = (sec: number) => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx || !s.ride || !size.w) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.round(size.w * dpr);
    const ch = Math.round(size.h * dpr);
    if (c.width !== cw || c.height !== ch) {
      c.width = cw;
      c.height = ch;
    }
    const start = clipStart(s);
    drawComposite(ctx as unknown as Ctx2D, s.overlays, pl, start + sec * 1000, STYLE, { ride: s.ride, clipStart: start, clipEnd: start + s.trim.end * 1000 }, cw, ch);
  };
  const currentTime = () => (useFrames ? framePlayer.current?.time : video.current?.currentTime) ?? s.playheadS;
  useEffect(() => draw.current(currentTime()), [s.overlays, s.layout, s.offsetS, s.autoStart, s.ride, s.format, size.w, size.h]);
  useEffect(() => void (lastFrame.current && drawBg.current(lastFrame.current)), [s.format, s.cropPos, size.w, size.h]);

  // Frame player, when the <video> failed
  useEffect(() => {
    if (!useFrames || !s.clip) return;
    let lastStore = 0;
    const fp = new FramePlayer(
      s.clip.file,
      (f, sec) => {
        lastFrame.current = f;
        drawBg.current(f);
        draw.current(sec);
        const now = performance.now();
        if (now - lastStore > 100 || framePlayer.current?.paused) {
          lastStore = now;
          useProject.getState().setPlayhead(sec);
        }
      },
      (playing) => useProject.getState().setPlaying(playing),
    );
    framePlayer.current = fp;
    let alive = true;
    void fp.init().then(() => {
      if (!alive) return;
      attachFrames(fp);
      void fp.seek(useProject.getState().playheadS || useProject.getState().trim.start);
    });
    return () => {
      alive = false;
      attachFrames(null);
      fp.dispose();
      framePlayer.current = null;
    };
  }, [useFrames, s.clip]);

  // Follow the video frame by frame; stop at the end of the trimmed part
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    attachVideo(v);
    let stop = false;
    let handle = 0;
    let lastStore = 0;
    const onFrame = (sec: number) => {
      draw.current(sec);
      const { trim, setPlayhead } = useProject.getState();
      if (!v.paused && sec >= trim.end) {
        v.pause();
        v.currentTime = trim.end;
      }
      const now = performance.now();
      if (now - lastStore > 100) {
        lastStore = now;
        setPlayhead(sec);
      }
    };
    const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: (n: number, m: { mediaTime: number }) => void) => number }).requestVideoFrameCallback?.bind(v);
    const tick = (_n: number, m: { mediaTime: number }) => {
      if (stop) return;
      onFrame(m.mediaTime);
      handle = rvfc!(tick);
    };
    const loop = () => {
      if (stop) return;
      if (!v.paused) onFrame(v.currentTime);
      handle = requestAnimationFrame(loop);
    };
    handle = rvfc ? rvfc(tick) : requestAnimationFrame(loop);
    const onSeeked = () => onFrame(v.currentTime);
    const onPlay = () => useProject.getState().setPlaying(true);
    const onPause = () => {
      useProject.getState().setPlaying(false);
      useProject.getState().setPlayhead(v.currentTime);
    };
    const onLoaded = () => {
      v.currentTime = useProject.getState().trim.start;
    };
    const onError = () => setUseFrames(true);
    v.addEventListener('error', onError);
    v.addEventListener('seeked', onSeeked);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('loadeddata', onLoaded);
    return () => {
      stop = true;
      if (!rvfc) cancelAnimationFrame(handle);
      v.removeEventListener('seeked', onSeeked);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('loadeddata', onLoaded);
      v.removeEventListener('error', onError);
      attachVideo(null);
    };
  }, [url]);

  // Touch: one gesture at a time, tracked on the whole frame so a second finger anywhere can pinch
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const dist = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    frame.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const st = useProject.getState();
    const cur = placements(st);
    if (pointers.current.size === 2) {
      const id = gesture.current && 'id' in gesture.current ? gesture.current.id : st.selected;
      if (id && cur[id]) gesture.current = { mode: 'pinch', id, dist0: dist(), p0: cur[id], h0: gadgetBox(id, cur[id], aspect, STYLE).h };
      return;
    }
    const target = e.target as HTMLElement;
    const id = target.closest<HTMLElement>('[data-gadget]')?.dataset.gadget as OverlayId | undefined;
    if (id && cur[id]) {
      st.select(id);
      gesture.current = { mode: target.closest('[data-resize]') ? 'resize' : 'move', id, x: e.clientX, y: e.clientY, p0: cur[id] };
    } else gesture.current = { mode: 'tap', x: e.clientX, y: e.clientY, at: performance.now() };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g || g.mode === 'tap' || !size.w) return;
    const { place } = useProject.getState();
    if (g.mode === 'pinch') {
      if (pointers.current.size < 2) return;
      const k = dist() / g.dist0;
      const w = Math.min(1, Math.max(MIN_W, g.p0.w * k));
      const r = w / g.p0.w;
      const cx = g.p0.x + g.p0.w / 2;
      const cy = g.p0.y + g.h0 / 2;
      place(g.id, { x: cx - w / 2, y: cy - (g.h0 * r) / 2, w });
      return;
    }
    const dx = (e.clientX - g.x) / size.w;
    const dy = (e.clientY - g.y) / size.h;
    if (g.mode === 'move') place(g.id, { ...g.p0, x: g.p0.x + dx, y: g.p0.y + dy });
    else place(g.id, { ...g.p0, w: Math.min(1, Math.max(MIN_W, g.p0.w + dx)) });
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size > 0) return;
    gesture.current = null;
    if (!g) return;
    const st = useProject.getState();
    if (g.mode === 'tap') {
      const still = Math.hypot(e.clientX - g.x, e.clientY - g.y) < 10 && performance.now() - g.at < 400;
      if (!still) return;
      if (st.selected) st.select(undefined);
      else togglePlay();
    } else st.settle(g.id);
  };

  const objectPosition = sideways === 'x' ? `${s.cropPos * 100}% 50%` : sideways === 'y' ? `50% ${s.cropPos * 100}%` : '50% 50%';

  return (
    <div className="stage" ref={wrap} style={{ '--aspect': aspect } as React.CSSProperties}>
      <div
        className="frame"
        ref={frame}
        style={{ width: size.w, height: size.h }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {url && !useFrames && <video ref={video} src={url} playsInline preload="auto" style={{ objectPosition }} />}
        {useFrames && <canvas ref={bg} className="frame__bg" />}
        <canvas ref={canvas} className="frame__overlay" />
        {showZones && (
          <svg className="frame__zones" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
            <path d={zonesPath(s.platforms, 'maybe')} />
            <path d={zonesPath(s.platforms, 'ui')} className="ui" />
          </svg>
        )}
        {s.overlays.map((id) => {
          const p = pl[id];
          if (!p) return null;
          const b = gadgetBox(id, p, aspect, STYLE);
          const sel = s.selected === id;
          return (
            <div
              key={id}
              data-gadget={id}
              className={`handle${sel ? ' is-selected' : ''}${zones[id] ? ` zone-${zones[id]}` : ''}${s.playing ? ' is-playing' : ''}`}
              style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}
              aria-label={overlayLabel(id, LANG)}
            >
              {sel && <span className="handle__resize" data-resize aria-hidden="true" />}
            </div>
          );
        })}
        {!s.playing && (
          <span className="frame__play" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="30" height="30"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
          </span>
        )}
      </div>
      <span className="sr-only">{s.playing ? t('editor.pause') : t('editor.play')}</span>
    </div>
  );
}
