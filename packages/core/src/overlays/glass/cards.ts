import type { RideData } from '../../telemetry/ride.ts';
import { tr } from '../../i18n/index.ts';
import { CX, CY } from '../dial/common.ts';
import { beforeStart, elevationLossAt } from '../dial/dials.ts';
import { drawRoundMap, MAP_R } from '../dial/map.ts';
import { drawProfileCard, PROFILE_H, PROFILE_W } from '../dial/profile.ts';
import { ROW_CHOICES } from '../dial/summary.ts';
import { drawText } from '../draw.ts';
import { drawIcon, mixColor, withAlpha } from '../panel/paint.ts';
import { PANEL_METRIC_INFO, statsUpTo } from '../panel/series.ts';
import { hrZone } from '../text/metrics.ts';
import type { Ctx2D, OverlayDefinition, OverlayStyle } from '../types.ts';
import { convert, fmt } from '../units.ts';
import { hrColor, NO_VALUE } from './colors.ts';
import { GLASS, SHADOW_PAD, glassDisc, glassPaint, glassRect, glowDot, hairline, hueLight, spaced, valueWithUnit, zonePills, zoneText } from './material.ts';
import { glassNames } from './names.ts';

// Glass versions of the round map (a see-through lens), the elevation profile (card and slim strip), the
// compact panel of averages, and a heart-rate chip with its zone.

const ICE = GLASS.ice;

// ---------------------------------------------------------------------------------------------
// Round map: the rotating minimap as a glass lens. The map itself has radius MAP_R around (CX, CY).

/** Canvas of the map lens, with room for its shadow. */
const G = 340;
const MAP_O = (G - CX * 2) / 2;

