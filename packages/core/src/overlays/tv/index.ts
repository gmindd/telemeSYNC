import type { RideData, RideSample } from '../../telemetry/ride.ts';
import { tr } from '../../i18n/index.ts';
import { formatDuration, formatTime } from '../../util/timezone.ts';
import { segmentAt } from '../../segments/segments.ts';
import { interpolateOn } from '../panel/series.ts';
import { beforeStart } from '../dial/dials.ts';
import { drawText, font } from '../draw.ts';
import { mapOverlay } from '../map.ts';
import { sportOf, type Ctx2D, type FrameState, type OverlayContext, type OverlayDefinition, type OverlayStyle } from '../types.ts';
import { convert, fmt } from '../units.ts';
import { lineIcon } from '../kit/icons.ts';
import { dialData, effectiveFrame, kitGadget, makeThemeFamily, shortDistance, type CompassData, type DialData, type SummaryRowData, type ThemeKit } from '../kit/kit.ts';
import { fitFont, profileAt, rideProfile, rrect, spaced, traceProfile, valueUnit } from '../kit/draw.ts';
import { metricRole } from '../kit/roles.ts';

// TV broadcast: a generic live-race graphics package (no real channel or race branding). Deep navy panels with an
// angled corner and a vivid yellow strip, bold white numbers, a red LIVE badge.

const NAVY = '#0b1a3a';
const YELLOW = '#facc15';
const RED = '#e11d2a';
const WHITE = '#ffffff';
const SOFT = 'rgba(255,255,255,0.72)';
const SLUG = ['tv', 'tv', 'tv', 'tv', 'tv'] as const;

const tvText = (style: OverlayStyle): OverlayStyle => ({ ...style, outlineWidth: 0, shadow: false });
const alphaOf = (style: OverlayStyle) => Math.max(0.82, Math.min(0.97, (style.panelOpacity ?? 0.8) + 0.1));

/** Navy panel with the bottom-right corner cut, and the yellow strip along the cut. */
function panel(ctx: Ctx2D, x: number, y: number, w: number, h: number, style: OverlayStyle, cut = 20, strip = true) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - cut);
  ctx.lineTo(x + w - cut, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fillStyle = NAVY;
  ctx.globalAlpha = alphaOf(style);
  ctx.fill();
  ctx.globalAlpha = 1;
  if (!strip) return;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.3, y + h + 4);
  ctx.lineTo(x + w - cut + 3, y + h + 4);
  ctx.lineTo(x + w + 4, y + h - cut + 3);
  ctx.lineTo(x + w + 4, y + h * 0.35);
  ctx.strokeStyle = YELLOW;
  ctx.lineWidth = 5;
  ctx.lineJoin = 'miter';
  ctx.stroke();
}

// ---------------------------------------------------------------------------------------------
// Dial: a stat tile.

const TILE_W = 380;
const TILE_H = 140;

function tile(ctx: Ctx2D, x: number, y: number, d: DialData) {
  const ts = tvText(d.style);
  panel(ctx, x + 10, y + 10, TILE_W - 26, TILE_H - 30, d.style);
  if (d.style.showLabel) spaced(ctx, d.label, x + 30, y + 42, ts, { size: 15, weight: 700, color: SOFT, spacing: 0.14, maxW: 200 });
  if (d.zone && d.zone.index >= 0) {
    rrect(ctx, x + TILE_W - 88, y + 24, 52, 26, 4);
    ctx.fillStyle = YELLOW;
    ctx.fill();
    drawText(ctx, `Z${d.zone.index + 1}`, x + TILE_W - 62, y + 44, ts, { size: 17, weight: 800, align: 'center', tabular: false, color: NAVY });
  } else if (d.secondary) {
    drawText(ctx, d.secondary, x + TILE_W - 36, y + 42, ts, { size: 13, weight: 700, align: 'right', color: SOFT });
  }
  const size = fitFont(ctx, ts, d.template, 210, 58, 800);
  valueUnit(ctx, d.value, d.unit.toLocaleUpperCase(d.style.language), x + 28, y + 102, ts, { size, weight: 800, unitSize: 24, unitWeight: 800, color: WHITE });
}

function dial(ctx: Ctx2D, d: DialData) {
  tile(ctx, 0, 0, d);
}

// ---------------------------------------------------------------------------------------------
// Compass: a heading tag.

const COMPASS_W = 460;
const COMPASS_H = 140;

