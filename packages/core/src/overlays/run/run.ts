import { pick, tr, type Lang } from '../../i18n/index.ts';
import {
  distanceAt,
  formatClock,
  formatPace,
  ghostAt,
  gradeAdjustedSpeed,
  paceUnit,
  paceUnitM,
  runSpeedAt,
  splitAt,
  splits,
  verticalSpeedAt,
  type Split,
} from '../../metrics/running.ts';
import { segmentStats } from '../../segments/segments.ts';
import type { MetricKey, RideData } from '../../telemetry/ride.ts';
import type { Sport } from '../../telemetry/types.ts';
import { lowerIndex } from '../../util/search.ts';
import { dialPaint, type DialColors } from '../dial/common.ts';
import { beforeStart, dialSpec, elevationLossAt, makeDial, type DialSpec } from '../dial/dials.ts';
import { drawCard } from '../dial/profile.ts';
import { drawText, font, labelSize } from '../draw.ts';
import { drawIcon, withAlpha } from '../panel/paint.ts';
import { BAD, GOOD, pill } from '../segment/segment.ts';
import { DIAL_SLUG, METRIC_SLUGS, SPORT_SLUGS } from '../slugs.ts';
import { makeTextOverlay, type TextMetric } from '../text/metrics.ts';
import type { Ctx2D, OverlayDefinition, OverlayId, OverlayStyle } from '../types.ts';
import { convert, fmt } from '../units.ts';

// Running and trail gadgets: pace, grade adjusted pace, cadence in steps, vertical speed, round dials
// on an athletics track, the splits table and the race against a personal record (the PR ghost).

const RUN: Sport[] = ['running'];

// -------------------------------------------------------------------------------------- Helpers

const timerCache = new WeakMap<RideData, Float64Array>();

/** Moving time up to each sample (pauses longer than the gap threshold left out), ms. */
function timerArray(ride: RideData): Float64Array {
  let a = timerCache.get(ride);
  if (!a) {
    a = new Float64Array(ride.t.length);
    for (let i = 1; i < ride.t.length; i++) {
      const dt = ride.t[i] - ride.t[i - 1];
      a[i] = a[i - 1] + (dt <= ride.gapThresholdMs ? dt : 0);
    }
    timerCache.set(ride, a);
  }
  return a;
}

/** Average speed from the start to t over the moving time (m/s), as running watches give average pace. */
export function avgRunSpeed(ride: RideData, t: number): number {
  const i = lowerIndex(ride.t, t);
  if (i < 0) return NaN;
  const timer = timerArray(ride);
  const j = Math.min(i, ride.t.length - 1);
  const extra = j < ride.t.length - 1 && ride.t[j + 1] - ride.t[j] <= ride.gapThresholdMs ? Math.max(0, t - ride.t[j]) : 0;
  const ms = timer[j] + Math.min(extra, ride.t[Math.min(j + 1, ride.t.length - 1)] - ride.t[j]);
  return ms > 5000 ? distanceAt(ride, t) / (ms / 1000) : NaN;
}

const rangeCache = new WeakMap<RideData, { lo: number; hi: number }>();

/** Speed range of the ride's running (10th to 98th percentile while moving), for the pace arc. */
function runSpeedRange(ride: RideData): { lo: number; hi: number } {
  let r = rangeCache.get(ride);
  if (!r) {
    const v = Array.from(ride.speed).filter((x) => x > 0.6).sort((a, b) => a - b);
    const q = (f: number) => v[Math.min(v.length - 1, Math.floor(f * v.length))] ?? NaN;
    const lo = q(0.1) * 0.85;
    const hi = q(0.98) * 1.05;
    r = Number.isFinite(lo) && hi > lo ? { lo, hi } : { lo: 2, hi: 5.5 };
    rangeCache.set(ride, r);
  }
  return r;
}

/** Slug "corrida-<metric>" / "corrida-mostrador-<metric>" in the app language. */
const runSlug = (lang: Lang | undefined, metric: string, dial = false) =>
  [pick(SPORT_SLUGS.running, lang), dial ? pick(DIAL_SLUG, lang) : '', pick(METRIC_SLUGS[metric] ?? [metric, metric, metric, metric, metric], lang)].filter(Boolean).join('-');

