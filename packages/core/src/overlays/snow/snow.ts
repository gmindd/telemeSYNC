import { pick, tr, type Lang } from '../../i18n/index.ts';
import { formatClock } from '../../metrics/running.ts';
import { detectRuns, runAt, slopeAt, slopeDegrees, type SnowRun } from '../../metrics/snow.ts';
import { segmentStats } from '../../segments/segments.ts';
import type { RideData } from '../../telemetry/ride.ts';
import type { Sport } from '../../telemetry/types.ts';
import { dialPaint, type DialColors } from '../dial/common.ts';
import { beforeStart, dialSpec, elevationLossAt, makeDial, type DialSpec } from '../dial/dials.ts';
import { drawCard } from '../dial/profile.ts';
import { drawText, labelSize } from '../draw.ts';
import { drawIcon, withAlpha } from '../panel/paint.ts';
import { GOOD, pill } from '../segment/segment.ts';
import { DIAL_SLUG, METRIC_SLUGS, SPORT_SLUGS } from '../slugs.ts';
import { makeTextOverlay, type TextMetric } from '../text/metrics.ts';
import type { OverlayDefinition, OverlayId } from '../types.ts';
import { convert, fmt } from '../units.ts';

// Ski and snowboard gadgets: slope in degrees, vertical drop, top speed, dials on an icy rim, the run
// being skied (or the lift ride up) and the table of the day's runs.

const SNOW: Sport[] = ['snow'];
const ICE: DialColors = { from: '#38bdf8', to: '#e0f2fe' };

const snowSlug = (lang: Lang | undefined, metric: string, dial = false) =>
  [pick(SPORT_SLUGS.snow, lang), dial ? pick(DIAL_SLUG, lang) : '', pick(METRIC_SLUGS[metric] ?? [metric, metric, metric, metric, metric], lang)].filter(Boolean).join('-');

const maxCache = new WeakMap<RideData, Float64Array>();

/** Top speed from the start up to each sample (m/s). */
function maxSpeedArray(ride: RideData): Float64Array {
  let a = maxCache.get(ride);
  if (!a) {
    a = new Float64Array(ride.t.length);
    let m = 0;
    for (let i = 0; i < a.length; i++) {
      if (ride.speed[i] > m) m = ride.speed[i];
      a[i] = m;
    }
    maxCache.set(ride, a);
  }
  return a;
}

const maxSpeedAt = (ride: RideData, index: number) => maxSpeedArray(ride)[Math.max(0, Math.min(ride.t.length - 1, index))];

/** Downhill slope at a sample, in degrees (0 on the flat and going up). */
function downSlope(ride: RideData, fractionalIndex: number): { deg: number; pct: number } {
  const pct = slopeAt(ride, fractionalIndex);
  const down = Number.isFinite(pct) ? Math.max(0, -pct) : NaN;
  return { deg: slopeDegrees(down), pct: down };
}

// ----------------------------------------------------------------------------------- Text gadgets

const TEXTS: TextMetric[] = [
  {
    id: 'slope',
    requires: 'grade',
    sports: SNOW,
    template: () => '88',
    value: (s, _st, ride) => ({ text: fmt(downSlope(ride, s.fractionalIndex).deg, 0) }),
    unit: () => '°',
    hasSecond: () => true,
    second: (s, _st, ride) => ({ text: fmt(downSlope(ride, s.fractionalIndex).pct, 0), unit: '%' }),
  },
  {
    id: 'verticalDrop',
    requires: 'altitude',
    sports: SNOW,
    template: (st) => (st.units.system === 'metric' ? '88888' : '888888'),
    value: (s, st, ride) => ({ text: fmt(beforeStart(ride, s) ? 0 : convert.elevation(elevationLossAt(ride, s), st.units), 0) }),
    unit: (st) => convert.elevationUnit(st.units),
  },
  {
    id: 'maxSpeed',
    requires: 'speed',
    sports: SNOW,
    template: () => '188,8',
    value: (s, st, ride) => ({ text: fmt(beforeStart(ride, s) ? 0 : convert.speed(maxSpeedAt(ride, s.index), st.units), 1) }),
    unit: (st) => convert.speedUnit(st.units),
  },
];

const textOverlays = TEXTS.map((m) => ({ ...makeTextOverlay(m), slugFor: (lang: Lang | undefined) => snowSlug(lang, m.id) }));

// ------------------------------------------------------------------------------------------ Dials