function arrow(ctx: Ctx2D, x: number, y: number, deg: number, s: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(s * 0.62, s * 0.7);
  ctx.lineTo(0, s * 0.32);
  ctx.lineTo(-s * 0.62, s * 0.7);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function compass(ctx: Ctx2D, c: CompassData) {
  const ts = tvText(c.style);
  panel(ctx, 10, 10, COMPASS_W - 26, COMPASS_H - 30, c.style);
  // Yellow block with an arrow pointing where the rider heads (north up).
  ctx.beginPath();
  ctx.moveTo(10, 10);
  ctx.lineTo(104, 10);
  ctx.lineTo(84, COMPASS_H - 20);
  ctx.lineTo(10, COMPASS_H - 20);
  ctx.closePath();
  ctx.fillStyle = YELLOW;
  ctx.fill();
  if (!c.before) arrow(ctx, 52, (COMPASS_H - 10) / 2, c.heading, 26, NAVY);
  spaced(ctx, tr(c.style.language, 'kit.heading'), 122, 42, ts, { size: 15, weight: 700, color: SOFT, spacing: 0.14 });
  drawText(ctx, c.before ? '—' : `${c.cardinal} ${Math.round(c.heading) % 360}°`, 120, 96, ts, { size: 46, weight: 800, tabular: true, color: WHITE });
  if (c.toStart) {
    const text = `${tr(c.style.language, 'kit.start')} ${c.toStart.text}`;
    drawText(ctx, text, COMPASS_W - 36, 42, ts, { size: 14, weight: 700, align: 'right', tabular: true, color: SOFT });
    ctx.font = font(ts, 14, 700);
    arrow(ctx, COMPASS_W - 46 - ctx.measureText(text).width, 37, c.toStart.bearing, 7, YELLOW);
  }
}

// ---------------------------------------------------------------------------------------------
// Map card: the whole route, yellow where ridden.

const MAP_W = 400;
const MAP_H = 400;

function map(ctx: Ctx2D, frame: FrameState, style: OverlayStyle, octx: OverlayContext) {
  const ts = tvText(style);
  panel(ctx, 10, 10, MAP_W - 26, MAP_H - 30, style);
  spaced(ctx, tr(style.language, 'overlay.map'), 30, 42, ts, { size: 15, weight: 700, color: SOFT });
  const k = 330 / 420;
  ctx.save();
  ctx.translate(22, 52);
  ctx.scale(k, k);
  mapOverlay.draw(ctx, frame, { ...style, accentColor: YELLOW, mutedColor: 'rgba(255,255,255,0.4)', outlineWidth: 0, shadow: false }, octx);
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Profile: the whole climb profile with the summit flag.

const PROF_W = 720;
const PROF_H = 190;

/** Summit flag with the altitude, at (x, y) = foot of the pole; the label goes left of the pole past `maxX`. */
function flag(ctx: Ctx2D, x: number, y: number, label: string, style: OverlayStyle, maxX = Infinity) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 30);
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - 30);
  ctx.lineTo(x + 18, y - 24);
  ctx.lineTo(x, y - 18);
  ctx.closePath();
  ctx.fillStyle = RED;
  ctx.fill();
  if (!label) return;
  const ts = tvText(style);
  ctx.font = font(ts, 13, 800);
  const right = x + 22 + ctx.measureText(label).width <= maxX;
  drawText(ctx, label, right ? x + 22 : x - 6, y - 18, ts, { size: 13, weight: 800, tabular: true, align: right ? 'left' : 'right', color: WHITE });
}

function profileLine(ctx: Ctx2D, ride: RideData, s: RideSample, style: OverlayStyle, x0: number, x1: number, y0: number, y1: number, from = 0, to = 1) {
  const pr = rideProfile(ride, style);
  const span = to - from || 1;
  const X = (f: number) => x0 + ((f - from) / span) * (x1 - x0);
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 0; k < pr.fx.length; k++) {
    if (pr.fx[k] < from || pr.fx[k] > to) continue;
    lo = Math.min(lo, pr.alt[k]);
    hi = Math.max(hi, pr.alt[k]);
  }
  if (!Number.isFinite(lo)) return null;
  const pad = Math.max(5, (hi - lo) * 0.1);
  lo -= pad;
  hi += pad;
  const Y = (a: number) => y1 - ((a - lo) / (hi - lo || 1)) * (y1 - y0);
  const before = beforeStart(ride, s);
  const cur = before ? from : Math.max(from, Math.min(to, s.distance / pr.total));
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // Area, then the line: white ahead, yellow ridden.
  ctx.beginPath();
  if (traceProfile(ctx, pr, X, Y, from, to)) {
    ctx.lineTo(X(to), y1);
    ctx.lineTo(X(from), y1);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();
  }
  ctx.beginPath();
  if (traceProfile(ctx, pr, X, Y, cur, to)) {
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 2.6;
    ctx.stroke();
  }
  if (cur > from) {
    ctx.beginPath();
    traceProfile(ctx, pr, X, Y, from, cur);
    ctx.lineTo(X(cur), Y(profileAt(pr, cur)));
    ctx.strokeStyle = YELLOW;
    ctx.lineWidth = 3.2;
    ctx.stroke();
  }
  if (!before) {
    ctx.beginPath();
    ctx.arc(X(cur), Y(profileAt(pr, cur)), 6, 0, Math.PI * 2);
    ctx.fillStyle = RED;
    ctx.fill();
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  return { X, Y, pr };
}