const spm = (st: OverlayStyle) => tr(st.language, 'unit.spm');

// ----------------------------------------------------------------------------------- Text gadgets

const TEXTS: TextMetric[] = [
  {
    id: 'pace',
    requires: 'distance',
    sports: RUN,
    template: () => '88:88',
    value: (s, st, ride) => ({ text: formatPace(runSpeedAt(ride, s.t), st.units) }),
    unit: (st) => paceUnit(st.units),
  },
  {
    id: 'gap',
    requires: 'grade',
    sports: RUN,
    template: () => '88:88',
    value: (s, st, ride) => ({ text: formatPace(gradeAdjustedSpeed(runSpeedAt(ride, s.t), s.grade), st.units) }),
    unit: (st) => paceUnit(st.units),
  },
  {
    id: 'runCadence',
    requires: 'cadence',
    sports: RUN,
    template: () => '188',
    value: (s) => ({ text: fmt(s.cadence, 0) }),
    unit: spm,
  },
  {
    id: 'verticalSpeed',
    requires: 'altitude',
    sports: RUN,
    template: (st) => (st.units.system === 'metric' ? '-8888' : '-88888'),
    value: (s, st, ride) => {
      const v = verticalSpeedAt(ride, s.t);
      return { text: fmt(convert.elevation(v, st.units), 0), color: !Number.isFinite(v) ? undefined : v > 50 ? '#4ade80' : v < -50 ? '#4fc3f7' : undefined };
    },
    unit: (st) => `${convert.elevationUnit(st.units)}/h`,
  },
];

const textOverlays = TEXTS.map((m) => ({ ...makeTextOverlay(m), slugFor: (lang: Lang | undefined) => runSlug(lang, m.id) }));

// ------------------------------------------------------------------------------------------ Dials

const TRACK_COLORS: DialColors = { from: '#ff6a2b', to: '#ffd166' };

/** A cycling dial on the athletics track, under a running id. */
function runVariant(base: OverlayId, id: OverlayId, metric: string, patch: Partial<DialSpec> = {}): DialSpec {
  const spec = dialSpec(base);
  return {
    ...spec,
    ...patch,
    id,
    rim: 'track',
    sports: RUN,
    labelFor: (lang) => tr(lang, 'overlay.dial', { name: tr(lang, patch.name ?? spec.name) }),
    slugFor: (lang) => runSlug(lang, metric, true),
  };
}

