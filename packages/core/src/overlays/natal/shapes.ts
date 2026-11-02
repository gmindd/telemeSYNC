import type { RideData, RideSample } from '../../telemetry/ride.ts';
import { formatDuration } from '../../util/timezone.ts';
import { dialPaint, fitSize } from '../dial/common.ts';
import { beforeStart } from '../dial/dials.ts';
import { drawText, font, measureTabular } from '../draw.ts';
import { drawIcon, withAlpha } from '../panel/paint.ts';
import { gradeColor } from '../text/metrics.ts';
import type { Ctx2D, FrameState, OverlayContext, OverlayDefinition, OverlayStyle } from '../types.ts';
import { convert, fmt } from '../units.ts';
import { darkInset, holly, lightsOnLine, rng, snowflakes, snowOnEdge, tree, woodBoard, woodFill } from './deco.ts';
import { natalNames } from './names.ts';

// Christmas gadgets that are not round: wooden sign (gradient), warning sign, log cabin (altitude),
// snow globe (distance) and a mug of hot chocolate (time).

/** Number with an optional unit, centred at (cx, baseline), fitted into maxW. */
function valueWithUnit(ctx: Ctx2D, style: OverlayStyle, text: string, template: string, unit: string, cx: number, baseline: number, maxW: number, maxSize: number, inline: boolean, color?: string) {
  const p = dialPaint(style);
  const u = style.showUnit ? unit : '';
  if (inline) {
    const size = fitSize(ctx, p.ts, template, maxW - u.length * maxSize * 0.3, maxSize);
    ctx.font = font(p.ts, size, 800);
    const vw = measureTabular(ctx, text);
    ctx.font = font(p.ts, size * 0.5, 700);
    const uw = u ? ctx.measureText(u).width + 4 : 0;
    const x = cx - (vw + uw) / 2;
    drawText(ctx, text, x, baseline, p.ts, { size, weight: 800, color });
    if (u) drawText(ctx, u, x + vw + 4, baseline, p.ts, { size: size * 0.5, weight: 700, tabular: false });
    return size;
  }
  const size = fitSize(ctx, p.ts, template, maxW, maxSize);
  drawText(ctx, text, cx, baseline, p.ts, { size, weight: 800, align: 'center', color });
  if (u) drawText(ctx, u, cx, baseline + size * 0.48, p.ts, { size: Math.max(14, size * 0.3), weight: 600, align: 'center', tabular: false, color: 'rgba(255,255,255,0.85)' });
  return size;
}

function textT(frame: FrameState): number {
  return frame.textSample.t;
}

function opacity(style: OverlayStyle): number {
  return Math.max(0, Math.min(1, style.panelOpacity ?? 0.8));
}

// ---------------------------------------------------------------------------------------------

const SIGN_W = 360;
const SIGN_H = 262;

/** Wooden sign on two posts, snow on top and lights under the snow: gradient. */
export const natalGradeOverlay: OverlayDefinition = {
  id: 'natalGrade',
  label: natalNames('metric.grade', 'grade').labelFor('en'),
  ...natalNames('metric.grade', 'grade'),
  theme: 'natal',
  requires: 'grade',
  textOnly: false,
  textRateOnly: () => true,
  size: () => ({ width: SIGN_W, height: SIGN_H }),
  draw: (ctx: Ctx2D, frame, style) => {
    const s = frame.textSample;
    // Posts.
    for (const x of [92, SIGN_W - 92]) {
      ctx.beginPath();
      ctx.rect(x - 9, 170, 18, SIGN_H - 178);
      woodFill(ctx, x - 9, 170, 18, SIGN_H - 178, 21, false);
    }
    woodBoard(ctx, 22, 46, SIGN_W - 44, 138, 12, 17, 3);
    darkInset(ctx, 44, 84, SIGN_W - 88, 86, 10, opacity(style));
    drawIcon(ctx, 'mountain', 82, 127, 34, '#ffffff');
    valueWithUnit(ctx, style, fmt(s.grade, 1), '-88,8', '%', SIGN_W / 2 + 22, 152, SIGN_W - 160, 64, true, Number.isFinite(s.grade) ? gradeColor(s.grade) : undefined);
    snowOnEdge(ctx, 18, 48, SIGN_W - 36, 18, 4);
    lightsOnLine(ctx, 30, 56, SIGN_W - 30, 56, 10, textT(frame));
  },
};

