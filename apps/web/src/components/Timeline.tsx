import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clipWarnings, effectiveStart, formatTime, lowerIndex, type RideData, type SyncState } from '@telemesync/core';
import { useLang, useT } from '../i18n/index.tsx';
import { dec } from '../lib/format.ts';
import type { Playhead } from '../lib/store.ts';

const LANE_H = 26;
const GRAPH_H = 150;
const AXIS_H = 22;

interface Props {
  ride: RideData;
  sync: SyncState;
  timeZone: string;
  activeClipId?: string;
  playhead?: Playhead;
  onSelectClip(id: string): void;
  onPlayhead(t: number): void;
  onCameraOffset(cameraId: string, ms: number): void;
  onClipOffset(clipId: string, ms: number): void;
}

function niceStep(msPerPx: number): number {
  const target = msPerPx * 110;
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200].map((s) => s * 1000);
  return steps.find((s) => s >= target) ?? 7200_000;
}

export function Timeline(p: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(800);
  const cams = useMemo(() => new Map(p.sync.cameras.map((c) => [c.id, c])), [p.sync.cameras]);

  // Initial view: ride window ∪ clips, padded.
  const fullRange = useMemo(() => {
    let a = p.ride.startTime;
    let b = p.ride.endTime;
    for (const c of p.sync.clips) {
      const s = effectiveStart(c, cams.get(c.cameraId)!);
      if (s === undefined) continue;
      // Ignore clips absurdly far away (wrong dates) for the initial framing.
      if (s > p.ride.endTime + 6 * 3600_000 || s < p.ride.startTime - 6 * 3600_000) continue;
      a = Math.min(a, s);
      b = Math.max(b, s + c.meta.durationMs);
    }
    const pad = (b - a) * 0.02;
    return [a - pad, b + pad] as const;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.ride]);
  const [view, setView] = useState<[number, number]>([fullRange[0], fullRange[1]]);
  const t = useT();
  const lang = useLang((s) => s.lang);
  useEffect(() => setView([fullRange[0], fullRange[1]]), [fullRange]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const msPerPx = (view[1] - view[0]) / width;
  const x = useCallback((t: number) => (t - view[0]) / msPerPx, [view, msPerPx]);
  const lanes = p.sync.cameras.length;
  const lanesH = Math.max(1, lanes) * LANE_H + 6;

  // Graph: speed (top) and altitude (bottom).
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = width * dpr;
    c.height = (GRAPH_H + AXIS_H) * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, GRAPH_H + AXIS_H);
    const r = p.ride;
    const i0 = Math.max(0, lowerIndex(r.t, view[0]));
    const i1 = Math.min(r.t.length - 1, lowerIndex(r.t, view[1]) + 1);
    const stride = Math.max(1, Math.floor((i1 - i0) / (width * 2)));

    // ride window background
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(x(r.startTime), 0, x(r.endTime) - x(r.startTime), GRAPH_H);

    // altitude
    let minA = Infinity;
    let maxA = -Infinity;
    for (let i = 0; i < r.t.length; i++) {
      if (r.altitude[i] < minA) minA = r.altitude[i];
      if (r.altitude[i] > maxA) maxA = r.altitude[i];
    }
    if (Number.isFinite(minA)) {
      const h = GRAPH_H * 0.5;
      const yA = (a: number) => GRAPH_H - 2 - ((a - minA) / Math.max(1, maxA - minA)) * (h - 4);
      ctx.beginPath();
      ctx.moveTo(x(r.t[i0]), GRAPH_H);
      for (let i = i0; i <= i1; i += stride) ctx.lineTo(x(r.t[i]), yA(r.altitude[i]));
      ctx.lineTo(x(r.t[i1]), GRAPH_H);
      ctx.closePath();
      ctx.fillStyle = 'rgba(120,144,156,0.45)';
      ctx.fill();
    }
    // speed
    let maxS = 1;
    for (let i = 0; i < r.t.length; i++) if (r.speed[i] > maxS) maxS = r.speed[i];
    const yS = (s: number) => GRAPH_H * 0.55 - (s / maxS) * (GRAPH_H * 0.5);
    ctx.beginPath();
    let pen = false;
    for (let i = i0; i <= i1; i += stride) {
      const gap = i > i0 && r.t[i] - r.t[i - stride] > r.gapThresholdMs * stride;
      if (!pen || gap) {
        ctx.moveTo(x(r.t[i]), yS(r.speed[i] || 0));
        pen = true;
      } else ctx.lineTo(x(r.t[i]), yS(r.speed[i] || 0));
    }
    ctx.strokeStyle = '#ff7a1a';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // axis
    const step = niceStep(msPerPx);
    ctx.fillStyle = '#9aa4ad';
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const first = Math.ceil(view[0] / step) * step;
    for (let t = first; t < view[1]; t += step) {
      const X = Math.round(x(t)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(X, 0);
      ctx.lineTo(X, GRAPH_H);
      ctx.stroke();
      ctx.fillText(formatTime(t, p.timeZone, step < 60_000), X, GRAPH_H + 15);
    }
    // labels
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ff7a1a';
    ctx.fillText(t('timeline.speed'), 6, 12);
    ctx.fillStyle = '#90a4ae';
    ctx.fillText(t('timeline.altitude'), 6, GRAPH_H - 6);
  }, [p.ride, view, width, msPerPx, x, p.timeZone, lang]);

  // Interaction state
  const drag = useRef<
    | { kind: 'clip'; clipId: string; cameraId: string; alt: boolean; startX: number; orig: number; moved: boolean }
    | { kind: 'pan'; startX: number; origView: [number, number]; moved: boolean }
    | null
  >(null);

  const onWheel = (e: React.WheelEvent) => {
    const rect = wrap.current!.getBoundingClientRect();
    const px = e.clientX - rect.left;
    if (e.shiftKey) {
      const d = (e.deltaY || e.deltaX) * msPerPx;
      setView([view[0] + d, view[1] + d]);
      return;
    }
    const anchor = view[0] + px * msPerPx;
    const f = Math.exp(e.deltaY * 0.0015);
    const span = Math.max(5_000, Math.min(48 * 3600_000, (view[1] - view[0]) * f));
    const a = anchor - (px / width) * span;
    setView([a, a + span]);
  };

  // Prevent page scroll while zooming the timeline.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const h = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, []);

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 2) d.moved = true;
    if (!d.moved) return;
    if (d.kind === 'pan') {
      const dt = -dx * msPerPx;
      setView([d.origView[0] + dt, d.origView[1] + dt]);
    } else {
      const v = Math.round((d.orig + dx * msPerPx) / 10) * 10;
      if (d.alt) p.onClipOffset(d.clipId, v);
      else p.onCameraOffset(d.cameraId, v);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    if (d.kind === 'clip') p.onSelectClip(d.clipId);
    else {
      const rect = wrap.current!.getBoundingClientRect();
      p.onPlayhead(view[0] + (e.clientX - rect.left) * msPerPx);
    }
  };

  const playX = p.playhead ? x(p.playhead.t) : undefined;

  return (
    <div className="timeline">
      <div className="timeline-toolbar">
        <span className="hint">{t('timeline.hint')}</span>
        <button className="small" onClick={() => setView([fullRange[0], fullRange[1]])}>{t('timeline.all')}</button>
      </div>
      <div
        ref={wrap}
        className="timeline-area"
        style={{ height: lanesH + GRAPH_H + AXIS_H }}
        onWheel={onWheel}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          drag.current = { kind: 'pan', startX: e.clientX, origView: view, moved: false };
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {p.sync.cameras.map((cam, lane) => (
          <div key={cam.id} className="lane" style={{ top: lane * LANE_H, height: LANE_H }}>
            <span className="lane-label" style={{ color: cam.color }}>{cam.label}</span>
          </div>
        ))}
        {p.sync.clips.map((clip) => {
          const cam = cams.get(clip.cameraId)!;
          const s = effectiveStart(clip, cam);
          if (s === undefined) return null;
          const left = x(s);
          const w = Math.max(4, clip.meta.durationMs / msPerPx);
          if (left > width + 50 || left + w < -50) return null;
          const lane = p.sync.cameras.indexOf(cam);
          const warn = clipWarnings(clip, cam, p.ride.startTime, p.ride.endTime, lang).some((x) => x.code !== 'resolversDisagree');
          return (
            <div
              key={clip.id}
              className={`clip-block${clip.id === p.activeClipId ? ' active' : ''}${warn ? ' warn' : ''}`}
              style={{ left, width: w, top: lane * LANE_H + 3, height: LANE_H - 6, background: cam.color }}
              title={`${clip.meta.fileName}\n${formatTime(s, cam.timeZone)} · ${dec(clip.meta.durationMs / 1000, 1, lang)} s${clip.clipOffsetMs ? `\n${t('timeline.clipOffset', { offset: dec(clip.clipOffsetMs / 1000, 1, lang) })}` : ''}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                (e.target as Element).setPointerCapture?.(e.pointerId);
                drag.current = {
                  kind: 'clip',
                  clipId: clip.id,
                  cameraId: cam.id,
                  alt: e.altKey,
                  startX: e.clientX,
                  orig: e.altKey ? clip.clipOffsetMs : cam.offsetMs,
                  moved: false,
                };
              }}
            >
              {w > 70 ? <span>{clip.meta.fileName}</span> : null}
            </div>
          );
        })}
        <canvas ref={canvas} className="timeline-graph" style={{ top: lanesH, width, height: GRAPH_H + AXIS_H }} />
        {playX !== undefined && playX >= 0 && playX <= width ? <div className="playhead" style={{ left: playX }} /> : null}
      </div>
    </div>
  );
}