const DIALS: DialSpec[] = [
  {
    id: 'runDialPace',
    name: 'metric.pace',
    requires: 'distance',
    colors: TRACK_COLORS,
    icon: 'shoe',
    rim: 'track',
    sports: RUN,
    labelFor: (lang) => tr(lang, 'overlay.dial', { name: tr(lang, 'metric.pace') }),
    slugFor: (lang) => runSlug(lang, 'pace', true),
    template: () => '88:88',
    value: (s, st, ride) => formatPace(runSpeedAt(ride, s.t), st.units),
    unit: (st) => paceUnit(st.units),
    arc: (s, _st, ride) => {
      const r = runSpeedRange(ride);
      const v = runSpeedAt(ride, s.t);
      return { f: Number.isFinite(v) ? (v - r.lo) / (r.hi - r.lo) : NaN, origin: 0 };
    },
    below: (s, st, ride) => {
      const before = beforeStart(ride, s);
      const list = splits(ride, paceUnitM(st.units));
      const last = [...list].reverse().find((sp) => sp.endMs <= s.t && sp.distanceM >= paceUnitM(st.units) - 1);
      const unit = convert.distanceUnit(st.units).toUpperCase();
      return [
        { label: tr(st.language, 'dial.avg'), value: before ? '—' : formatPace(avgRunSpeed(ride, s.t), st.units) },
        { label: tr(st.language, 'run.lastSplit', { unit }), value: last ? formatPace(last.distanceM / ((last.endMs - last.startMs) / 1000), st.units) : '—' },
      ];
    },
  },
  runVariant('dialHeartRate', 'runDialHeartRate', 'heartRate'),
  runVariant('dialCadence', 'runDialCadence', 'runCadence', { name: 'metric.runCadence', icon: 'steps', colors: { from: '#7c3aed', to: '#f0abfc' }, unit: spm }),
  runVariant('dialDistance', 'runDialDistance', 'distance', { icon: 'route' }),
  runVariant('dialTime', 'runDialTime', 'elapsedTime'),
  runVariant('dialAltitude', 'runDialAltitude', 'altitude'),
  runVariant('dialGrade', 'runDialGrade', 'grade'),
  {
    id: 'runDialVertical',
    name: 'metric.verticalSpeed',
    requires: 'altitude',
    colors: { from: '#0ea5e9', to: '#4ade80' },
    icon: 'updown',
    rim: 'track',
    sports: RUN,
    labelFor: (lang) => tr(lang, 'overlay.dial', { name: tr(lang, 'metric.verticalSpeed') }),
    slugFor: (lang) => runSlug(lang, 'verticalSpeed', true),
    template: (st) => (st.units.system === 'metric' ? '-8888' : '-88888'),
    value: (s, st, ride) => fmt(convert.elevation(verticalSpeedAt(ride, s.t), st.units), 0),
    unit: (st) => `${convert.elevationUnit(st.units)}/h`,
    arc: (s, _st, ride) => {
      const v = verticalSpeedAt(ride, s.t);
      return { f: Number.isFinite(v) ? 0.5 + Math.max(-1, Math.min(1, v / 1500)) / 2 : NaN, origin: 0.5 };
    },
    below: (s, st, ride) => {
      const before = beforeStart(ride, s);
      const u = ` ${convert.elevationUnit(st.units)}`;
      return [
        { icon: 'up', iconColor: '#4ade80', value: `${fmt(before ? NaN : convert.elevation(s.elevationGain, st.units), 0)}${u}` },
        { icon: 'down', iconColor: '#4fc3f7', value: `${fmt(before ? NaN : convert.elevation(elevationLossAt(ride, s), st.units), 0)}${u}` },
      ];
    },
  },
];

const dialOverlays = DIALS.map(makeDial);

// ------------------------------------------------------------------------------------ Running man

/**
 * A runner seen from the side, facing right, feet at (x, footY), `h` tall. `phase` (radians) moves
 * the legs and arms through the stride; NaN = standing.
 */
export function drawRunner(ctx: Ctx2D, x: number, footY: number, h: number, phase: number, color: string, alpha = 1, outline?: string) {
  const moving = Number.isFinite(phase);
  const ph = moving ? phase : 0;
  const bob = moving ? Math.abs(Math.sin(ph)) * h * 0.035 : 0;
  const hipX = x;
  const hipY = footY - h * 0.5 - bob;
  const lean = moving ? 0.18 : 0.04;
  const shX = hipX + Math.sin(lean) * h * 0.3;
  const shY = hipY - Math.cos(lean) * h * 0.3;
  const seg = (x0: number, y0: number, len: number, ang: number) => [x0 + Math.sin(ang) * len, y0 + Math.cos(ang) * len] as const;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const limb = (pts: (readonly [number, number])[], width: number, shade: number) => {
    const path = () => {
      ctx.beginPath();
      pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    };
    if (outline) {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = outline;
      ctx.lineWidth = width + Math.max(2, h * 0.04);
      path();
      ctx.stroke();
      ctx.strokeStyle = color;
    }
    ctx.globalAlpha = alpha * shade;
    ctx.lineWidth = width;
    path();
    ctx.stroke();
  };
  const legLen = h * 0.25;
  const armLen = h * 0.16;
  for (const [k, shade] of [
    [Math.PI, 0.55],
    [0, 1],
  ] as const) {
    const s = moving ? Math.sin(ph + k) : k ? -0.15 : 0.15;
    // Leg: thigh swings ±0.65 rad; the shin folds back when the leg comes forward.
    const thigh = s * 0.65;
    const bend = moving ? 0.25 + 0.95 * Math.max(0, Math.cos(ph + k)) : 0.05;
    const knee = seg(hipX, hipY, legLen, thigh);
    const foot = seg(knee[0], knee[1], legLen, thigh - bend);
    limb([[hipX, hipY], knee, foot], h * 0.075, shade);
    // Arm: opposite to the leg, elbow bent forward.
    const upper = -s * 0.7;
    const elbow = seg(shX, shY, armLen, upper);
    const hand = seg(elbow[0], elbow[1], armLen * 0.9, upper + (moving ? 1.6 : 0.4));
    limb([[shX, shY], elbow, hand], h * 0.06, shade);
  }
  limb([[hipX, hipY], [shX, shY]], h * 0.09, 1);
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(shX + h * 0.04, shY - h * 0.1, h * 0.075, 0, Math.PI * 2);
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = Math.max(2, h * 0.04);
    ctx.stroke();
  }
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------------- Splits table