// ---------------------------------------------------------------------------------------------

const WARN_W = 300;
const WARN_H = 330;

/** Red warning triangle above a snowy wooden board: gradient. */
export const natalGradeWarningOverlay: OverlayDefinition = {
  id: 'natalGradeWarning',
  label: natalNames('metric.grade', 'grade', 'warning').labelFor('en'),
  ...natalNames('metric.grade', 'grade', 'warning'),
  theme: 'natal',
  requires: 'grade',
  textOnly: true,
  size: () => ({ width: WARN_W, height: WARN_H }),
  draw: (ctx: Ctx2D, frame, style) => {
    const s = frame.textSample;
    const cx = WARN_W / 2;
    // Post.
    ctx.beginPath();
    ctx.rect(cx - 10, 100, 20, WARN_H - 106);
    woodFill(ctx, cx - 10, 100, 20, WARN_H - 106, 23, false);
    // Warning triangle.
    const tri = (inset: number) => {
      ctx.beginPath();
      ctx.moveTo(cx, 14 + inset * 1.6);
      ctx.lineTo(cx + 62 - inset * 1.4, 118 - inset * 0.8);
      ctx.lineTo(cx - 62 + inset * 1.4, 118 - inset * 0.8);
      ctx.closePath();
    };
    tri(0);
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#d4141f';
    ctx.fill();
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#7a0b12';
    ctx.lineWidth = 4;
    ctx.stroke();
    tri(12);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(cx - 4.5, 52, 9, 34);
    ctx.beginPath();
    ctx.arc(cx, 97, 5, 0, Math.PI * 2);
    ctx.fill();
    snowOnEdge(ctx, cx - 18, 26, 36, 9, 6);
    // Board.
    woodBoard(ctx, 18, 136, WARN_W - 36, 118, 12, 29, 2);
    darkInset(ctx, 36, 154, WARN_W - 72, 84, 10, opacity(style));
    valueWithUnit(ctx, style, fmt(s.grade, 1), '-88,8', '%', cx, 220, WARN_W - 96, 62, true, Number.isFinite(s.grade) ? gradeColor(s.grade) : undefined);
    snowOnEdge(ctx, 14, 138, WARN_W - 28, 16, 9);
    holly(ctx, WARN_W - 40, 246, 30, 0.5);
  },
};

// ---------------------------------------------------------------------------------------------

const CABIN_W = 330;
const CABIN_H = 330;