function profile(ctx: Ctx2D, frame: FrameState, style: OverlayStyle, octx: OverlayContext) {
  const ride = octx.ride;
  const ts = tvText(style);
  panel(ctx, 10, 10, PROF_W - 26, PROF_H - 30, style);
  spaced(ctx, tr(style.language, 'card.elevation'), 30, 42, ts, { size: 15, weight: 700, color: SOFT });
  const u = convert.elevationUnit(style.units);
  const gain = beforeStart(ride, frame.textSample) ? NaN : convert.elevation(frame.textSample.elevationGain, style.units);
  drawText(ctx, `+${fmt(gain, 0)} ${u}`, PROF_W - 40, 42, ts, { size: 18, weight: 800, align: 'right', color: YELLOW });
  const r = profileLine(ctx, ride, frame.sample, style, 30, PROF_W - 46, 62, PROF_H - 32);
  if (r) {
    let k = 0;
    for (let i = 1; i < r.pr.alt.length; i++) if (r.pr.alt[i] > r.pr.alt[k]) k = i;
    flag(ctx, r.X(r.pr.fx[k]), r.Y(r.pr.alt[k]) - 2, `${fmt(r.pr.alt[k], 0)} ${u}`, style);
  }
}

// ---------------------------------------------------------------------------------------------
// Summary: stacked rows.

const SUM_W = 420;
const SUM_H = 300;

function summary(ctx: Ctx2D, rows: SummaryRowData[], style: OverlayStyle) {
  const ts = tvText(style);
  rows.forEach((r, i) => {
    const y = 10 + i * 70;
    panel(ctx, 10, y, SUM_W - 26, 60, style, 14, i === rows.length - 1);
    ctx.fillStyle = YELLOW;
    ctx.fillRect(10, y, 8, 60);
    lineIcon(ctx, r.icon, 46, y + 30, 26, YELLOW);
    spaced(ctx, r.label, 74, y + 36, ts, { size: 13, weight: 700, color: SOFT, spacing: 0.12, maxW: 150 });
    valueUnit(ctx, r.value, r.unit.toLocaleUpperCase(style.language), SUM_W - 36, y + 42, ts, { size: 30, weight: 800, unitSize: 14, unitWeight: 800, align: 'right', color: WHITE, unitColor: SOFT });
  });
}

// ---------------------------------------------------------------------------------------------
// Extras.

const g = (spec: Parameters<typeof kitGadget>[2]) => kitGadget('tv', SLUG, spec);

const liveBadge = g({
  role: 'live',
  name: 'kit.liveBadge',
  slug: 'live',
  requires: 'localTime',
  textOnly: true,
  size: { width: 360, height: 110 },
  draw: (ctx, frame, style) => {
    const ts = tvText(style);
    rrect(ctx, 12, 18, 128, 64, 12);
    ctx.fillStyle = RED;
    ctx.fill();
    drawText(ctx, tr(style.language, 'kit.live'), 76, 63, ts, { size: tr(style.language, 'kit.live').length > 5 ? 22 : 32, weight: 800, align: 'center', tabular: false, color: WHITE });
    panel(ctx, 150, 18, 180, 64, style, 16);
    drawText(ctx, formatTime(frame.textSample.t, style.timeZone, false), 240, 66, ts, { size: 40, weight: 800, align: 'center', color: WHITE });
  },
});

/** Roles of the stats column, by sport. */
function stackRoles(ride: RideData, style: OverlayStyle): string[] {
  const bySport: Record<string, string[]> = {
    running: ['pace', 'heartRate', 'steps', 'power', 'grade'],
    hiking: ['pace', 'heartRate', 'verticalSpeed', 'altitude', 'grade'],
    ski: ['speed', 'altitude', 'slope', 'verticalSpeed', 'heartRate'],
  };
  const list = bySport[sportOf(style, ride)] ?? ['speed', 'power', 'heartRate', 'cadence', 'grade', 'altitude'];
  return list.filter((r) => ride.available.has(metricRole(r).requires)).slice(0, 5);
}

const statsStack = g({
  role: 'stats',
  name: 'kit.statsStack',
  slug: 'stats',
  requires: 'elapsedTime',
  size: { width: TILE_W, height: 5 * 116 + 30 },
  draw: (ctx, frame, style, octx) => {
    const f = effectiveFrame(frame, style);
    stackRoles(octx.ride, style).forEach((r, i) => tile(ctx, 0, i * 116, dialData(metricRole(r), f, style, octx.ride)));
  },
});

