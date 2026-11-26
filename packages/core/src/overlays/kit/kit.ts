import type { MetricKey, RideData, RideSample } from '../../telemetry/ride.ts';
import type { Sport } from '../../telemetry/sport.ts';
import { pick, tr, type CoreKey, type Lang, type Translations } from '../../i18n/index.ts';
import { formatDuration } from '../../util/timezone.ts';
import { cardinal, formatPace, paceUnit, skiRuns, toStart } from '../../metrics/derived.ts';
import { beforeStart } from '../dial/dials.ts';
import { roundMapHeading } from '../dial/map.ts';
import { POWER_ZONE_COLORS, POWER_ZONES } from '../panel/panel.ts';
import { PANEL_METRIC_INFO, statsUpTo } from '../panel/series.ts';
import { METRIC_SLUGS } from '../slugs.ts';
import { hrZone } from '../text/metrics.ts';
import { themeName, type GadgetCategory, type KitThemeId } from '../themes.ts';
import { sportOf, type Ctx2D, type FrameState, type KitOverlayId, type OverlayContext, type OverlayDefinition, type OverlayStyle } from '../types.ts';
import { convert, fmt } from '../units.ts';
import { NO_VALUE } from './colors.ts';
import type { LineIcon } from './icons.ts';
import { METRIC_ROLES, type MetricRole } from './roles.ts';

// The shared kit behind the new themes. A theme only says how things look (a dial, a compass, a summary card,
// its map and profile, and its own extras); the gadgets, their names, file names, categories and sports are made
// here, the same for every theme. That keeps all themes offering the same set, organised the same way.

export interface Zone {
  index: number;
  colors: string[];
}

/** Everything a theme needs to draw one metric dial. */
export interface DialData {
  role: string;
  /** Metric name in the overlay language (not upper-cased: themes decide). */
  label: string;
  value: string;
  unit: string;
  /** Widest expected value, so the font size never changes. */
  template: string;
  /** Position along the scale (0..1, NaN = none) and where zero is. */
  f: number;
  origin: number;
  /** Colour of the value (continuous), or the neutral colour before the start. */
  color: string;
  icon: LineIcon;
  zone?: Zone;
  secondary: string;
  before: boolean;
  sample: RideSample;
  textSample: RideSample;
  ride: RideData;
  style: OverlayStyle;
}

export interface CompassData {
  /** Direction of travel, degrees clockwise from north. */
  heading: number;
  cardinal: string;
  /** Way back to the start: direction (degrees from north) and distance text; null without positions. */
  toStart: { bearing: number; text: string } | null;
  before: boolean;
  style: OverlayStyle;
}

export interface SummaryRowData {
  label: string;
  icon: LineIcon;
  value: string;
  unit: string;
}

export interface ThemeKit {
  id: KitThemeId;
  /** File-name prefix per language. */
  slug: Translations;
  /**
   * Transparent margin added around every gadget of the theme (px at 1x), for themes whose glows or shadows
   * would otherwise reach the frame edge and be cut off in the video.
   */
  pad?: number;
  dialSize: { width: number; height: number };
  dial: (ctx: Ctx2D, d: DialData) => void;
  mapSize: { width: number; height: number };
  map: (ctx: Ctx2D, frame: FrameState, style: OverlayStyle, octx: OverlayContext) => void;
  profileSize: { width: number; height: number };
  profile: (ctx: Ctx2D, frame: FrameState, style: OverlayStyle, octx: OverlayContext) => void;
  summarySize: { width: number; height: number };
  summary: (ctx: Ctx2D, rows: SummaryRowData[], style: OverlayStyle) => void;
  compassSize: { width: number; height: number };
  compass: (ctx: Ctx2D, c: CompassData) => void;
  /** The theme's own gadgets (made with `kitExtra`). */
  extras?: OverlayDefinition[];
}

// ---------------------------------------------------------------------------------------------
// Data for the drawings.

export function zoneOf(kind: 'hr' | 'power', s: RideSample, style: OverlayStyle): Zone {
  if (kind === 'hr') {
    const index = Number.isFinite(s.heartRate) ? Math.min(style.hrZoneColors.length - 1, hrZone(s.heartRate, style.hrZones)) : -1;
    return { index, colors: style.hrZoneColors };
  }
  const index = Number.isFinite(s.power) ? Math.min(POWER_ZONE_COLORS.length - 1, hrZone(s.power, POWER_ZONES.map((k) => k * style.ftp))) : -1;
  return { index, colors: POWER_ZONE_COLORS };
}