const SW = 600;
const S_ROWS = 8;
const S_ROW_H = 34;
const S_HEAD = 84;

interface SplitColumn {
  key: Parameters<typeof tr>[1];
  requires: MetricKey;
  value: (sp: Split, st: OverlayStyle, ride: RideData, at: number) => string;
  unit: (st: OverlayStyle) => string;
}

const SPLIT_COLUMNS: SplitColumn[] = [
  {
    key: 'run.pace',
    requires: 'distance',
    value: (sp, st, ride, at) => {
      const s = segmentStats(ride, sp, at);
      return s ? formatPace(s.avgSpeed, st.units) : '—';
    },
    unit: (st) => paceUnit(st.units),
  },
  {
    key: 'seg.avgHr',
    requires: 'heartRate',
    value: (sp, _st, ride, at) => fmt(segmentStats(ride, sp, at)?.avgHeartRate ?? NaN, 0),
    unit: () => 'bpm',
  },
  {
    key: 'seg.gain',
    requires: 'elevationGain',
    value: (sp, st, ride, at) => fmt(convert.elevation(segmentStats(ride, sp, at)?.gainM ?? NaN, st.units), 0),
    unit: (st) => convert.elevationUnit(st.units),
  },
  {
    key: 'run.avgCadence',
    requires: 'cadence',
    value: (sp, _st, ride, at) => fmt(segmentStats(ride, sp, at)?.avgCadence ?? NaN, 0),
    unit: spm,
  },
];

/** Running shoe in the header of the running cards. */
function headerIcon(ctx: Ctx2D, x: number, y: number, color: string) {
  drawIcon(ctx, 'shoe', x + 16, y + 16, 30, color);
}

