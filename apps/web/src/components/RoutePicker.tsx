import { useEffect, useMemo, useRef, useState } from 'react';
import { convert, mercator, type RideData, type Units } from '@telemesync/core';
import { useT } from '../i18n/index.tsx';

// Picks the stretch of the ride the maps and profiles show: a start (green) and an end (red) marker
// dragged along the route on a small map, or along the elevation strip under it. The clips' stretches
// are drawn in blue for reference. The choice is sent when a marker is let go.

interface Range {
  startMs: number;
  endMs: number;
}

interface Props {
  ride: RideData;
  value: Range;
  clips: Range[];
  units: Units;
  onChange(r: Range): void;
}

const MAP_H = 300;
const STRIP_H = 80;
const PAD = 16;
const HANDLE_R = 9;
const START = '#4ade80';
const END = '#f87171';
const CLIPS = '#38bdf8';
const ACCENT = '#ff7a1a';

interface Pts {
  /** Indices of the route points kept (about one per 1.5 px at full width). */
  idx: number[];
  x: number[];
  y: number[];
  minX: number;
  minY: number;
  span: number;
}

/** Route projected (Mercator) and thinned out once per ride. */
function routePoints(ride: RideData): Pts {
  const idx: number[] = [];
  const x: number[] = [];
  const y: number[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const all: { i: number; x: number; y: number }[] = [];
  for (let i = 0; i < ride.t.length; i++) {
    if (Number.isNaN(ride.lat[i])) continue;
    const m = mercator(ride.lat[i], ride.lon[i]);
    all.push({ i, x: m.x, y: m.y });
    minX = Math.min(minX, m.x);
    maxX = Math.max(maxX, m.x);
    minY = Math.min(minY, m.y);
    maxY = Math.max(maxY, m.y);
  }
  const span = Math.max(maxX - minX, maxY - minY, 1e-9);
  const step = span / 600;
  let lx = NaN;
  let ly = NaN;
  for (const p of all) {
    if (idx.length && Math.abs(p.x - lx) + Math.abs(p.y - ly) < step && p !== all[all.length - 1]) continue;
    idx.push(p.i);
    x.push(p.x);
    y.push(p.y);
    lx = p.x;
    ly = p.y;
  }
  return { idx, x, y, minX, minY, span };
}

/** Sample index at or after time t. */
function indexAt(ride: RideData, t: number): number {
  let lo = 0;
  let hi = ride.t.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ride.t[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function RoutePicker({ ride, value, clips, units, onChange }: Props) {
  const t = useT();
  const mapRef = useRef<HTMLCanvasElement>(null);
  const stripRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  const [range, setRange] = useState(value);
  // Latest range while dragging (state updates may not have rendered yet when the pointer is let go).
  const latest = useRef(value);
  const drag = useRef<'start' | 'end' | null>(null);
  const pts = useMemo(() => routePoints(ride), [ride]);
  useEffect(() => {
    latest.current = value;
    setRange(value);
  }, [value.startMs, value.endMs]);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(280, Math.min(900, el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Map geometry: the whole route fitted in the canvas.
  const k = Math.min(width - PAD * 2, MAP_H - PAD * 2) / pts.span;
  const ox = (width - pts.span * k) / 2 - pts.minX * k;
  const oy = (MAP_H - pts.span * k) / 2 - pts.minY * k;
  const MX = (x: number) => ox + x * k;
  const MY = (y: number) => oy + y * k;
  const total = Math.max(1, ride.distance[ride.distance.length - 1]);
  const SX = (d: number) => PAD + (d / total) * (width - PAD * 2);

  const i0 = indexAt(ride, range.startMs);
  const i1 = indexAt(ride, range.endMs);

  useEffect(() => {
    const dpr = window.devicePixelRatio || 1;
    const prep = (c: HTMLCanvasElement | null, h: number) => {
      if (!c) return null;
      c.width = width * dpr;
      c.height = h * dpr;
      c.style.width = `${width}px`;
      c.style.height = `${h}px`;
      const ctx = c.getContext('2d');
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      return ctx;
    };
    const inClip = (time: number) => clips.some((c) => time >= c.startMs && time <= c.endMs);
    // Map.
    const m = prep(mapRef.current, MAP_H);
    if (m) {
      m.fillStyle = '#0d1418';
      m.fillRect(0, 0, width, MAP_H);
      m.lineJoin = 'round';
      m.lineCap = 'round';
      const line = (from: number, to: number, color: string, w: number, only?: (time: number) => boolean) => {
        m.beginPath();
        let pen = false;
        for (let j = 0; j < pts.idx.length; j++) {
          const i = pts.idx[j];
          if (i < from || i > to || (only && !only(ride.t[i]))) {
            pen = false;
            continue;
          }
          if (pen) m.lineTo(MX(pts.x[j]), MY(pts.y[j]));
          else m.moveTo(MX(pts.x[j]), MY(pts.y[j]));
          pen = true;
        }
        m.strokeStyle = color;
        m.lineWidth = w;
        m.stroke();
      };
      line(0, Infinity, 'rgba(255,255,255,0.28)', 3);
      if (clips.length) line(0, Infinity, CLIPS, 3, inClip);
      line(i0, i1, ACCENT, 5);
    }
    // Elevation strip.
    const s = prep(stripRef.current, STRIP_H);
    if (s) {
      s.fillStyle = '#0d1418';
      s.fillRect(0, 0, width, STRIP_H);
      let lo = Infinity;
      let hi = -Infinity;
      for (const a of ride.altitude) {
        if (a < lo) lo = a;
        if (a > hi) hi = a;
      }
      if (!Number.isFinite(lo)) {
        lo = 0;
        hi = 1;
      }
      const Y = (a: number) => STRIP_H - 10 - ((a - lo) / (hi - lo || 1)) * (STRIP_H - 22);
      const area = (from: number, to: number, color: string) => {
        s.beginPath();
        s.moveTo(SX(ride.distance[from]), STRIP_H - 10);
        const stepI = Math.max(1, Math.floor((to - from) / 800));
        for (let i = from; i <= to; i += stepI) if (!Number.isNaN(ride.altitude[i])) s.lineTo(SX(ride.distance[i]), Y(ride.altitude[i]));
        s.lineTo(SX(ride.distance[to]), STRIP_H - 10);
        s.closePath();
        s.fillStyle = color;
        s.fill();
      };
      area(0, ride.t.length - 1, 'rgba(255,255,255,0.18)');
      for (const c of clips) area(indexAt(ride, c.startMs), indexAt(ride, c.endMs), 'rgba(56,189,248,0.35)');
      area(i0, i1, 'rgba(255,122,26,0.55)');
      for (const [i, color] of [
        [i0, START],
        [i1, END],
      ] as const) {
        const x = SX(ride.distance[i]);
        s.fillStyle = color;
        s.fillRect(x - 1.5, 4, 3, STRIP_H - 14);
        s.beginPath();
        s.arc(x, 10, 7, 0, Math.PI * 2);
        s.fill();
      }
    }
    // Markers on the map (drawn last, on top).
    if (m) {
      for (const [i, color] of [
        [i0, START],
        [i1, END],
      ] as const) {
        let j = pts.idx.findIndex((x) => x >= i);
        if (j < 0) j = pts.idx.length - 1;
        if (j < 0) continue;
        m.beginPath();
        m.arc(MX(pts.x[j]), MY(pts.y[j]), HANDLE_R, 0, Math.PI * 2);
        m.fillStyle = color;
        m.fill();
        m.strokeStyle = '#0d1418';
        m.lineWidth = 3;
        m.stroke();
      }
    }
  }, [width, pts, ride, i0, i1, clips, k]);

  const setFromIndex = (which: 'start' | 'end', i: number) => {
    const time = ride.t[Math.max(0, Math.min(ride.t.length - 1, i))];
    const r = latest.current;
    const next = which === 'start' ? { startMs: Math.min(time, r.endMs - 1000), endMs: r.endMs } : { startMs: r.startMs, endMs: Math.max(time, r.startMs + 1000) };
    latest.current = next;
    setRange(next);
  };
  const nearestOnMap = (px: number, py: number) => {
    let best = 0;
    let bd = Infinity;
    for (let j = 0; j < pts.idx.length; j++) {
      const d = (MX(pts.x[j]) - px) ** 2 + (MY(pts.y[j]) - py) ** 2;
      if (d < bd) {
        bd = d;
        best = j;
      }
    }
    return pts.idx[best] ?? 0;
  };
  const indexAtStrip = (px: number) => {
    const d = ((px - PAD) / (width - PAD * 2)) * total;
    let lo = 0;
    let hi = ride.distance.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ride.distance[mid] < d) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const handlers = (pick: (x: number, y: number) => number) => ({
    onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      const i = pick(e.clientX - r.left, e.clientY - r.top);
      // The marker closer (along the route) to where the pointer went down is the one moved.
      drag.current = Math.abs(i - i0) <= Math.abs(i - i1) ? 'start' : 'end';
      e.currentTarget.setPointerCapture(e.pointerId);
      setFromIndex(drag.current, i);
    },
    onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drag.current) return;
      const r = e.currentTarget.getBoundingClientRect();
      setFromIndex(drag.current, pick(e.clientX - r.left, e.clientY - r.top));
    },
    onPointerUp: () => {
      if (!drag.current) return;
      drag.current = null;
      onChange(latest.current);
    },
  });

  const du = convert.distanceUnit(units);
  const a = convert.distance(ride.distance[i0], units);
  const b = convert.distance(ride.distance[i1], units);
  const f = (v: number) => v.toFixed(1);
  return (
    <div className="route-picker" ref={boxRef}>
      <canvas ref={mapRef} className="route-picker-map" {...handlers(nearestOnMap)} />
      <canvas ref={stripRef} className="route-picker-strip" {...handlers((x) => indexAtStrip(x))} />
      <p className="small">
        <span className="dot" style={{ background: START }} /> {f(a)} {du} → <span className="dot" style={{ background: END }} /> {f(b)} {du} · {f(b - a)} {du}
        {clips.length ? (
          <>
            {' · '}
            <span className="dot" style={{ background: CLIPS }} /> {t('ov.area.clipsShown')}
          </>
        ) : null}
      </p>
    </div>
  );
}
