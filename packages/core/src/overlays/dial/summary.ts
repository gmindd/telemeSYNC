import type { MetricKey, RideData, RideSample } from '../../telemetry/ride.ts';
import { formatDuration } from '../../util/timezone.ts';
import { drawText } from '../draw.ts';
import { drawIcon } from '../panel/paint.ts';
import { PANEL_METRIC_INFO, statsUpTo, type IconId } from '../panel/series.ts';
import type { Ctx2D, OverlayDefinition, OverlayStyle, PanelMetric } from '../types.ts';
import { convert, fmt } from '../units.ts';
import { dialPaint } from './common.ts';
import { drawCard } from './profile.ts';

// Compact card with four ride-so-far numbers. Rows whose metric is missing from the file are
// replaced by the next one in the list, so a ride without a power meter still shows four rows.
const W = 380;
const H = 236;
const ROWS = 4;
const TOP = 16;
const ROW_H = (H - TOP * 2) / ROWS;

interface Row {
  label: string;
  icon: IconId;
  requires: MetricKey;
  value: (s: RideSample, style: OverlayStyle, ride: RideData) => { text: string; unit: string };
}

function average(m: PanelMetric, decimals: number) {
  const info = PANEL_METRIC_INFO[m];
  return (s: RideSample, style: OverlayStyle, ride: RideData) => {
    const before = s.outside && s.t < ride.startTime;
    const v = before ? NaN : statsUpTo(ride, info, s.index).avg;
    return { text: fmt(info.toDisplay(v, style), decimals), unit: info.unit(style) };
  };
}

const ROW_CHOICES: Row[] = [
  { label: 'DURAÇÃO', icon: 'clock', requires: 'elapsedTime', value: (s) => ({ text: formatDuration(s.elapsedMs), unit: '' }) },
  { label: 'FC MÉDIA', icon: 'heart', requires: 'heartRate', value: average('heartRate', 0) },
  { label: 'POT. MÉDIA', icon: 'bolt', requires: 'power', value: average('power', 0) },
  { label: 'VEL. MÉDIA', icon: 'gauge', requires: 'speed', value: average('speed', 1) },
  { label: 'CAD. MÉDIA', icon: 'cadence', requires: 'cadence', value: average('cadence', 0) },
  {
    label: 'DISTÂNCIA',
    icon: 'link',
    requires: 'distance',
    value: (s, st) => ({ text: fmt(convert.distance(s.distance, st.units), 1), unit: convert.distanceUnit(st.units) }),
  },
  {
    label: 'DESNÍVEL +',
    icon: 'mountain',
    requires: 'elevationGain',
    value: (s, st) => ({ text: fmt(convert.elevation(s.elevationGain, st.units), 0), unit: convert.elevationUnit(st.units) }),
  },
];

export const dialSummaryOverlay: OverlayDefinition = {
  id: 'dialSummary',
  label: 'Painel compacto (médias)',
  requires: 'elapsedTime',
  textOnly: true,
  size: () => ({ width: W, height: H }),
  draw: (ctx: Ctx2D, frame, style, octx) => {
    const ride = octx.ride;
    const p = dialPaint(style);
    const s = frame.textSample;
    drawCard(ctx, W, H, style);
    const rows = ROW_CHOICES.filter((r) => ride.available.has(r.requires)).slice(0, ROWS);
    rows.forEach((r, i) => {
      const y = TOP + i * ROW_H;
      if (i > 0) {
        ctx.beginPath();
        ctx.moveTo(24, y);
        ctx.lineTo(W - 24, y);
        ctx.strokeStyle = 'rgba(255,255,255,0.09)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      const mid = y + ROW_H / 2;
      drawIcon(ctx, r.icon, 42, mid, 26, 'rgba(255,255,255,0.88)');
      drawText(ctx, r.label, 70, mid + 5, p.ts, { size: 14, weight: 700, tabular: false, color: p.label });
      const v = r.value(s, style, ride);
      const vw = drawText(ctx, v.text, 196, mid + 10, p.ts, { size: 28, weight: 800 });
      if (v.unit) drawText(ctx, v.unit, 196 + vw + 7, mid + 10, p.ts, { size: 15, weight: 600, tabular: false, color: p.label });
    });
  },
};