function snowVariant(base: OverlayId, id: OverlayId, metric: string, patch: Partial<DialSpec> = {}): DialSpec {
  const spec = dialSpec(base);
  return {
    ...spec,
    ...patch,
    id,
    rim: 'snow',
    sports: SNOW,
    labelFor: (lang) => tr(lang, 'overlay.dial', { name: tr(lang, patch.name ?? spec.name) }),
    slugFor: (lang) => snowSlug(lang, metric, true),
  };
}

const DIALS: DialSpec[] = [
  snowVariant('dialSpeed', 'snowDialSpeed', 'speed', { colors: { from: '#2563eb', to: '#67e8f9' } }),
  {
    id: 'snowDialSlope',
    name: 'metric.slope',
    requires: 'grade',
    colors: { from: '#22c55e', to: '#ef4444' },
    icon: 'mountain',
    iconColor: '#ffffff',
    rim: 'snow',
    sports: SNOW,
    labelFor: (lang) => tr(lang, 'overlay.dial', { name: tr(lang, 'metric.slope') }),
    slugFor: (lang) => snowSlug(lang, 'slope', true),
    template: () => '88',
    value: (s, _st, ride) => fmt(downSlope(ride, s.fractionalIndex).deg, 0),
    unit: () => '°',
    inlineUnit: true,
    // Green to red as the slope steepens (0–40°).
    arc: (s, _st, ride) => ({ f: downSlope(ride, s.fractionalIndex).deg / 40, origin: 0 }),
    below: (s, _st, ride) => [{ label: '%', value: fmt(downSlope(ride, s.fractionalIndex).pct, 0) }],
  },
  {
    id: 'snowDialVertical',
    name: 'metric.verticalDrop',
    requires: 'altitude',
    colors: ICE,
    icon: 'down',
    iconColor: '#7dd3fc',
    rim: 'snow',
    sports: SNOW,
    labelFor: (lang) => tr(lang, 'overlay.dial', { name: tr(lang, 'metric.verticalDrop') }),
    slugFor: (lang) => snowSlug(lang, 'verticalDrop', true),
    template: (st) => (st.units.system === 'metric' ? '88888' : '888888'),
    value: (s, st, ride) => fmt(beforeStart(ride, s) ? 0 : convert.elevation(elevationLossAt(ride, s), st.units), 0),
    unit: (st) => convert.elevationUnit(st.units),
    arc: (s, _st, ride) => {
      const total = elevationLossAt(ride, { ...s, index: ride.t.length - 1 });
      return { f: total > 0 ? elevationLossAt(ride, s) / total : 0, origin: 0 };
    },
    below: (s, st, ride) => {
      const runs = detectRuns(ride);
      return [{ label: tr(st.language, 'snow.runsTitle'), value: String(runs.filter((r) => r.endMs <= s.t).length) }];
    },
  },
  snowVariant('dialAltitude', 'snowDialAltitude', 'altitude', { colors: ICE }),
  snowVariant('dialHeartRate', 'snowDialHeartRate', 'heartRate'),
  snowVariant('dialTime', 'snowDialTime', 'elapsedTime', { colors: ICE }),
  snowVariant('dialTemperature', 'snowDialTemperature', 'temperature', { colors: { from: '#0ea5e9', to: '#e0f2fe' }, icon: 'snowflake', iconColor: '#e0f2fe' }),
];

const dialOverlays = DIALS.map(makeDial);

// ---------------------------------------------------------------------------------- Run (live)

const LW = 460;
const LH = 300;