export const glassMapOverlay: OverlayDefinition = {
  id: 'glassMap',
  label: glassNames('overlay.dialMap', 'dialMap').labelFor('en'),
  ...glassNames('overlay.dialMap', 'dialMap'),
  theme: 'glass',
  requires: 'map',
  textOnly: false,
  size: () => ({ width: G, height: G }),
  draw: (ctx: Ctx2D, frame, style, octx) => {
    const p = glassPaint(style);
    ctx.save();
    ctx.translate(MAP_O, MAP_O);
    drawRoundMap(
      ctx,
      frame,
      { ...style, accentColor: ICE.to, outlineWidth: 0, shadow: true },
      octx,
      (c) => glassDisc(c, CX, CY, MAP_R + 13, p, ICE),
      {
        bg: [`rgba(30,46,60,${p.tint * 0.45})`, `rgba(10,16,26,${p.tint * 1.05})`],
        shade: 0.22,
        route: 'rgba(255,255,255,0.42)',
        routeUnder: 'rgba(0,0,0,0.16)',
        arrow: '#ffffff',
        arrowGlow: withAlpha(ICE.from, 0.95),
        north: `rgba(16,22,32,${Math.max(0.45, p.tint + 0.15)})`,
        northRing: 'rgba(255,255,255,0.65)',
        northWidth: 1.2,
      },
    );
    // Hairline where the map meets the glass.
    ctx.beginPath();
    ctx.arc(CX, CY, MAP_R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  },
};

// ---------------------------------------------------------------------------------------------
// Elevation profile card: the profile card's drawing on frosted glass, with pearl terrain.

const PAD = 6 + SHADOW_PAD;

export const glassProfileOverlay: OverlayDefinition = {
  id: 'glassProfile',
  label: glassNames('overlay.dialProfile', 'dialProfile').labelFor('en'),
  ...glassNames('overlay.dialProfile', 'dialProfile'),
  theme: 'glass',
  requires: 'elevationProfile',
  textOnly: false,
  size: () => ({ width: PROFILE_W + PAD * 2, height: PROFILE_H + PAD * 2 }),
  draw: (ctx: Ctx2D, frame, style, octx) => {
    ctx.save();
    ctx.translate(PAD, PAD);
    drawProfileCard(ctx, frame, { ...style, accentColor: ICE.to }, octx, {
      card: (c, w, h, st) => glassRect(c, 6, 6, w - 12, h - 12, 26, glassPaint(st), ICE),
      title: (c, text, x, y, ts) => spaced(c, text, x, y - 2, ts, { size: 13, weight: 600 }),
      terrain: ['rgba(255,255,255,0.20)', 'rgba(255,255,255,0.02)'],
      grid: 'rgba(255,255,255,0.09)',
      valueWeight: 600,
      label: 'rgba(255,255,255,0.6)',
      textShadow: true,
    });
    ctx.restore();
  },
};

// ---------------------------------------------------------------------------------------------
// Elevation strip: a slim glass bar with the altitude, the whole ride's profile and gain / loss so far.

const STRIP_W = 780;
const STRIP_H = 124;
const SM = 12;
const SP_X0 = 236;
const SP_X1 = 560;
const SP_Y0 = 36;
const SP_Y1 = STRIP_H - 30;

interface StripProfile {
  /** Fraction of the ride distance and altitude (display units) per kept point. */
  fx: Float64Array;
  alt: Float64Array;
  lo: number;
  hi: number;
  total: number;
}

const stripCache = new WeakMap<RideData, Map<string, StripProfile>>();

function stripProfile(ride: RideData, style: OverlayStyle): StripProfile {
  let byRide = stripCache.get(ride);
  if (!byRide) stripCache.set(ride, (byRide = new Map()));
  const key = style.units.system;
  const hit = byRide.get(key);
  if (hit) return hit;
  const n = ride.t.length;
  const total = Math.max(1, ride.distance[n - 1]);
  const fx: number[] = [];
  const alt: number[] = [];
  let lo = Infinity;
  let hi = -Infinity;
  let last = -Infinity;
  for (let i = 0; i < n; i++) {
    const a = convert.elevation(ride.altitude[i], style.units);
    if (Number.isNaN(a)) continue;
    const f = ride.distance[i] / total;
    if (f - last < 0.002 && i !== n - 1) continue;
    fx.push(f);
    alt.push(a);
    lo = Math.min(lo, a);
    hi = Math.max(hi, a);
    last = f;
  }
  if (!Number.isFinite(lo)) {
    lo = 0;
    hi = 100;
  }
  const pad = Math.max(10, (hi - lo) * 0.08);
  const p = { fx: Float64Array.from(fx), alt: Float64Array.from(alt), lo: lo - pad, hi: hi + pad, total };
  byRide.set(key, p);
  return p;
}

export const glassProfileStripOverlay: OverlayDefinition = {
  id: 'glassProfileStrip',
  label: glassNames('overlay.elevationProfile', 'elevationProfile', { variant: 'strip' }).labelFor('en'),
  ...glassNames('overlay.elevationProfile', 'elevationProfile', { variant: 'strip' }),
  theme: 'glass',
  requires: 'elevationProfile',
  textOnly: false,
  size: () => ({ width: STRIP_W + SHADOW_PAD * 2, height: STRIP_H + SHADOW_PAD * 2 }),
  draw: (ctx: Ctx2D, frame, style, octx) => {
    const ride = octx.ride;
    const p = glassPaint(style);
    const pr = stripProfile(ride, style);
    const s = frame.sample;
    const ts = frame.textSample;
    const before = beforeStart(ride, s);
    ctx.save();
    ctx.translate(SHADOW_PAD, SHADOW_PAD);
    glassRect(ctx, SM, SM, STRIP_W - SM * 2, STRIP_H - SM * 2, (STRIP_H - SM * 2) / 2, p, ICE);

    // Left: label and altitude.
    const u = convert.elevationUnit(style.units);
    if (style.showLabel) spaced(ctx, tr(style.language, 'card.altitude'), 52, 52, p.ts, { size: 11, weight: 600, color: p.label, maxW: 160 });
    valueWithUnit(ctx, fmt(convert.elevation(ts.altitude, style.units), 0), style.showUnit ? u : '', 50, 90, p, { size: 36, unitSize: 16 });

    // Middle: the profile.
    const X = (f: number) => SP_X0 + f * (SP_X1 - SP_X0);
    const Y = (a: number) => SP_Y1 - ((a - pr.lo) / (pr.hi - pr.lo || 1)) * (SP_Y1 - SP_Y0);
    const cur = before ? 0 : Math.min(1, s.distance / pr.total);
    const curA = convert.elevation(s.altitude, style.units);
    const line = (from: number, to: number) => {
      ctx.beginPath();
      let pen = false;
      for (let k = 0; k < pr.fx.length; k++) {
        if (pr.fx[k] < from) continue;
        if (pr.fx[k] > to) break;
        if (pen) ctx.lineTo(X(pr.fx[k]), Y(pr.alt[k]));
        else ctx.moveTo(X(pr.fx[k]), Y(pr.alt[k]));
        pen = true;
      }
      return pen;
    };
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (line(0, 1)) {
      ctx.strokeStyle = 'rgba(255,255,255,0.32)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if (cur > 0 && line(0, cur)) {
      if (Number.isFinite(curA)) ctx.lineTo(X(cur), Y(curA));
      ctx.lineTo(X(cur), SP_Y1 + 8);
      ctx.lineTo(X(pr.fx[0]), SP_Y1 + 8);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, SP_Y0, 0, SP_Y1 + 8);
      g.addColorStop(0, withAlpha(hueLight(ICE), 0.3));
      g.addColorStop(1, withAlpha(ICE.from, 0));
      ctx.fillStyle = g;
      ctx.fill();
      line(0, cur);
      if (Number.isFinite(curA)) ctx.lineTo(X(cur), Y(curA));
      ctx.shadowColor = withAlpha(ICE.from, 0.9);
      ctx.shadowBlur = 10;
      ctx.strokeStyle = ICE.to;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.shadowColor = 'rgba(0,0,0,0)';
      ctx.shadowBlur = 0;
    }
    if (!before && Number.isFinite(curA)) {
      hairline(ctx, X(cur), Y(curA) + 6, X(cur), SP_Y1 + 8, 0.35);
      glowDot(ctx, X(cur), Y(curA), 4.5, ICE);
    }

    // Right: gain and loss so far.
    const gain = before ? NaN : convert.elevation(ts.elevationGain, style.units);
    const loss = before ? NaN : convert.elevation(elevationLossAt(ride, ts), style.units);
    const right = STRIP_W - 52;
    const rows: [string, number, number][] = [
      ['up', gain, 56],
      ['down', loss, 92],
    ];
    for (const [icon, v, y] of rows) {
      const w = valueWithUnit(ctx, fmt(v, 0), u, right, y, p, { size: 22, unitSize: 13, align: 'right' });
      drawIcon(ctx, icon as 'up' | 'down', right - w - 14, y - 7, 12, icon === 'up' ? GLASS.mint.to : ICE.to);
    }
    ctx.restore();
  },
};