const splitsOverlay: OverlayDefinition = {
  id: 'runSplits',
  label: 'Splits table',
  requires: 'distance',
  sports: RUN,
  textOnly: false,
  labelFor: (lang) => tr(lang, 'overlay.runSplits'),
  slugFor: (lang) => runSlug(lang, 'runSplits'),
  size: () => ({ width: SW, height: S_HEAD + S_ROWS * S_ROW_H + 18 }),
  draw: (ctx, frame, style, octx) => {
    const ride = octx.ride;
    const unitM = paceUnitM(style.units);
    const all = splits(ride, unitM);
    const started = all.filter((sp) => sp.startMs <= frame.t);
    if (!started.length || frame.t > ride.endTime + 60_000) return;
    const p = dialPaint(style);
    const lang = style.language;
    const finished = started.filter((sp) => sp.endMs <= frame.t);
    // Fastest full split so far, for the highlight.
    let best: Split | undefined;
    for (const sp of finished) if (sp.distanceM >= unitM - 1 && (!best || sp.endMs - sp.startMs < best.endMs - best.startMs)) best = sp;
    const rows = started.slice(-S_ROWS);
    drawCard(ctx, SW, S_HEAD + rows.length * S_ROW_H + 18, style);
    headerIcon(ctx, 22, 14, style.accentColor);
    drawText(ctx, tr(lang, 'run.splitsTitle'), 62, 40, p.ts, { size: 22, weight: 800, tabular: false });
    const unit = convert.distanceUnit(style.units).toUpperCase();
    drawText(ctx, `${unit} ${fmt(convert.distance(distanceAt(ride, Math.min(frame.textSample.t, ride.endTime)), style.units), 2)}`, SW - 26, 40, p.ts, { size: 20, weight: 800, align: 'right' });

    // A km split's time is its pace: one column for both, then heart rate, climb and cadence.
    const cols = SPLIT_COLUMNS.filter((c) => ride.available.has(c.requires)).slice(0, 4);
    const left = 120;
    const colRight = (i: number) => left + ((SW - 26 - left) * (i + 1)) / cols.length;
    const hy = S_HEAD - 14;
    drawText(ctx, unit, 36, hy, p.ts, { size: 12, weight: 700, tabular: false, color: p.label });
    cols.forEach((c, i) => {
      const label = `${tr(lang, c.key)} (${c.unit(style)})`;
      const maxW = (SW - 26 - left) / cols.length - 8;
      drawText(ctx, label, colRight(i), hy, p.ts, { size: labelSize(ctx, p.ts, label, 12, 700, maxW), weight: 700, align: 'right', tabular: false, color: p.label });
    });
    ctx.beginPath();
    ctx.moveTo(22, S_HEAD - 4);
    ctx.lineTo(SW - 22, S_HEAD - 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();

    rows.forEach((sp, i) => {
      const y = S_HEAD + i * S_ROW_H;
      const mid = y + S_ROW_H / 2;
      const running = sp.endMs > frame.t;
      const at = running ? Math.max(sp.startMs + 1, frame.textSample.t) : Infinity;
      const isBest = !running && best === sp && finished.length > 1;
      if (running) {
        ctx.fillStyle = withAlpha(style.accentColor, 0.18);
        ctx.fillRect(22, y + 2, SW - 44, S_ROW_H - 4);
        ctx.fillStyle = style.accentColor;
        ctx.fillRect(22, y + 2, 4, S_ROW_H - 4);
      }
      const partial = !running && sp.distanceM < unitM - 1;
      const label = partial ? fmt(convert.distance(sp.distanceM, style.units), 2) : String(sp.n);
      drawText(ctx, label, 36, mid + 6, p.ts, { size: 18, weight: 800, color: running ? undefined : 'rgba(255,255,255,0.9)' });
      if (isBest) drawText(ctx, '★', 92, mid + 6, p.ts, { size: 16, weight: 800, tabular: false, color: '#ffd23f' });
      cols.forEach((c, k) => {
        const first = k === 0;
        drawText(ctx, c.value(sp, style, ride, at), colRight(k), mid + 7, p.ts, {
          size: first ? 20 : 18,
          weight: first ? 800 : 700,
          align: 'right',
          color: first && isBest ? GOOD : running || first ? undefined : 'rgba(255,255,255,0.88)',
        });
      });
    });
  },
};

// -------------------------------------------------------------------------------------- PR ghost

const GW = 880;
const GH = 300;
const GHOST_COLOR = '#7dd3fc';

/** Nice tick step (m) for a window of `span` metres: about five ticks. */
function tickStep(span: number): number {
  for (const s of [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000]) if (span / s <= 6) return s;
  return 10_000;
}

const ghostOverlay: OverlayDefinition = {
  id: 'runGhost',
  label: 'Race vs PR (ghost)',
  requires: 'distance',
  sports: RUN,
  textOnly: false,
  labelFor: (lang) => tr(lang, 'overlay.runGhost'),
  slugFor: (lang) => runSlug(lang, 'runGhost'),
  size: () => ({ width: GW, height: GH }),
  draw: (ctx, frame, style, octx) => {
    const g = style.ghost;
    if (!g || !(g.distanceM > 0) || !(g.timeMs > 0)) return;
    const ride = octx.ride;
    const p = dialPaint(style);
    const lang = style.language;
    const now = ghostAt(ride, g, frame.t);
    const text = ghostAt(ride, g, frame.textSample.t);
    // A strip under the card stays clear (room for its shadow in the editor).
    drawCard(ctx, GW, GH - 14, style);

    // Header: "VS PR" badge, distance and PR time; on the right the gap in time.
    const badgeW = pill(ctx, 26, 40, tr(lang, 'ghost.title'), style.accentColor, style, 'left');
    const dist = `${fmt(convert.distance(g.distanceM, style.units), g.distanceM % 1000 ? 2 : 0)} ${convert.distanceUnit(style.units)}`;
    drawText(ctx, `${dist} · ${tr(lang, 'ghost.pr', { time: formatClock(g.timeMs) })}`, 26 + badgeW + 14, 47, p.ts, { size: 21, weight: 800, tabular: false });
    if (!text.started) {
      drawText(ctx, tr(lang, 'ghost.ready'), GW - 28, 56, p.ts, { size: 34, weight: 800, align: 'right', tabular: false, color: p.label });
    } else {
      const ahead = text.deltaMs < 0;
      const color = Math.abs(text.deltaMs) < 500 ? '#ffffff' : ahead ? GOOD : BAD;
      drawText(ctx, `${ahead ? '−' : '+'}${formatClock(Math.abs(text.deltaMs))}`, GW - 28, 60, p.ts, { size: 46, weight: 800, align: 'right', color });
      // Metres apart while both still run; after the finish only the time counts.
      const gapM = Math.abs(text.myM - text.ghostM);
      const metres = text.finished || text.ghostM >= g.distanceM ? '' : ` · ${fmt(convert.elevation(gapM, style.units), 0)} ${convert.elevationUnit(style.units)}`;
      const sub = `${tr(lang, ahead ? 'ghost.ahead' : 'ghost.behind')}${metres}`;
      drawText(ctx, sub, GW - 28, 84, p.ts, { size: 14, weight: 800, align: 'right', tabular: false, color });
    }

    // Close-up of the race: a window of track around both runners, side-scrolling like a game.
    const x0 = 30;
    const x1 = GW - 30;
    const top = 116;
    const laneH = 40;
    const lo = Math.min(now.myM, now.ghostM);
    const hi = Math.max(now.myM, now.ghostM);
    const span = Math.max(120, (hi - lo) * 1.6 + 60);
    const center = (lo + hi) / 2;
    const wStart = center - span / 2;
    const X = (m: number) => x0 + ((m - wStart) / span) * (x1 - x0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, top - 70, x1 - x0, laneH * 2 + 96);
    ctx.clip();
    const tg = ctx.createLinearGradient(0, top, 0, top + laneH * 2);
    tg.addColorStop(0, '#c4502f');
    tg.addColorStop(1, '#8f2f1c');
    ctx.fillStyle = tg;
    ctx.fillRect(x0, top, x1 - x0, laneH * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.5;
    for (const y of [top, top + laneH, top + laneH * 2]) {
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
    }
    // Distance marks scroll past; start and finish lines when in view.
    const step = tickStep(span);
    for (let m = Math.ceil(wStart / step) * step; m <= wStart + span; m += step) {
      if (m < 0 || m > g.distanceM) continue;
      const x = X(m);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x - 1, top, 2, laneH * 2);
      if (x < x0 + 24 || x > x1 - 24) continue;
      drawText(ctx, `${fmt(convert.distance(m, style.units), m % 1000 ? 2 : 1)}`, x, top + laneH * 2 + 20, p.ts, { size: 13, weight: 700, align: 'center', color: p.label });
    }
    if (X(0) >= x0 - 4) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(X(0) - 2, top, 4, laneH * 2);
    }
    if (X(g.distanceM) <= x1 + 6) {
      for (let r = 0; r < 8; r++) for (let c = 0; c < 2; c++) {
        ctx.fillStyle = (r + c) % 2 ? '#14181d' : '#ffffff';
        ctx.fillRect(X(g.distanceM) + c * 5 - 5, top + r * 10, 5, 10);
      }
    }
    // Runners: the ghost (PR pace) in the top lane, the runner in the bottom one.
    const mySpeed = runSpeedAt(ride, frame.t);
    const cadenceHz = Number.isFinite(frame.sample.cadence) && frame.sample.cadence > 120 ? frame.sample.cadence / 120 : 1.45;
    const myPhase = now.started && !now.finished && Number.isFinite(mySpeed) ? (frame.t / 1000) * Math.PI * 2 * cadenceHz : NaN;
    const ghostRunning = now.started && now.ghostM < g.distanceM;
    const ghostPhase = ghostRunning ? (frame.t / 1000) * Math.PI * 2 * 1.45 + 1 : NaN;
    const gx = X(now.ghostM);
    const mx = X(now.myM);
    ctx.shadowColor = withAlpha(GHOST_COLOR, 0.9);
    ctx.shadowBlur = 14;
    if (ghostRunning) for (const k of [3, 2, 1]) drawRunner(ctx, gx - k * 12, top + laneH - 4, 62, ghostPhase - k * 0.4, GHOST_COLOR, 0.1 * (4 - k));
    drawRunner(ctx, gx, top + laneH - 4, 62, ghostPhase, GHOST_COLOR, 0.8);
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 6;
    drawRunner(ctx, mx, top + laneH * 2 - 4, 66, myPhase, style.accentColor, 1, 'rgba(10,12,16,0.75)');
    ctx.restore();
    // Lane labels at the left edge.
    const laneTag = (y: number, label: string, color: string) => {
      ctx.font = font(p.ts, 12, 800);
      const w = ctx.measureText(label).width + 14;
      ctx.fillStyle = 'rgba(9,12,17,0.85)';
      ctx.fillRect(x0, y - 10, w, 20);
      ctx.fillStyle = color;
      ctx.fillRect(x0, y - 10, 3, 20);
      drawText(ctx, label, x0 + 8, y + 5, p.ts, { size: 12, weight: 800, tabular: false, color });
    };
    laneTag(top + laneH / 2, tr(lang, 'ghost.ghostTag'), GHOST_COLOR);
    laneTag(top + laneH * 1.5, tr(lang, 'ghost.you'), style.accentColor);

    // Whole race below: a thin bar from start to finish with both positions.
    const by = 232;
    const bx0 = 30;
    const bx1 = GW - 30;
    const BX = (m: number) => bx0 + (Math.max(0, Math.min(g.distanceM, m)) / g.distanceM) * (bx1 - bx0);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(bx0, by - 3, bx1 - bx0, 6);
    ctx.fillStyle = withAlpha(style.accentColor, 0.85);
    ctx.fillRect(bx0, by - 3, BX(now.myM) - bx0, 6);
    for (const [m, color] of [
      [now.ghostM, GHOST_COLOR],
      [now.myM, style.accentColor],
    ] as const) {
      ctx.beginPath();
      ctx.arc(BX(m), by, 7, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#0d1116';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Bottom line: distance run, current pace, projection or finish.
    const ty = GH - 36;
    const w0 = drawText(ctx, `${tr(lang, 'ghost.you')} `, 28, ty, p.ts, { size: 15, weight: 800, tabular: false, color: style.accentColor });
    drawText(ctx, `${fmt(convert.distance(text.myM, style.units), 2)} / ${dist}`, 28 + w0, ty, p.ts, { size: 18, weight: 800 });
    const paceText = `${tr(lang, 'run.pace')} ${formatPace(runSpeedAt(ride, frame.textSample.t), style.units)} ${paceUnit(style.units)}`;
    drawText(ctx, paceText, GW / 2 + 40, ty, p.ts, { size: 17, weight: 800, align: 'center', color: 'rgba(255,255,255,0.9)' });
    if (text.finished) {
      const pr = text.finishMs < g.timeMs;
      const w = drawText(ctx, tr(lang, 'ghost.finish', { time: formatClock(text.finishMs) }), GW - 28, ty, p.ts, { size: 19, weight: 800, align: 'right', color: pr ? GOOD : undefined });
      if (pr) pill(ctx, GW - 28 - w - 12, ty - 6, `★ ${tr(lang, 'ghost.newPr')}`, '#ffd23f', style);
    } else if (Number.isFinite(text.projectedMs)) {
      drawText(ctx, tr(lang, 'ghost.projected', { time: formatClock(text.projectedMs) }), GW - 28, ty, p.ts, { size: 17, weight: 800, align: 'right', color: text.projectedMs < g.timeMs ? GOOD : 'rgba(255,255,255,0.9)' });
    }
  },
};

export const runOverlays: OverlayDefinition[] = [...textOverlays, ...dialOverlays, splitsOverlay, ghostOverlay];

/** Splits shown by the table at instant t (for tests and the app). */
export function splitsAt(ride: RideData, style: OverlayStyle, t: number): { list: Split[]; current?: Split } {
  const list = splits(ride, paceUnitM(style.units));
  return { list, current: splitAt(list, t) };
}