/** Text-rate frame for the panels-at-text-rate mode (dials move only with the numbers). */
export function effectiveFrame(frame: FrameState, style: OverlayStyle): FrameState {
  return style.panelRate === 'text' ? { t: frame.textSample.t, sample: frame.textSample, textSample: frame.textSample } : frame;
}

export function dialData(role: MetricRole, frame: FrameState, style: OverlayStyle, ride: RideData): DialData {
  const s = frame.sample;
  const ts = frame.textSample;
  const before = beforeStart(ride, s);
  const arc = role.arc(s, style, ride);
  const zone = role.zone && !beforeStart(ride, ts) ? zoneOf(role.zone, ts, style) : undefined;
  return {
    role: role.role,
    label: tr(style.language, role.name),
    value: role.value(ts, style, ride),
    unit: style.showUnit ? role.unit(style) : '',
    template: role.template(style),
    f: before ? NaN : arc.f,
    origin: arc.origin,
    color: before ? NO_VALUE : role.color(s, style, ride),
    icon: role.icon,
    zone,
    secondary: role.secondary?.(ts, style, ride) ?? '',
    before,
    sample: s,
    textSample: ts,
    ride,
    style,
  };
}

/** Distance as "3,2 km" / "850 m" (or mi / ft). */
export function shortDistance(m: number, style: OverlayStyle): string {
  if (!Number.isFinite(m)) return '—';
  if (style.units.system === 'metric') return m < 1000 ? `${fmt(Math.round(m / 10) * 10, 0)} m` : `${fmt(m / 1000, 1)} km`;
  const mi = m / 1609.344;
  return mi < 0.2 ? `${fmt(Math.round((m * 3.2808399) / 10) * 10, 0)} ft` : `${fmt(mi, 1)} mi`;
}

export function compassData(frame: FrameState, style: OverlayStyle, ride: RideData): CompassData {
  const s = frame.sample;
  const before = beforeStart(ride, s);
  const heading = ((roundMapHeading(ride, s) * 180) / Math.PI + 360) % 360;
  const back = toStart(ride, frame.textSample);
  return {
    heading,
    cardinal: cardinal(heading),
    toStart: back && !before ? { bearing: back.bearing, text: shortDistance(back.distance, style) } : null,
    before,
    style,
  };
}

/** Four ride-so-far rows, chosen for the sport (pace for running, vertical drop for ski…), skipping missing metrics. */
export function summaryRows(frame: FrameState, style: OverlayStyle, ride: RideData): SummaryRowData[] {
  const s = frame.textSample;
  const before = beforeStart(ride, s);
  const L = (k: CoreKey) => tr(style.language, k);
  const avg = (m: 'heartRate' | 'power' | 'speed' | 'cadence') => (before ? NaN : statsUpTo(ride, PANEL_METRIC_INFO[m], s.index).avg);
  const rows: { requires: MetricKey; sports?: Sport[]; row: () => SummaryRowData }[] = [
    { requires: 'elapsedTime', row: () => ({ label: L('summary.duration'), icon: 'stopwatch', value: formatDuration(before ? 0 : s.elapsedMs), unit: '' }) },
    { requires: 'heartRate', row: () => ({ label: L('summary.hr'), icon: 'heart', value: fmt(avg('heartRate'), 0), unit: 'bpm' }) },
    {
      requires: 'pace',
      sports: ['running', 'hiking'],
      row: () => ({ label: `${L('dial.avg')} ${L('metric.pace')}`, icon: 'stopwatch', value: formatPace(before ? NaN : ride.totals.avgMovingSpeed, style.units), unit: paceUnit(style.units) }),
    },
    { requires: 'power', sports: ['cycling', 'other'], row: () => ({ label: L('summary.power'), icon: 'bolt', value: fmt(avg('power'), 0), unit: 'W' }) },
    {
      requires: 'runs',
      sports: ['ski'],
      row: () => ({ label: L('metric.runs'), icon: 'mountain', value: before ? '0' : String(skiRuns(ride).count[s.index]), unit: '' }),
    },
    {
      requires: 'runs',
      sports: ['ski'],
      row: () => ({
        label: L('kit.drop'),
        icon: 'mountain',
        value: fmt(convert.elevation(before ? NaN : skiRuns(ride).total[s.index], style.units), 0),
        unit: convert.elevationUnit(style.units),
      }),
    },
    {
      requires: 'speed',
      sports: ['cycling', 'ski', 'other'],
      row: () => ({ label: L('summary.speed'), icon: 'gauge', value: fmt(convert.speed(avg('speed'), style.units), 1), unit: convert.speedUnit(style.units) }),
    },
    { requires: 'distance', row: () => ({ label: L('summary.distance'), icon: 'route', value: fmt(convert.distance(s.distance, style.units), 1), unit: convert.distanceUnit(style.units) }) },
    {
      requires: 'elevationGain',
      row: () => ({ label: L('summary.gain'), icon: 'mountain', value: fmt(convert.elevation(before ? NaN : s.elevationGain, style.units), 0), unit: convert.elevationUnit(style.units) }),
    },
  ];
  return rows
    .filter((r) => ride.available.has(r.requires) && (!r.sports || r.sports.includes(sportOf(style, ride))))
    .slice(0, 4)
    .map((r) => r.row());
}