// ---------------------------------------------------------------------------------------------
// Compact panel: four ride-so-far numbers on frosted glass, labels spaced, numbers light.

const SUM_W = 420;
const SUM_H = 270;
const SUM_M = 12;

export const glassSummaryOverlay: OverlayDefinition = {
  id: 'glassSummary',
  label: glassNames('overlay.dialSummary', 'dialSummary').labelFor('en'),
  ...glassNames('overlay.dialSummary', 'dialSummary'),
  theme: 'glass',
  requires: 'elapsedTime',
  textOnly: true,
  size: () => ({ width: SUM_W + SHADOW_PAD * 2, height: SUM_H + SHADOW_PAD * 2 }),
  draw: (ctx: Ctx2D, frame, style, octx) => {
    const ride = octx.ride;
    const p = glassPaint(style);
    const s = frame.textSample;
    ctx.save();
    ctx.translate(SHADOW_PAD, SHADOW_PAD);
    glassRect(ctx, SUM_M, SUM_M, SUM_W - SUM_M * 2, SUM_H - SUM_M * 2, 28, p);
    const rows = ROW_CHOICES.filter((r) => ride.available.has(r.requires)).slice(0, 4);
    const top = SUM_M + 14;
    const rowH = (SUM_H - SUM_M * 2 - 28) / 4;
    rows.forEach((r, i) => {
      const y = top + i * rowH;
      if (i > 0) hairline(ctx, 40, y, SUM_W - 40, y, 0.12);
      const mid = y + rowH / 2;
      drawIcon(ctx, r.icon, 52, mid, 24, 'rgba(255,255,255,0.86)');
      const v = r.value(s, style, ride);
      const vw = valueWithUnit(ctx, v.text, style.showUnit ? v.unit : '', SUM_W - 40, mid + 11, p, { size: 30, unitSize: 15, align: 'right' });
      spaced(ctx, tr(style.language, r.label), 86, mid + 5, p.ts, { size: 11, weight: 600, color: p.label, maxW: SUM_W - 40 - vw - 100 });
    });
    ctx.restore();
  },
};

