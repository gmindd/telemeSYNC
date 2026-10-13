import type { RideSample } from '../../telemetry/ride.ts';
import { formatDuration, formatTime } from '../../util/timezone.ts';
import { drawText } from '../draw.ts';
import type { Ctx2D, OverlayDefinition, OverlayId, OverlayStyle } from '../types.ts';
import { convert, fmt } from '../units.ts';

interface TextMetric {
  id: OverlayId;
  label: string;
  /** Widest expected value, used for a fixed layout (unit never moves). */
  template: (s: OverlayStyle) => string;
  value: (s: RideSample, style: OverlayStyle) => { text: string; color?: string };
  unit: (style: OverlayStyle) => string;
  /** Extra drawing after the unit (e.g. grade wedge); returns used width. */
  extra?: { width: number; draw: (ctx: Ctx2D, x: number, baseline: number, s: RideSample, style: OverlayStyle) => void };
}

export function hrZone(bpm: number, zones: number[]): number {
  if (!Number.isFinite(bpm)) return -1;
  let z = 0;
  while (z < zones.length && bpm > zones[z]) z++;
  return z;
}

export function gradeColor(g: number): string {
  if (!Number.isFinite(g)) return '#ffffff';
  if (g <= -3) return '#4fc3f7';
  if (g < 3) return '#ffffff';
  if (g < 6) return '#ffeb3b';
  if (g < 10) return '#ff9800';
  if (g < 15) return '#f44336';
  return '#b71c1c';
}

const LABEL_SIZE = 20;
const VALUE_SIZE = 72;
const UNIT_SIZE = 28;
const DIGIT_W = VALUE_SIZE * 0.72;
const PAD = 14;

const metrics: TextMetric[] = [
  {
    id: 'speed',
    label: 'Velocidade',
    template: () => '88,8',
    value: (s) => ({ text: fmt(s.speed, 1) }),
    unit: (st) => convert.speedUnit(st.units),
  },
  {
    id: 'altitude',
    label: 'Altitude',
    template: (st) => (st.units.system === 'metric' ? '8888' : '88888'),
    value: (s, st) => ({ text: fmt(convert.elevation(s.altitude, st.units), 0) }),
    unit: (st) => convert.elevationUnit(st.units),
  },
  {
    id: 'grade',
    label: 'Inclinação',
    template: () => '-88',
    value: (s) => ({ text: fmt(s.grade, 0), color: gradeColor(s.grade) }),
    unit: () => '%',
    extra: {
      width: 64,
      draw: (ctx, x, baseline, s, style) => {
        if (!Number.isFinite(s.grade)) return;
        const w = 52;
        const maxH = 40;
        const h = Math.max(3, (Math.min(Math.abs(s.grade), 25) / 25) * maxH);
        const x0 = x + 8;
        const y0 = baseline - 6;
        ctx.beginPath();
        if (s.grade >= 0) {
          ctx.moveTo(x0, y0);
          ctx.lineTo(x0 + w, y0);
          ctx.lineTo(x0 + w, y0 - h);
        } else {
          ctx.moveTo(x0, y0 - h);
          ctx.lineTo(x0 + w, y0);
          ctx.lineTo(x0, y0);
        }
        ctx.closePath();
        if (style.outlineWidth > 0) {
          ctx.strokeStyle = style.outlineColor;
          ctx.lineWidth = style.outlineWidth * 1.5;
          ctx.lineJoin = 'round';
          ctx.stroke();
        }
        ctx.fillStyle = gradeColor(s.grade);
        ctx.fill();
      },
    },
  },
  {
    id: 'heartRate',
    label: 'Freq. cardíaca',
    template: () => '188',
    value: (s, st) => {
      const z = hrZone(s.heartRate, st.hrZones);
      return { text: fmt(s.heartRate, 0), color: st.colorByZone && z >= 0 ? st.hrZoneColors[z] : undefined };
    },
    unit: () => 'bpm',
  },
  {
    id: 'cadence',
    label: 'Cadência',
    template: () => '188',
    value: (s) => ({ text: fmt(s.cadence, 0) }),
    unit: () => 'rpm',
  },
  {
    id: 'power',
    label: 'Potência',
    template: () => '1888',
    value: (s) => ({ text: fmt(s.power, 0) }),
    unit: () => 'W',
  },
  {
    id: 'temperature',
    label: 'Temperatura',
    template: () => '-88',
    value: (s, st) => ({ text: fmt(convert.temperature(s.temperature, st.units), 0) }),
    unit: (st) => convert.temperatureUnit(st.units),
  },
  {
    id: 'distance',
    label: 'Distância',
    template: () => '188,88',
    value: (s, st) => ({ text: fmt(convert.distance(s.distance, st.units), 2) }),
    unit: (st) => convert.distanceUnit(st.units),
  },
  {
    id: 'elevationGain',
    label: 'Desnível +',
    template: (st) => (st.units.system === 'metric' ? '8888' : '88888'),
    value: (s, st) => ({ text: fmt(convert.elevation(s.elevationGain, st.units), 0) }),
    unit: (st) => convert.elevationUnit(st.units),
  },
  {
    id: 'elapsedTime',
    label: 'Tempo',
    template: () => '8:88:88',
    value: (s) => ({ text: formatDuration(s.elapsedMs) }),
    unit: () => '',
  },
  {
    id: 'localTime',
    label: 'Hora',
    template: () => '88:88:88',
    value: (s, st) => ({ text: formatTime(s.t, st.timeZone) }),
    unit: () => '',
  },
];

function layout(m: TextMetric, style: OverlayStyle) {
  const tpl = m.template(style);
  let valueW = 0;
  for (const ch of tpl) valueW += ch >= '0' && ch <= '9' ? DIGIT_W : VALUE_SIZE * 0.36;
  const unit = style.showUnit ? m.unit(style) : '';
  const unitW = unit ? unit.length * UNIT_SIZE * 0.62 + 10 : 0;
  const extraW = m.extra?.width ?? 0;
  const width = Math.ceil(PAD * 2 + valueW + unitW + extraW);
  const top = style.showLabel ? LABEL_SIZE + 10 : 0;
  const baseline = PAD + top + VALUE_SIZE * 0.76;
  // Room below the baseline for the decimal comma and the outline.
  const height = Math.ceil(baseline + VALUE_SIZE * 0.2 + PAD);
  return { valueW, unit, unitW, width, height, baseline };
}

function makeOverlay(m: TextMetric): OverlayDefinition {
  return {
    id: m.id,
    label: m.label,
    requires: m.id,
    textOnly: true,
    size: (style) => {
      const l = layout(m, style);
      return { width: l.width, height: l.height };
    },
    draw: (ctx, frame, style) => {
      const l = layout(m, style);
      const s = frame.textSample;
      if (style.showLabel) {
        drawText(ctx, m.label.toUpperCase(), PAD, PAD + LABEL_SIZE * 0.8, style, { size: LABEL_SIZE, weight: 600, tabular: false });
      }
      const v = m.value(s, style);
      const valueRight = PAD + l.valueW;
      drawText(ctx, v.text, valueRight, l.baseline, style, { size: VALUE_SIZE, weight: 800, align: 'right', color: v.color });
      let x = valueRight;
      if (l.unit) {
        drawText(ctx, l.unit, x + 8, l.baseline, style, { size: UNIT_SIZE, weight: 600, tabular: false });
        x += l.unitW;
      }
      m.extra?.draw(ctx, x, l.baseline, s, style);
    },
  };
}

export const textOverlays: OverlayDefinition[] = metrics.map(makeOverlay);