/** Next summit ahead within 15 km, when it is at least 40 m higher; as fractions of the ride. */
function nextSummit(ride: RideData, s: RideSample, style: OverlayStyle): { to: number; distance: number; alt: number } | null {
  const pr = rideProfile(ride, style);
  const total = pr.total;
  const cur = s.distance / total;
  const end = Math.min(1, (s.distance + 15_000) / total);
  let best = -1;
  for (let k = 0; k < pr.fx.length; k++) {
    if (pr.fx[k] <= cur || pr.fx[k] > end) continue;
    if (best < 0 || pr.alt[k] > pr.alt[best]) best = k;
  }
  if (best < 0) return null;
  const here = profileAt(pr, cur);
  const rise = convert.elevation(1, style.units) * 40;
  if (pr.alt[best] - here < rise) return null;
  return { to: pr.fx[best], distance: (pr.fx[best] - cur) * total, alt: pr.alt[best] };
}

const lowerThird = g({
  role: 'lowerThird',
  name: 'kit.lowerThird',
  slug: 'lower-third',
  requires: 'distance',
  placement: 'bottom',
  size: { width: 1240, height: 150 },
  draw: (ctx, frame, style, octx) => {
    const ride = octx.ride;
    const f = effectiveFrame(frame, style);
    const s = f.textSample;
    const ts = tvText(style);
    const before = beforeStart(ride, s);
    panel(ctx, 10, 20, 1200, 100, style, 26);
    // Yellow block with the current kilometre.
    ctx.beginPath();
    ctx.moveTo(10, 20);
    ctx.lineTo(200, 20);
    ctx.lineTo(176, 120);
    ctx.lineTo(10, 120);
    ctx.closePath();
    ctx.fillStyle = YELLOW;
    ctx.fill();
    const du = convert.distanceUnit(style.units).toUpperCase();
    drawText(ctx, du, 30, 52, ts, { size: 16, weight: 800, tabular: false, color: NAVY });
    drawText(ctx, before ? '0' : fmt(Math.floor(convert.distance(s.distance, style.units)), 0), 30, 106, ts, { size: 54, weight: 800, color: NAVY });
    // Message: the segment being ridden, else the next summit, else distance and time.
    const seg = segmentAt(style.segments, s.t);
    const total = Math.max(1, ride.totals.distanceM);
    let text: string;
    /** Where the message points (end of the segment, next summit), as a fraction of the ride; NaN = nowhere. */
    let target = NaN;
    let summitLabel = '';
    if (seg?.running) {
      const endD = interpolateOn(ride.t, ride.distance, seg.seg.endMs);
      text = `${seg.seg.name.toLocaleUpperCase(style.language)} · ${tr(style.language, 'kit.toTop', { d: shortDistance(endD - s.distance, style).toUpperCase() })}`;
      target = Math.min(1, endD / total);
    } else {
      const sum = !before ? nextSummit(ride, s, style) : null;
      if (sum) {
        text = `${tr(style.language, 'kit.climb')} · ${tr(style.language, 'kit.toTop', { d: shortDistance(sum.distance, style).toUpperCase() })}`;
        target = sum.to;
        summitLabel = `${fmt(sum.alt, 0)} ${convert.elevationUnit(style.units)}`;
      } else {
        text = `${fmt(convert.distance(s.distance, style.units), 1)} ${du} · ${formatDuration(before ? 0 : s.elapsedMs)}`;
      }
    }
    spaced(ctx, text, 230, 82, ts, { size: 26, weight: 800, color: WHITE, spacing: 0.12, maxW: 600 });
    // Right side: the whole ride's profile, start to finish, the red dot where the rider is (flag on the target).
    if (ride.available.has('altitude')) {
      const r = profileLine(ctx, ride, f.sample, style, 860, 1170, 42, 108);
      if (r && Number.isFinite(target)) flag(ctx, r.X(target), r.Y(profileAt(r.pr, target)) - 2, summitLabel, style, 1185);
    }
  },
});

export const tvKit: ThemeKit = {
  id: 'tv',
  slug: SLUG,
  dialSize: { width: TILE_W, height: TILE_H },
  dial,
  mapSize: { width: MAP_W, height: MAP_H },
  map,
  profileSize: { width: PROF_W, height: PROF_H },
  profile,
  summarySize: { width: SUM_W, height: SUM_H },
  summary,
  compassSize: { width: COMPASS_W, height: COMPASS_H },
  compass,
  extras: [liveBadge, statsStack, lowerThird],
};

export const tvFamily: OverlayDefinition[] = makeThemeFamily(tvKit);