const runLiveOverlay: OverlayDefinition = {
  id: 'snowRunLive',
  label: 'Run (live)',
  requires: 'altitude',
  sports: SNOW,
  textOnly: false,
  labelFor: (lang) => tr(lang, 'overlay.snowRunLive'),
  slugFor: (lang) => snowSlug(lang, 'snowRunLive'),
  size: () => ({ width: LW, height: LH }),
  draw: (ctx, frame, style, octx) => {
    const ride = octx.ride;
    const runs = detectRuns(ride);
    if (!runs.length) return;
    const where = runAt(runs, frame.t);
    // After a run its result stays for 15 s; on the lift and before the first run, the climb.
    const justDone = where.last && frame.t - where.last.endMs < 15_000 ? where.last : undefined;
    const run = where.run ?? justDone;
    if (!run && where.phase === 'after') return;
    const p = dialPaint(style);
    const lang = style.language;
    drawCard(ctx, LW, LH, style);
    drawIcon(ctx, 'snowflake', 38, 34, 26, '#bae6fd');

    if (run) {
      const live = !!where.run;
      const s = segmentStats(ride, run, live ? Math.max(run.startMs + 1, frame.textSample.t) : Infinity);
      const timeMs = (live ? frame.t : run.endMs) - run.startMs;
      pill(ctx, LW - 22, 34, live ? `● ${tr(lang, 'seg.running')}` : tr(lang, 'seg.final'), live ? '#ff4d4d' : GOOD, style);
      drawText(ctx, tr(lang, 'snow.run', { n: run.n }), 62, 42, p.ts, { size: 22, weight: 800, tabular: false });
      // Big: speed now while skiing, the run time once finished.
      const speed = live ? convert.speed(frame.textSample.speed, style.units) : convert.speed(s?.avgSpeed ?? NaN, style.units);
      const w = drawText(ctx, fmt(speed, 0), 26, 124, p.ts, { size: 72, weight: 800, color: live ? undefined : GOOD });
      drawText(ctx, convert.speedUnit(style.units), 26 + w + 8, 124, p.ts, { size: 22, weight: 700, tabular: false, color: p.label });
      drawText(ctx, formatClock(timeMs), LW - 26, 124, p.ts, { size: 40, weight: 800, align: 'right' });
      const cells: [string, string, string][] = [
        [tr(lang, 'snow.drop'), fmt(convert.elevation(s?.lossM ?? NaN, style.units), 0), convert.elevationUnit(style.units)],
        [tr(lang, 'seg.maxSpeed'), fmt(convert.speed(s?.maxSpeed ?? NaN, style.units), 0), convert.speedUnit(style.units)],
        [tr(lang, 'seg.avgSpeed'), fmt(convert.speed(s?.avgSpeed ?? NaN, style.units), 0), convert.speedUnit(style.units)],
        [tr(lang, 'seg.dist'), fmt(convert.distance(s?.distanceM ?? NaN, style.units), 2), convert.distanceUnit(style.units)],
      ];
      const cellW = (LW - 52) / 2;
      cells.forEach(([label, value, unit], i) => {
        const x = 26 + (i % 2) * cellW;
        const y = 178 + Math.floor(i / 2) * 58;
        drawText(ctx, label, x, y, p.ts, { size: labelSize(ctx, p.ts, label, 12, 700, cellW - 8), weight: 700, tabular: false, color: p.label });
        const vw = drawText(ctx, value, x, y + 30, p.ts, { size: 26, weight: 800 });
        drawText(ctx, unit, x + vw + 5, y + 30, p.ts, { size: 13, weight: 600, tabular: false, color: p.label });
      });
      return;
    }

    // On the lift: altitude now and how far to the top of the next run.
    drawText(ctx, tr(lang, 'snow.lift'), 62, 42, p.ts, { size: 22, weight: 800, tabular: false });
    const alt = frame.textSample.altitude;
    const w = drawText(ctx, fmt(convert.elevation(alt, style.units), 0), 26, 130, p.ts, { size: 72, weight: 800 });
    drawText(ctx, convert.elevationUnit(style.units), 26 + w + 8, 130, p.ts, { size: 22, weight: 700, tabular: false, color: p.label });
    const next = where.next;
    if (next) {
      const topAlt = ride.altitude[Math.max(0, ride.t.findIndex((x) => x >= next.startMs))];
      const left = Math.max(0, topAlt - alt);
      if (Number.isFinite(left)) drawText(ctx, tr(lang, 'snow.toTop', { m: `${fmt(convert.elevation(left, style.units), 0)} ${convert.elevationUnit(style.units)}` }), 26, 176, p.ts, { size: 22, weight: 800, tabular: false, color: '#bae6fd' });
    }
    const done = runs.filter((r) => r.endMs <= frame.t);
    if (done.length) {
      const total = done.reduce((s, r) => s + r.dropM, 0);
      drawText(ctx, `${tr(lang, 'snow.today')} · ${done.length} · ${fmt(convert.elevation(total, style.units), 0)} ${convert.elevationUnit(style.units)}`, 26, LH - 34, p.ts, { size: 17, weight: 700, tabular: false, color: p.label });
    }
  },
};

// ---------------------------------------------------------------------------------- Runs table

const TW = 600;
const ROWS = 8;
const ROW_H = 34;
const HEAD = 84;

