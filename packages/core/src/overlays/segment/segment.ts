import { decimalSeparator, tr, type CoreKey } from '../../i18n/index.ts';
import { bestBefore, formatLapTime, segmentAt, segmentStats, sortedSegments, type Segment, type SegmentStats } from '../../segments/segments.ts';
import type { MetricKey, RideData } from '../../telemetry/ride.ts';
import { dialPaint } from '../dial/common.ts';
import { drawCard } from '../dial/profile.ts';
import { drawText, font, labelSize } from '../draw.ts';
import { withAlpha } from '../panel/paint.ts';
import type { Ctx2D, OverlayDefinition, OverlayId, OverlayStyle } from '../types.ts';
import { convert, fmt } from '../units.ts';

// Segment gadgets: the segment being ridden (running time with tenths, figures so far, comparison with
// the best lap) and the laps table that fills up as the laps are finished. Both draw nothing outside
// the segments, so the same file can sit on the whole clip.

interface StatColumn {
  key: CoreKey;
  requires: MetricKey;
  value: (s: SegmentStats, st: OverlayStyle) => string;
  unit: (st: OverlayStyle) => string;
}

const STATS: StatColumn[] = [
  { key: 'seg.dist', requires: 'distance', value: (s, st) => fmt(convert.distance(s.distanceM, st.units), 2), unit: (st) => convert.distanceUnit(st.units) },
  { key: 'seg.gain', requires: 'elevationGain', value: (s, st) => fmt(convert.elevation(s.gainM, st.units), 0), unit: (st) => convert.elevationUnit(st.units) },
  { key: 'seg.avgSpeed', requires: 'speed', value: (s, st) => fmt(convert.speed(s.avgSpeed, st.units), 1), unit: (st) => convert.speedUnit(st.units) },
  { key: 'seg.avgHr', requires: 'heartRate', value: (s) => fmt(s.avgHeartRate, 0), unit: () => 'bpm' },
  { key: 'seg.avgPower', requires: 'power', value: (s) => fmt(s.avgPower, 0), unit: () => 'W' },
  { key: 'seg.avgCadence', requires: 'cadence', value: (s) => fmt(s.avgCadence, 0), unit: () => 'rpm' },
  { key: 'seg.loss', requires: 'elevationGain', value: (s, st) => fmt(convert.elevation(s.lossM, st.units), 0), unit: (st) => convert.elevationUnit(st.units) },
  { key: 'seg.maxSpeed', requires: 'speed', value: (s, st) => fmt(convert.speed(s.maxSpeed, st.units), 1), unit: (st) => convert.speedUnit(st.units) },
  { key: 'seg.maxHr', requires: 'heartRate', value: (s) => fmt(s.maxHeartRate, 0), unit: () => 'bpm' },
  { key: 'seg.avgGrade', requires: 'grade', value: (s) => fmt(s.avgGrade, 1), unit: () => '%' },
  { key: 'seg.avgTemp', requires: 'temperature', value: (s, st) => fmt(convert.temperature(s.avgTemperature, st.units), 0), unit: (st) => convert.temperatureUnit(st.units) },
];

function statsFor(ride: RideData, n: number, only?: CoreKey[]): StatColumn[] {
  const list = only ? only.map((k) => STATS.find((c) => c.key === k)!) : STATS;
  return list.filter((c) => ride.available.has(c.requires)).slice(0, n);
}

/** Text cut with "…" to fit maxW at the current font. */
function fitText(ctx: Ctx2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

/** Rounded badge; `edge` is its right end (align 'right') or its left end ('left'). Returns its width. */
function pill(ctx: Ctx2D, edge: number, cy: number, text: string, color: string, style: OverlayStyle, align: 'left' | 'right' = 'right') {
  const p = dialPaint(style);
  ctx.font = font(p.ts, 13, 800);
  const w = ctx.measureText(text).width + 22;
  const h = 24;
  const x = align === 'right' ? edge - w : edge;
  ctx.beginPath();
  ctx.arc(x + h / 2, cy, h / 2, Math.PI / 2, Math.PI * 1.5);
  ctx.arc(x + w - h / 2, cy, h / 2, -Math.PI / 2, Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = withAlpha(color, 0.22);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  drawText(ctx, text, x + w / 2, cy + 5, p.ts, { size: 13, weight: 800, align: 'center', tabular: false, color });
  return w;
}

/** Chequered flag icon. */
function flag(ctx: Ctx2D, x: number, y: number, s: number) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, 2.5, s);
  const cw = s * 0.18;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      ctx.fillStyle = (r + c) % 2 ? '#1a1a1a' : '#ffffff';
      ctx.fillRect(x + 2.5 + c * cw, y + r * cw, cw, cw);
    }
  }
}