// ---------------------------------------------------------------------------------------------
// Heart-rate chip: a glass pill with the heart rate, the zone and the zone pills, and the max so far.

const CHIP_W = 460;
const CHIP_H = 136;
const CM = 12;

export const glassHeartRateZoneOverlay: OverlayDefinition = {
  id: 'glassHeartRateZone',
  label: glassNames('metric.heartRate', 'heartRate', { variant: 'zone' }).labelFor('en'),
  ...glassNames('metric.heartRate', 'heartRate', { variant: 'zone' }),
  theme: 'glass',
  requires: 'heartRate',
  textOnly: true,
  size: () => ({ width: CHIP_W + SHADOW_PAD * 2, height: CHIP_H + SHADOW_PAD * 2 }),
  draw: (ctx: Ctx2D, frame, style, octx) => {
    const ride = octx.ride;
    const p = glassPaint(style);
    const s = frame.textSample;
    const before = beforeStart(ride, s);
    const c = before ? NO_VALUE : hrColor(s.heartRate, style);
    const hue = { from: c, to: mixColor(c, '#ffffff', 0.45) };
    ctx.save();
    ctx.translate(SHADOW_PAD, SHADOW_PAD);
    glassRect(ctx, CM, CM, CHIP_W - CM * 2, CHIP_H - CM * 2, 38, p, hue);
    drawIcon(ctx, 'heart', 58, 52, 30, hueLight(hue));
    valueWithUnit(ctx, fmt(s.heartRate, 0), style.showUnit ? 'bpm' : '', 88, 66, p, { size: 44, unitSize: 17 });
    // Max so far, quiet, top right.
    const st = before ? { max: NaN } : statsUpTo(ride, PANEL_METRIC_INFO.heartRate, s.index);
    const right = CHIP_W - 44;
    const mw = drawText(ctx, fmt(st.max, 0), right, 60, p.ts, { size: 20, weight: 600, color: p.label, align: 'right' });
    spaced(ctx, tr(style.language, 'dial.max'), right - mw - 8, 60, p.ts, { size: 10, weight: 600, align: 'right', color: p.faint });
    // Zone and pills.
    const z = before || !Number.isFinite(s.heartRate) ? -1 : Math.min(style.hrZoneColors.length - 1, hrZone(s.heartRate, style.hrZones));
    const zt = z >= 0 ? tr(style.language, 'dial.zone', { n: z + 1 }) : '—';
    const zw = spaced(ctx, zt, 44, 102, p.ts, { size: 12, weight: 600, color: z >= 0 ? zoneText(style.hrZoneColors[z]) : p.faint, maxW: 110 });
    const px = Math.max(150, 44 + zw + 18);
    zonePills(ctx, px, 96, right - px, 6, style.hrZoneColors, z);
    ctx.restore();
  },
};

export const glassCards: OverlayDefinition[] = [glassMapOverlay, glassProfileOverlay, glassProfileStripOverlay, glassSummaryOverlay, glassHeartRateZoneOverlay];