// ---------------------------------------------------------------------------------------------
// Gadget definitions.

const slugOf = (key: string, lang: Lang | undefined) => (METRIC_SLUGS[key] ? pick(METRIC_SLUGS[key], lang) : key.toLowerCase());

interface ExtraSpec {
  role: string;
  /** Name in the app (CoreKey) and file-name key (METRIC_SLUGS key or a plain slug). */
  name: CoreKey;
  slug: string;
  requires: MetricKey;
  category?: GadgetCategory;
  sports?: Sport[];
  placement?: 'topRight' | 'bottom';
  size: { width: number; height: number };
  textOnly?: boolean;
  /** Moves only with the numbers when panels are at the text rate. */
  followsPanelRate?: boolean;
  /** Transparent margin around the drawing (see ThemeKit.pad). */
  pad?: number;
  draw: OverlayDefinition['draw'];
}

/** A gadget of a kit theme, named "{Theme} · {name}" with the file name "{theme}-{slug}". */
export function kitGadget(theme: KitThemeId, themeSlug: Translations, spec: ExtraSpec): OverlayDefinition {
  const labelFor = (lang: Lang | undefined) => tr(lang, 'overlay.themed', { theme: themeName(theme, lang), name: tr(lang, spec.name) });
  const p = spec.pad ?? 0;
  return {
    id: `${theme}.${spec.role}` as KitOverlayId,
    label: labelFor('en'),
    labelFor,
    slugFor: (lang) => `${pick(themeSlug, lang)}-${slugOf(spec.slug, lang)}`,
    theme,
    category: spec.category ?? 'extras',
    sports: spec.sports,
    placement: spec.placement,
    requires: spec.requires,
    textOnly: !!spec.textOnly,
    textRateOnly: spec.followsPanelRate === false || spec.textOnly ? undefined : (style) => style.panelRate === 'text',
    size: () => (p ? { width: spec.size.width + p * 2, height: spec.size.height + p * 2 } : spec.size),
    draw: p
      ? (ctx, frame, style, octx) => {
          ctx.save();
          ctx.translate(p, p);
          spec.draw(ctx, frame, style, octx);
          ctx.restore();
        }
      : spec.draw,
  };
}

/** Every gadget of a kit theme: one dial per metric role, map, profile, compact panel, compass, then its extras. */
export function makeThemeFamily(kit: ThemeKit): OverlayDefinition[] {
  const g = (spec: ExtraSpec) => kitGadget(kit.id, kit.slug, { ...spec, pad: kit.pad });
  const dials = METRIC_ROLES.map((role) =>
    g({
      role: role.role,
      name: role.name,
      slug: role.slug,
      requires: role.requires,
      category: 'dials',
      sports: role.sports,
      size: kit.dialSize,
      draw: (ctx, frame, style, octx) => kit.dial(ctx, dialData(role, effectiveFrame(frame, style), style, octx.ride)),
    }),
  );
  return [
    ...dials,
    g({ role: 'map', name: 'overlay.dialMap', slug: 'dialMap', requires: 'map', category: 'maps', placement: 'topRight', size: kit.mapSize, followsPanelRate: false, draw: kit.map }),
    g({ role: 'profile', name: 'overlay.dialProfile', slug: 'dialProfile', requires: 'elevationProfile', category: 'maps', placement: 'bottom', size: kit.profileSize, followsPanelRate: false, draw: kit.profile }),
    g({
      role: 'summary',
      name: 'overlay.dialSummary',
      slug: 'dialSummary',
      requires: 'elapsedTime',
      category: 'panels',
      size: kit.summarySize,
      textOnly: true,
      draw: (ctx, frame, style, octx) => kit.summary(ctx, summaryRows(frame, style, octx.ride), style),
    }),
    g({
      role: 'compass',
      name: 'metric.compass',
      slug: 'compass',
      requires: 'compass',
      category: 'nav',
      size: kit.compassSize,
      draw: (ctx, frame, style, octx) => kit.compass(ctx, compassData(effectiveFrame(frame, style), style, octx.ride)),
    }),
    ...(kit.extras ?? []),
  ];
}

export { NO_VALUE };
