import { tr } from '../../i18n/index.ts';
import { CX, CY, DIAL, dialPaint } from '../dial/common.ts';
import { drawRoundMap, MAP_R } from '../dial/map.ts';
import { dialProfileOverlay, PROFILE_H, PROFILE_W, profilePeak } from '../dial/profile.ts';
import { drawSummaryRows, SUMMARY_H, SUMMARY_W } from '../dial/summary.ts';
import { drawText } from '../draw.ts';
import type { Ctx2D, OverlayDefinition } from '../types.ts';
import { bow, holly, lightsOnArc, snowOnArc, snowOnEdge, tree, woodBoard, wreathRing } from './deco.ts';
import { natalNames } from './names.ts';

// Christmas versions of the round map, the elevation profile card and the compact panel: the same
// drawing as the "Mostradores", in a wreath, a candy-cane frame and on a wooden board.

const MAP_W = DIAL + 40;
const MAP_H = DIAL + 74;
const MAP_OX = 20;
const MAP_OY = 30;

export const natalMapOverlay: OverlayDefinition = {
  id: 'natalMap',
  label: natalNames('overlay.dialMap', 'dialMap').labelFor('en'),
  ...natalNames('overlay.dialMap', 'dialMap'),
  theme: 'natal',
  requires: 'map',
  textOnly: false,
  size: () => ({ width: MAP_W, height: MAP_H }),
  draw: (ctx: Ctx2D, frame, style, octx) => {
    const t = frame.textSample.t;
    ctx.save();
    ctx.translate(MAP_OX, MAP_OY);
    drawRoundMap(ctx, frame, { ...style, accentColor: '#ff3b3b' }, octx, (c) => {
      wreathRing(c, CX, CY, MAP_R + 11, 26, 61);
      c.beginPath();
      c.arc(CX, CY, MAP_R, 0, Math.PI * 2);
      c.fillStyle = '#0a1619';
      c.fill();
    });
    lightsOnArc(ctx, CX, CY, MAP_R + 12, Math.PI * 0.1, Math.PI * 0.9, 9, t);
    snowOnArc(ctx, CX, CY, MAP_R + 20, -Math.PI / 2 - 0.9, -Math.PI / 2 + 0.9, 18, 63);
    bow(ctx, CX, CY + MAP_R + 20, 58);
    ctx.restore();
  },
};

// ---------------------------------------------------------------------------------------------

const PROF_PAD_X = 12;
const PROF_PAD_Y = 26;

/** Rounded-rectangle subpath, clockwise or counter-clockwise (for a ring-shaped clip). */
function roundRectSub(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number, ccw: boolean) {
  if (!ccw) {
    ctx.moveTo(x + r, y);
    ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  } else {
    ctx.moveTo(x + r, y);
    ctx.arc(x + r, y + r, r, Math.PI * 1.5, Math.PI, true);
    ctx.arc(x + r, y + h - r, r, Math.PI, Math.PI / 2, true);
    ctx.arc(x + w - r, y + h - r, r, Math.PI / 2, 0, true);
    ctx.arc(x + w - r, y + r, r, 0, -Math.PI / 2, true);
  }
  ctx.closePath();
}

/** Red and white candy-cane frame of width lw centred on a rounded rectangle. */
function candyFrame(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number, lw: number) {
  const band = () => {
    ctx.beginPath();
    roundRectSub(ctx, x - lw / 2, y - lw / 2, w + lw, h + lw, r + lw / 2, false);
    roundRectSub(ctx, x + lw / 2, y + lw / 2, w - lw, h - lw, Math.max(1, r - lw / 2), true);
  };
  band();
  ctx.fillStyle = '#f7f7f7';
  ctx.fill();
  ctx.save();
  band();
  ctx.clip();
  ctx.strokeStyle = '#d4202c';
  ctx.lineWidth = lw * 0.6;
  ctx.beginPath();
  for (let d = -h - lw; d < w + h + lw; d += lw * 1.6) {
    ctx.moveTo(x + d, y - lw);
    ctx.lineTo(x + d + h + lw * 2, y + h + lw);
  }
  ctx.stroke();
  ctx.restore();
  band();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

export const natalProfileOverlay: OverlayDefinition = {
  id: 'natalProfile',
  label: natalNames('overlay.elevationProfile', 'elevationProfile').labelFor('en'),
  ...natalNames('overlay.elevationProfile', 'elevationProfile'),
  theme: 'natal',
  requires: 'elevationProfile',
  textOnly: false,
  size: () => ({ width: PROFILE_W + PROF_PAD_X * 2, height: PROFILE_H + PROF_PAD_Y + 12 }),
  draw: (ctx: Ctx2D, frame, style, octx) => {
    const st = { ...style, accentColor: '#3ddc5a' };
    ctx.save();
    ctx.translate(PROF_PAD_X, PROF_PAD_Y);
    dialProfileOverlay.draw(ctx, frame, st, octx);
    candyFrame(ctx, 6, 6, PROFILE_W - 12, PROFILE_H - 12, 16, 10);
    const peak = profilePeak(octx.ride, st, octx);
    tree(ctx, peak.x, peak.y - 4, 46, frame.textSample.t);
    snowOnEdge(ctx, 14, 2, 170, 14, 71);
    snowOnEdge(ctx, PROFILE_W - 210, 2, 120, 12, 73);
    holly(ctx, PROFILE_W - 22, 10, 30, 0.6);
    ctx.restore();
  },
};

// ---------------------------------------------------------------------------------------------

const SUM_PAD = 26;
const SUM_HEAD = 52;
const SUM_W = SUMMARY_W + SUM_PAD * 2;
const SUM_H = SUMMARY_H + SUM_HEAD + SUM_PAD + 24;

export const natalSummaryOverlay: OverlayDefinition = {
  id: 'natalSummary',
  label: natalNames('overlay.dialSummary', 'dialSummary').labelFor('en'),
  ...natalNames('overlay.dialSummary', 'dialSummary'),
  theme: 'natal',
  requires: 'elapsedTime',
  textOnly: true,
  size: () => ({ width: SUM_W, height: SUM_H }),
  draw: (ctx: Ctx2D, frame, style, octx) => {
    const top = 16;
    woodBoard(ctx, 18, top, SUM_W - 36, SUM_H - top - 22, 14, 77, 1);
    // Dark area for the rows, title on the wood.
    ctx.beginPath();
    const x = SUM_PAD;
    const y = top + SUM_HEAD - 8;
    const w = SUMMARY_W;
    const h = SUMMARY_H - 4;
    const r = 12;
    ctx.moveTo(x + r, y);
    ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
    ctx.closePath();
    ctx.fillStyle = `rgba(14,10,8,${Math.max(0.55, style.panelOpacity ?? 0.8)})`;
    ctx.fill();
    drawText(ctx, tr(style.language, 'natal.extra'), SUM_W / 2, top + 34, dialPaint(style).ts, { size: 22, weight: 800, align: 'center', tabular: false, color: '#fff3d6' });
    ctx.save();
    ctx.translate(SUM_PAD, top + SUM_HEAD - 10);
    drawSummaryRows(ctx, frame, style, octx, 'rgba(255,236,200,0.75)');
    ctx.restore();
    snowOnEdge(ctx, 14, top + 2, SUM_W - 28, 16, 79);
    holly(ctx, SUM_W - 34, top + 10, 30, 0.5);
    holly(ctx, 34, top + 10, 26, -0.5);
  },
};

export const natalCards: OverlayDefinition[] = [natalMapOverlay, natalProfileOverlay, natalSummaryOverlay];