const runsTableOverlay: OverlayDefinition = {
  id: 'snowRuns',
  label: 'Runs table',
  requires: 'altitude',
  sports: SNOW,
  textOnly: false,
  labelFor: (lang) => tr(lang, 'overlay.snowRuns'),
  slugFor: (lang) => snowSlug(lang, 'snowRuns'),
  size: () => ({ width: TW, height: HEAD + ROWS * ROW_H + 18 }),
  draw: (ctx, frame, style, octx) => {
    const ride = octx.ride;
    const runs = detectRuns(ride);
    const started = runs.filter((r) => r.startMs <= frame.t);
    if (!started.length) return;
    const p = dialPaint(style);
    const lang = style.language;
    const done = started.filter((r) => r.endMs <= frame.t);
    let fastest: SnowRun | undefined;
    for (const r of done) {
      const s = segmentStats(ride, r);
      const f = fastest ? segmentStats(ride, fastest) : null;
      if (s && (!f || s.maxSpeed > f.maxSpeed)) fastest = r;
    }
    const rows = started.slice(-ROWS);
    drawCard(ctx, TW, HEAD + rows.length * ROW_H + 18, style);
    drawIcon(ctx, 'snowflake', 38, 32, 24, '#bae6fd');
    drawText(ctx, tr(lang, 'snow.runsTitle'), 62, 40, p.ts, { size: 22, weight: 800, tabular: false });
    const total = done.reduce((s, r) => s + r.dropM, 0);
    drawText(ctx, `${done.length} · ${fmt(convert.elevation(total, style.units), 0)} ${convert.elevationUnit(style.units)}`, TW - 26, 40, p.ts, { size: 20, weight: 800, align: 'right' });

    const cols: [string, (r: SnowRun, at: number) => string][] = [
      [`${tr(lang, 'snow.drop')} (${convert.elevationUnit(style.units)})`, (r, at) => fmt(convert.elevation(segmentStats(ride, r, at)?.lossM ?? NaN, style.units), 0)],
      [`${tr(lang, 'seg.maxSpeed')} (${convert.speedUnit(style.units)})`, (r, at) => fmt(convert.speed(segmentStats(ride, r, at)?.maxSpeed ?? NaN, style.units), 0)],
      [`${tr(lang, 'seg.avgSpeed')} (${convert.speedUnit(style.units)})`, (r, at) => fmt(convert.speed(segmentStats(ride, r, at)?.avgSpeed ?? NaN, style.units), 0)],
    ];
    const timeRight = 190;
    const colRight = (i: number) => timeRight + ((TW - 26 - timeRight) * (i + 1)) / cols.length;
    const hy = HEAD - 14;
    drawText(ctx, '#', 36, hy, p.ts, { size: 12, weight: 700, tabular: false, color: p.label });
    drawText(ctx, tr(lang, 'seg.time'), timeRight, hy, p.ts, { size: 12, weight: 700, align: 'right', tabular: false, color: p.label });
    cols.forEach(([label], i) => {
      const maxW = (TW - 26 - timeRight) / cols.length - 8;
      drawText(ctx, label, colRight(i), hy, p.ts, { size: labelSize(ctx, p.ts, label, 12, 700, maxW), weight: 700, align: 'right', tabular: false, color: p.label });
    });
    ctx.beginPath();
    ctx.moveTo(22, HEAD - 4);
    ctx.lineTo(TW - 22, HEAD - 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();
    rows.forEach((r, i) => {
      const y = HEAD + i * ROW_H;
      const mid = y + ROW_H / 2;
      const live = r.endMs > frame.t;
      const at = live ? Math.max(r.startMs + 1, frame.textSample.t) : Infinity;
      if (live) {
        ctx.fillStyle = withAlpha(style.accentColor, 0.18);
        ctx.fillRect(22, y + 2, TW - 44, ROW_H - 4);
        ctx.fillStyle = style.accentColor;
        ctx.fillRect(22, y + 2, 4, ROW_H - 4);
      }
      drawText(ctx, String(r.n), 36, mid + 6, p.ts, { size: 18, weight: 800, color: live ? undefined : 'rgba(255,255,255,0.9)' });
      const best = !live && fastest === r && done.length > 1;
      if (best) drawText(ctx, '★', 70, mid + 6, p.ts, { size: 16, weight: 800, tabular: false, color: '#ffd23f' });
      drawText(ctx, formatClock((live ? frame.t : r.endMs) - r.startMs), timeRight, mid + 7, p.ts, { size: 20, weight: 800, align: 'right' });
      cols.forEach(([, value], k) => {
        drawText(ctx, value(r, at), colRight(k), mid + 7, p.ts, { size: 18, weight: 700, align: 'right', color: best && k === 1 ? GOOD : live ? undefined : 'rgba(255,255,255,0.88)' });
      });
    });
  },
};

export const snowOverlays: OverlayDefinition[] = [...textOverlays, ...dialOverlays, runLiveOverlay, runsTableOverlay];