const GOOD = '#4ade80';
const BAD = '#f87171';

// ---------------------------------------------------------------------------------------------

const LW = 460;
const LH = 300;

export const segmentLiveOverlay: OverlayDefinition = {
  id: 'segmentLive',
  label: 'Segment (live)',
  requires: 'elapsedTime',
  textOnly: false,
  size: () => ({ width: LW, height: LH }),
  draw: (ctx: Ctx2D, frame, style, octx) => {
    const ride = octx.ride;
    const cur = segmentAt(style.segments, frame.t);
    if (!cur) return;
    const { seg, running } = cur;
    const p = dialPaint(style);
    const lang = style.language;
    const dec = decimalSeparator(lang);
    // Running time from the exact frame instant (tenths move smoothly); the figures at the text rate.
    const timeStats = segmentStats(ride, seg, frame.t);
    const s = segmentStats(ride, seg, Math.max(seg.startMs + 1, frame.textSample.t)) ?? timeStats;
    if (!timeStats || !s) return;

    drawCard(ctx, LW, LH, style);
    // Header: flag, name, status.
    flag(ctx, 26, 22, 22);
    const badge = running ? `● ${tr(lang, 'seg.running')}` : tr(lang, 'seg.final');
    const bw = pill(ctx, LW - 22, 34, badge, running ? '#ff4d4d' : GOOD, style);
    ctx.font = font(p.ts, 22, 800);
    drawText(ctx, fitText(ctx, seg.name.toLocaleUpperCase(lang), LW - 80 - bw - 20), 62, 42, p.ts, { size: 22, weight: 800, tabular: false });

    // Big time.
    drawText(ctx, formatLapTime(timeStats.elapsedMs, dec), 26, 122, p.ts, { size: 68, weight: 800, color: running ? undefined : GOOD });

    // Comparison with the best lap/segment of the same kind finished before this one.
    const best = bestBefore(ride, style.segments, seg.kind, running ? frame.t : seg.startMs, seg.id);
    if (best) {
      if (running) {
        drawText(ctx, tr(lang, 'seg.best', { time: formatLapTime(best.ms, dec) }), 28, 154, p.ts, { size: 17, weight: 700, tabular: false, color: p.label });
      } else {
        const delta = timeStats.elapsedMs - best.ms;
        const d = `${delta < 0 ? '−' : '+'}${formatLapTime(Math.abs(delta), dec)} s`;
        const w = drawText(ctx, tr(lang, 'seg.vsBest', { delta: d }), 28, 154, p.ts, { size: 18, weight: 800, tabular: false, color: delta < 0 ? GOOD : BAD });
        if (delta < 0) pill(ctx, 28 + w + 14, 148, `★ ${tr(lang, seg.kind === 'lap' ? 'seg.newBestLap' : 'seg.newBestTime')}`, '#ffd23f', style, 'left');
      }
    }

    // Figures: two rows of three.
    const cols = statsFor(ride, 6);
    const cellW = (LW - 52) / 3;
    cols.forEach((c, i) => {
      const x = 26 + (i % 3) * cellW;
      const y = 196 + Math.floor(i / 3) * 52;
      const label = tr(lang, c.key);
      drawText(ctx, label, x, y, p.ts, { size: labelSize(ctx, p.ts, label, 12, 700, cellW - 8), weight: 700, tabular: false, color: p.label });
      const w = drawText(ctx, c.value(s, style), x, y + 28, p.ts, { size: 24, weight: 800 });
      drawText(ctx, c.unit(style), x + w + 5, y + 28, p.ts, { size: 13, weight: 600, tabular: false, color: p.label });
    });
    if (cols.length > 3) {
      ctx.beginPath();
      ctx.moveTo(26, 236);
      ctx.lineTo(LW - 26, 236);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  },
};

// ---------------------------------------------------------------------------------------------

const TW = 620;
const ROWS = 8;
const ROW_H = 34;
const HEAD = 84;
const TH = HEAD + ROWS * ROW_H + 18;

export const segmentLapsOverlay: OverlayDefinition = {
  id: 'segmentLaps',
  label: 'Laps table',
  requires: 'elapsedTime',
  textOnly: false,
  size: () => ({ width: TW, height: TH }),
  draw: (ctx: Ctx2D, frame, style, octx) => {
    const ride = octx.ride;
    const all = sortedSegments(style.segments);
    const started = all.filter((seg) => seg.startMs <= frame.t);
    if (!started.length) return;
    const p = dialPaint(style);
    const lang = style.language;
    const dec = decimalSeparator(lang);
    const laps = all.every((seg) => seg.kind === 'lap');

    // Best finished time of each kind, for the highlight.
    const bestMs: Partial<Record<Segment['kind'], number>> = {};
    for (const seg of started) {
      if (seg.endMs > frame.t) continue;
      const ms = seg.endMs - seg.startMs;
      if (!(ms >= (bestMs[seg.kind] ?? Infinity))) bestMs[seg.kind] = ms;
    }

    const rows = started.slice(-ROWS);
    // The card grows with the laps (the canvas keeps its size, for the video).
    drawCard(ctx, TW, HEAD + rows.length * ROW_H + 18, style);
    flag(ctx, 26, 20, 22);
    drawText(ctx, tr(lang, laps ? 'seg.lapsTitle' : 'seg.segmentsTitle'), 62, 40, p.ts, { size: 22, weight: 800, tabular: false });
    const doneCount = started.filter((seg) => seg.endMs <= frame.t).length;
    drawText(ctx, `${doneCount}/${all.length}`, TW - 26, 40, p.ts, { size: 20, weight: 800, align: 'right' });

    // Columns: name, time, then up to three figures.
    const cols = statsFor(ride, 3, ['seg.avgSpeed', 'seg.avgHr', 'seg.avgPower', 'seg.gain', 'seg.avgCadence']);
    const timeRight = 300;
    const colRight = (i: number) => timeRight + ((TW - 26 - timeRight) * (i + 1)) / cols.length;
    const hy = HEAD - 14;
    drawText(ctx, tr(lang, 'seg.time'), timeRight, hy, p.ts, { size: 12, weight: 700, align: 'right', tabular: false, color: p.label });
    cols.forEach((c, i) => {
      const label = `${tr(lang, c.key)} (${c.unit(style)})`;
      const maxW = (TW - 26 - timeRight) / cols.length - 8;
      drawText(ctx, label, colRight(i), hy, p.ts, { size: labelSize(ctx, p.ts, label, 12, 700, maxW), weight: 700, align: 'right', tabular: false, color: p.label });
    });
    ctx.beginPath();
    ctx.moveTo(22, HEAD - 4);
    ctx.lineTo(TW - 22, HEAD - 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();

    rows.forEach((seg, i) => {
      const y = HEAD + i * ROW_H;
      const mid = y + ROW_H / 2;
      const running = seg.endMs > frame.t;
      const st = segmentStats(ride, seg, running ? frame.t : Infinity);
      const textSt = running ? segmentStats(ride, seg, Math.max(seg.startMs + 1, frame.textSample.t)) ?? st : st;
      if (!st || !textSt) return;
      const isBest = !running && bestMs[seg.kind] === seg.endMs - seg.startMs && rows.filter((r) => r.kind === seg.kind && r.endMs <= frame.t).length > 1;
      if (running) {
        ctx.fillStyle = withAlpha(style.accentColor, 0.18);
        ctx.fillRect(22, y + 2, TW - 44, ROW_H - 4);
        ctx.fillStyle = style.accentColor;
        ctx.fillRect(22, y + 2, 4, ROW_H - 4);
      }
      ctx.font = font(p.ts, 18, 700);
      const name = fitText(ctx, seg.name, timeRight - 150);
      drawText(ctx, name, 36, mid + 6, p.ts, { size: 18, weight: 700, tabular: false, color: running ? undefined : 'rgba(255,255,255,0.9)' });
      if (isBest) drawText(ctx, '★', timeRight - 118, mid + 6, p.ts, { size: 16, weight: 800, tabular: false, color: '#ffd23f' });
      drawText(ctx, formatLapTime(st.elapsedMs, dec), timeRight, mid + 7, p.ts, { size: 20, weight: 800, align: 'right', color: isBest ? GOOD : undefined });
      cols.forEach((c, k) => {
        drawText(ctx, c.value(textSt, style), colRight(k), mid + 7, p.ts, { size: 18, weight: 700, align: 'right', color: running ? undefined : 'rgba(255,255,255,0.88)' });
      });
    });
  },
};

export const segmentOverlays: OverlayDefinition[] = [segmentLiveOverlay, segmentLapsOverlay];

const IDS = new Set<OverlayId>(segmentOverlays.map((o) => o.id));

/** True for the segment gadgets (their own section in the app). */
export function isSegmentOverlay(id: OverlayId): boolean {
  return IDS.has(id);
}