/** Log cabin with a snowy roof and lights under the eaves: altitude. */
export const natalAltitudeCabinOverlay: OverlayDefinition = {
  id: 'natalAltitudeCabin',
  label: natalNames('metric.altitude', 'altitude', 'cabin').labelFor('en'),
  ...natalNames('metric.altitude', 'altitude', 'cabin'),
  theme: 'natal',
  requires: 'altitude',
  textOnly: false,
  textRateOnly: () => true,
  size: () => ({ width: CABIN_W, height: CABIN_H }),
  draw: (ctx: Ctx2D, frame, style) => {
    const s = frame.textSample;
    const cx = CABIN_W / 2;
    const eave = 132;
    // Chimney.
    ctx.beginPath();
    ctx.rect(cx + 70, 34, 30, 70);
    ctx.fillStyle = '#7a3b2a';
    ctx.fill();
    ctx.strokeStyle = '#3a1a10';
    ctx.lineWidth = 2;
    ctx.stroke();
    snowOnEdge(ctx, cx + 66, 36, 38, 10, 31);
    // Walls: horizontal logs.
    ctx.beginPath();
    ctx.rect(40, eave - 6, CABIN_W - 80, CABIN_H - eave - 10);
    woodFill(ctx, 40, eave - 6, CABIN_W - 80, CABIN_H - eave - 10, 33);
    ctx.strokeStyle = 'rgba(30,12,4,0.6)';
    ctx.lineWidth = 2;
    for (let y = eave + 18; y < CABIN_H - 16; y += 22) {
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(CABIN_W - 40, y);
      ctx.stroke();
    }
    ctx.strokeStyle = '#3a1d0c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.rect(40, eave - 6, CABIN_W - 80, CABIN_H - eave - 10);
    ctx.stroke();
    // Roof.
    ctx.beginPath();
    ctx.moveTo(cx, 18);
    ctx.lineTo(CABIN_W - 12, eave + 6);
    ctx.lineTo(12, eave + 6);
    ctx.closePath();
    woodFill(ctx, 12, 18, CABIN_W - 24, eave - 12, 35);
    ctx.strokeStyle = '#3a1d0c';
    ctx.lineWidth = 3;
    ctx.stroke();
    // Snow on both slopes.
    ctx.beginPath();
    ctx.moveTo(cx, 8);
    ctx.lineTo(CABIN_W - 4, eave);
    ctx.lineTo(CABIN_W - 22, eave + 10);
    const rand = rng(37);
    for (let i = 1; i < 14; i++) {
      const f = i / 14;
      const x = CABIN_W - 22 - (CABIN_W - 22 - cx) * f;
      const y = eave + 10 - (eave + 10 - 30) * f + (i % 3 === 0 ? 8 + rand() * 6 : rand() * 3);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(cx, 30);
    for (let i = 1; i < 14; i++) {
      const f = i / 14;
      const x = cx - (cx - 22) * f;
      const y = 30 + (eave + 10 - 30) * f + (i % 3 === 1 ? 8 + rand() * 6 : rand() * 3);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(22, eave + 10);
    ctx.lineTo(4, eave);
    ctx.closePath();
    ctx.fillStyle = '#f4f8fb';
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.shadowBlur = 0;
    // House icon in the gable.
    ctx.beginPath();
    ctx.moveTo(cx, 58);
    ctx.lineTo(cx + 18, 74);
    ctx.lineTo(cx + 12, 74);
    ctx.lineTo(cx + 12, 90);
    ctx.lineTo(cx - 12, 90);
    ctx.lineTo(cx - 12, 74);
    ctx.lineTo(cx - 18, 74);
    ctx.closePath();
    ctx.fillStyle = '#ffd166';
    ctx.fill();
    lightsOnLine(ctx, 22, eave + 12, CABIN_W - 22, eave + 12, 11, textT(frame), 4.5, 4);
    // Window with the number.
    darkInset(ctx, 62, eave + 34, CABIN_W - 124, 126, 10, opacity(style));
    const u = convert.elevationUnit(style.units);
    valueWithUnit(ctx, style, fmt(convert.elevation(s.altitude, style.units), 0), style.units.system === 'metric' ? '8888' : '88888', u, cx, eave + 108, CABIN_W - 150, 62, false);
  },
};

// ---------------------------------------------------------------------------------------------

const GLOBE_W = 300;
const GLOBE_H = 340;
const GR = 122;

/** Snow globe with a tree inside, on a wooden base: distance. */
export const natalDistanceGlobeOverlay: OverlayDefinition = {
  id: 'natalDistanceGlobe',
  label: natalNames('metric.distance', 'distance', 'globe').labelFor('en'),
  ...natalNames('metric.distance', 'distance', 'globe'),
  theme: 'natal',
  requires: 'distance',
  textOnly: false,
  textRateOnly: () => true,
  size: () => ({ width: GLOBE_W, height: GLOBE_H }),
  draw: (ctx: Ctx2D, frame, style, octx: OverlayContext) => {
    const s = frame.textSample;
    const cx = GLOBE_W / 2;
    const cy = 8 + GR;
    const t = textT(frame);
    // Glass.
    ctx.beginPath();
    ctx.arc(cx, cy, GR, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(cx - 30, cy - 40, 10, cx, cy, GR);
    g.addColorStop(0, `rgba(40,70,110,${Math.max(0.55, opacity(style))})`);
    g.addColorStop(1, `rgba(8,16,30,${Math.max(0.7, opacity(style))})`);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, GR - 2, 0, Math.PI * 2);
    ctx.clip();
    // Snow ground inside and falling snow (moves slowly with the text updates).
    ctx.beginPath();
    ctx.ellipse(cx, cy + GR * 0.92, GR * 0.95, GR * 0.32, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#e8f1f8';
    ctx.fill();
    const drift = ((t / 40) % 60) - 30;
    snowflakes(ctx, cx - GR, cy - GR + drift * 0.3, GR * 2, GR * 2, 34, 3.2, 41, 0.8);
    ctx.restore();
    tree(ctx, cx, cy - 24, 76, t);
    valueWithUnit(ctx, style, fmt(convert.distance(s.distance, style.units), 1), '188,8', convert.distanceUnit(style.units), cx, cy + 44, 170, 56, false);
    // Glass highlight and rim.
    ctx.beginPath();
    ctx.arc(cx, cy, GR - 10, Math.PI * 1.08, Math.PI * 1.42);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, GR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(220,235,255,0.6)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // Base.
    const by = cy + GR - 12;
    ctx.beginPath();
    ctx.moveTo(cx - 92, by);
    ctx.lineTo(cx + 92, by);
    ctx.lineTo(cx + 112, GLOBE_H - 10);
    ctx.lineTo(cx - 112, GLOBE_H - 10);
    ctx.closePath();
    woodFill(ctx, cx - 112, by, 224, GLOBE_H - 10 - by, 43);
    ctx.strokeStyle = '#3a1d0c';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(cx - 100, by + 18, 200, 6);
    ctx.fillStyle = '#d4a017';
    ctx.fill();
    // Total distance on the base.
    const total = `${fmt(convert.distance(octx.ride.totals.distanceM, style.units), 1)} ${convert.distanceUnit(style.units)}`;
    drawText(ctx, total, cx, GLOBE_H - 22, dialPaint(style).ts, { size: 18, weight: 800, align: 'center' });
    holly(ctx, cx - 96, by + 8, 26, -0.5);
  },
};

// ---------------------------------------------------------------------------------------------

const MUG_W = 360;
const MUG_H = 330;

/** Gingerbread man peeking over the rim. */
function gingerbread(ctx: Ctx2D, x: number, y: number, s: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(0.25);
  ctx.fillStyle = '#b5652a';
  ctx.strokeStyle = '#6b3410';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, -s * 0.55, s * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-s * 0.3, -s * 0.28);
  ctx.lineTo(s * 0.3, -s * 0.28);
  ctx.lineTo(s * 0.62, -s * 0.12);
  ctx.lineTo(s * 0.55, s * 0.05);
  ctx.lineTo(s * 0.28, -s * 0.02);
  ctx.lineTo(s * 0.32, s * 0.5);
  ctx.lineTo(-s * 0.32, s * 0.5);
  ctx.lineTo(-s * 0.28, -s * 0.02);
  ctx.lineTo(-s * 0.55, s * 0.05);
  ctx.lineTo(-s * 0.62, -s * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#2b1505';
  for (const ex of [-0.1, 0.1]) {
    ctx.beginPath();
    ctx.arc(ex * s, -s * 0.6, s * 0.045, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, -s * 0.5, s * 0.12, 0.2, Math.PI - 0.2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  for (const by of [0.0, 0.18]) {
    ctx.beginPath();
    ctx.arc(0, by * s, s * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#e5323e';
  ctx.beginPath();
  ctx.arc(0, -s * 0.18, s * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Red mug of hot chocolate with whipped cream and a gingerbread man: elapsed time. */
export const natalTimeMugOverlay: OverlayDefinition = {
  id: 'natalTimeMug',
  label: natalNames('metric.elapsedTime', 'elapsedTime', 'mug').labelFor('en'),
  ...natalNames('metric.elapsedTime', 'elapsedTime', 'mug'),
  theme: 'natal',
  requires: 'elapsedTime',
  textOnly: true,
  size: () => ({ width: MUG_W, height: MUG_H }),
  draw: (ctx: Ctx2D, frame, style, octx: OverlayContext) => {
    const s: RideSample = frame.textSample;
    const ride: RideData = octx.ride;
    const x0 = 34;
    const x1 = 274;
    const top = 104;
    const bottom = MUG_H - 14;
    // Handle.
    ctx.beginPath();
    ctx.arc(x1 + 4, (top + bottom) / 2 + 4, 52, -Math.PI / 2.2, Math.PI / 2.2);
    ctx.strokeStyle = '#8e0f18';
    ctx.lineWidth = 26;
    ctx.stroke();
    ctx.strokeStyle = '#d4202c';
    ctx.lineWidth = 16;
    ctx.stroke();
    // Body.
    ctx.beginPath();
    ctx.moveTo(x0, top);
    ctx.lineTo(x1, top);
    ctx.lineTo(x1 - 8, bottom - 24);
    ctx.quadraticCurveTo(x1 - 12, bottom, x1 - 40, bottom);
    ctx.lineTo(x0 + 40, bottom);
    ctx.quadraticCurveTo(x0 + 12, bottom, x0 + 8, bottom - 24);
    ctx.closePath();
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, '#8e0f18');
    g.addColorStop(0.35, '#e5323e');
    g.addColorStop(1, '#8e0f18');
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.shadowBlur = 0;
    snowflakes(ctx, x0 + 14, top + 10, x1 - x0 - 28, bottom - top - 20, 10, 6, 47, 0.25);
    // Whipped cream.
    const rand = rng(53);
    ctx.fillStyle = '#fbf6ee';
    for (let i = 0; i < 9; i++) {
      const cx = x0 + 10 + ((x1 - x0 - 20) * i) / 8;
      ctx.beginPath();
      ctx.arc(cx, top - 4 - rand() * 6, 22 + rand() * 6, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const [cx, cy, r] of [[110, 70, 30], [160, 58, 34], [210, 72, 28], [150, 34, 22]]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const sprinkles = ['#ff3b3b', '#3ddc5a', '#ffd23f', '#3fa9ff'];
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (let i = 0; i < 18; i++) {
      const sx = x0 + 30 + rand() * (x1 - x0 - 60);
      const sy = 30 + rand() * 70;
      const a = rand() * Math.PI;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(a) * 6, sy + Math.sin(a) * 6);
      ctx.strokeStyle = sprinkles[i % sprinkles.length];
      ctx.stroke();
    }
    gingerbread(ctx, x1 + 30, 70, 62);
    // Label with the time.
    darkInset(ctx, x0 + 26, top + 44, x1 - x0 - 52, 104, 12, opacity(style));
    const text = beforeStart(ride, s) ? formatDuration(0) : formatDuration(s.elapsedMs);
    valueWithUnit(ctx, style, text, '8:88:88', 'h:m:s', (x0 + x1) / 2, top + 104, x1 - x0 - 80, 50, false);
    ctx.strokeStyle = withAlpha('#ffffff', 0.25);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0 + 22, top + 12);
    ctx.lineTo(x0 + 30, bottom - 36);
    ctx.stroke();
  },
};

export const natalShapes: OverlayDefinition[] = [natalGradeOverlay, natalGradeWarningOverlay, natalAltitudeCabinOverlay, natalDistanceGlobeOverlay, natalTimeMugOverlay];
