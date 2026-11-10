import { useState } from 'react';
import {
  DEFAULT_STYLE,
  detectRuns,
  formatClock,
  formatPace,
  overlayGroup,
  overlaySports,
  overlaysForSport,
  paceUnit,
  paceUnitM,
  SPORTS,
  type OverlayDefinition,
  type RideData,
  type Sport,
  effectiveStart,
  getOverlay,
  isDialOverlay,
  isSegmentOverlay,
  segmentAt,
  sortedSegments,
  LANGS,
  OVERLAY_THEMES,
  overlayLabel,
  overlayTheme,
  PANEL_METRICS,
  panelMetricName,
  panelMetricOf,
  panelOptions,
  type Lang,
  type OverlayId,
  type OverlayStyle,
  type OverlayTheme,
  type PanelMetric,
  type PanelOptions,
} from '@telemesync/core';
import { OverlayCanvas } from '../components/OverlayCanvas.tsx';
import { langName, useLang, useT } from '../i18n/index.tsx';
import { useApp } from '../lib/store.ts';

const THEME_KEY = 'telemesync.overlayTheme';

/** Tab of overlay designs last opened (Default or Christmas). */
function storedTheme(): OverlayTheme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v && (OVERLAY_THEMES as string[]).includes(v)) return v as OverlayTheme;
  } catch {
    /* ignore */
  }
  return 'default';
}

const LB_PER_KG = 2.20462;

/** Power options, shown when a gadget with power is chosen: instantaneous or 3 s average, and W/kg with the weight. */
/** Gadgets that colour or place values by power zone (need the FTP). */
const POWER_ZONE_IDS: OverlayId[] = ['dialPower', 'panelPower'];
/** Gadgets that show heart-rate zones (need the zone limits). */
const HR_ZONE_IDS: OverlayId[] = ['heartRate', 'dialHeartRate', 'panelHeartRate', 'natalHeartRate', 'natalHeartRateReindeer'];

function PowerOptions() {
  const { style, setStyle, overlays } = useApp();
  const usesZones = overlays.some((o) => POWER_ZONE_IDS.includes(o));
  const defaultFtp = style.ftp === DEFAULT_STYLE.ftp;
  const tr = useT();
  const imperial = style.units.system === 'imperial';
  const unit = imperial ? 'lb' : 'kg';
  const shown = style.weightKg > 0 ? Math.round(style.weightKg * (imperial ? LB_PER_KG : 1) * 10) / 10 : '';
  const needWeight = style.powerWkg && !(style.weightKg > 0);
  return (
    <div className="card power-options">
      <h3>{tr('ov.power.title')}</h3>
      <div className="row">
        <label className="field">
          {tr('ov.power.mode')}
          <select value={style.powerSmoothing} onChange={(e) => setStyle({ powerSmoothing: e.target.value as OverlayStyle['powerSmoothing'] })}>
            <option value="instant">{tr('ov.power.instant')}</option>
            <option value="3s">{tr('ov.power.avg3s')}</option>
          </select>
        </label>
        <label className={`field${usesZones && defaultFtp ? ' suggested' : ''}`}>
          FTP (W)
          <input type="number" min={50} max={600} step={5} value={style.ftp} onChange={(e) => Number(e.target.value) > 0 && setStyle({ ftp: Number(e.target.value) })} />
        </label>
        <label className="field check">
          <input type="checkbox" checked={style.powerWkg} onChange={(e) => setStyle({ powerWkg: e.target.checked })} /> {tr('ov.power.wkg')}
        </label>
        {style.powerWkg ? (
          <label className={`field${needWeight ? ' required' : ''}`}>
            {tr('ov.power.weight', { unit })}
            <input
              type="number"
              min={imperial ? 66 : 30}
              max={imperial ? 440 : 200}
              step={0.1}
              value={shown}
              autoFocus={needWeight}
              onChange={(e) => {
                const v = Number(e.target.value);
                setStyle({ weightKg: v > 0 ? v / (imperial ? LB_PER_KG : 1) : 0 });
              }}
            />
          </label>
        ) : null}
      </div>
      {needWeight ? <p className="notice small">{tr('ov.power.needWeight')}</p> : null}
      {usesZones && defaultFtp ? <p className="notice small">{tr('ov.power.ftpDefault', { ftp: DEFAULT_STYLE.ftp })}</p> : null}
    </div>
  );
}

/** Heart-rate zones, shown when a gadget with heart rate is chosen: from the max heart rate, or each limit by hand. */
function HeartRateOptions() {
  const { style, setStyle, overlays } = useApp();
  const tr = useT();
  const usesZones = overlays.some((o) => HR_ZONE_IDS.includes(o));
  const defaultZones = style.hrMax <= 0 && style.hrZones.join() === DEFAULT_STYLE.hrZones.join();
  const setZone = (k: number, v: number) => {
    const z = [...style.hrZones];
    z[k] = v;
    setStyle({ hrZones: z, hrMax: 0 });
  };
  return (
    <div className="card power-options">
      <h3>{tr('ov.hr.title')}</h3>
      <div className="row">
        <label className={`field${usesZones && defaultZones ? ' suggested' : ''}`}>
          {tr('ov.hr.max')}
          <input
            type="number"
            min={120}
            max={230}
            step={1}
            value={style.hrMax > 0 ? style.hrMax : ''}
            onChange={(e) => {
              const max = Math.round(Number(e.target.value));
              if (max >= 100 && max <= 240) setStyle({ hrMax: max, hrZones: [0.6, 0.7, 0.8, 0.9].map((f) => Math.round(max * f)) });
              else setStyle({ hrMax: 0 });
            }}
          />
        </label>
        {style.hrZones.map((v, k) => (
          <label key={k} className="field zone">
            {tr('ov.hr.zoneUpTo', { n: k + 1 })}
            <input type="number" min={60} max={230} step={1} value={v} onChange={(e) => Number(e.target.value) > 0 && setZone(k, Math.round(Number(e.target.value)))} />
          </label>
        ))}
        <label className="field check">
          <input type="checkbox" checked={style.colorByZone} onChange={(e) => setStyle({ colorByZone: e.target.checked })} /> {tr('ov.hrZoneColor')}
        </label>
      </div>
      {usesZones && defaultZones ? <p className="notice small">{tr('ov.hr.default')}</p> : null}
    </div>
  );
}

const GHOST_DISTANCES = [5000, 10000, 21097.5, 42195];
const GHOST_NAMES = ['ov.ghost.5k', 'ov.ghost.10k', 'ov.ghost.half', 'ov.ghost.marathon'] as const;

/** "h:mm:ss", "mm:ss" or "m:ss" → ms; null when it is not a time. */
function parseClock(text: string): number | null {
  const parts = text.trim().split(/[:.,]/).map((x) => x.trim());
  if (parts.length < 2 || parts.length > 3 || parts.some((x) => !/^\d{1,3}$/.test(x))) return null;
  const n = parts.map(Number);
  const [h, m, sec] = n.length === 3 ? n : [0, n[0], n[1]];
  if (sec >= 60 || (n.length === 3 && m >= 60)) return null;
  const ms = ((h * 60 + m) * 60 + sec) * 1000;
  return ms > 0 ? ms : null;
}

/** The personal record raced by the PR ghost gadget: distance, time and where the race starts. */
function GhostOptions({ clipStart }: { clipStart?: number }) {
  const { style, setStyle } = useApp();
  const tr = useT();
  const g = style.ghost;
  const unitM = paceUnitM(style.units);
  const unit = style.units.system === 'metric' ? 'km' : 'mi';
  const known = g ? GHOST_DISTANCES.findIndex((d) => Math.abs(d - g.distanceM) < 1) : 1;
  const [distSel, setDistSel] = useState(known >= 0 ? String(GHOST_DISTANCES[known]) : 'custom');
  const [custom, setCustom] = useState(g && known < 0 ? String(Math.round((g.distanceM / unitM) * 100) / 100) : '');
  const [timeText, setTimeText] = useState(g ? formatClock(g.timeMs) : '');
  const distanceM = distSel === 'custom' ? Number(custom.replace(',', '.')) * unitM : Number(distSel);
  const timeMs = parseClock(timeText);
  const save = (d: number, ms: number | null, startMs: number | null) =>
    setStyle({ ghost: d > 0 && ms ? { distanceM: d, timeMs: ms, startMs } : null });
  const segs = sortedSegments(style.segments);
  const startValue =
    g?.startMs == null ? 'ride' : segs.find((x) => x.startMs === g.startMs) ? `seg:${segs.find((x) => x.startMs === g.startMs)!.id}` : 'clip';
  const chooseStart = (v: string) => {
    const startMs = v === 'ride' ? null : v === 'clip' ? clipStart ?? null : segs.find((x) => `seg:${x.id}` === v)?.startMs ?? null;
    save(distanceM, timeMs, startMs);
  };
  return (
    <div className="card power-options ghost-options">
      <h3>{tr('ov.ghost.title')}</h3>
      <p className="lead small">{tr('ov.ghost.lead')}</p>
      <div className="row">
        <label className="field">
          {tr('ov.ghost.distance')}
          <select
            value={distSel}
            onChange={(e) => {
              setDistSel(e.target.value);
              if (e.target.value !== 'custom') save(Number(e.target.value), timeMs, g?.startMs ?? null);
            }}
          >
            {GHOST_DISTANCES.map((d, i) => <option key={d} value={String(d)}>{tr(GHOST_NAMES[i])}</option>)}
            <option value="custom">{tr('ov.ghost.custom')}</option>
          </select>
        </label>
        {distSel === 'custom' ? (
          <label className="field">
            {tr('ov.ghost.customDist', { unit })}
            <input
              type="number"
              min={0.1}
              max={300}
              step={0.01}
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value);
                save(Number(e.target.value.replace(',', '.')) * unitM, timeMs, g?.startMs ?? null);
              }}
            />
          </label>
        ) : null}
        <label className={`field${!g ? ' suggested' : ''}`}>
          {tr('ov.ghost.time')}
          <input
            type="text"
            inputMode="numeric"
            placeholder="45:00"
            value={timeText}
            onChange={(e) => {
              setTimeText(e.target.value);
              save(distanceM, parseClock(e.target.value), g?.startMs ?? null);
            }}
          />
        </label>
        <label className="field">
          {tr('ov.ghost.start')}
          <select value={startValue} onChange={(e) => chooseStart(e.target.value)}>
            <option value="ride">{tr('ov.ghost.startRide')}</option>
            {segs.map((x) => <option key={x.id} value={`seg:${x.id}`}>{tr('ov.ghost.startSegment', { name: x.name })}</option>)}
            {clipStart !== undefined || startValue === 'clip' ? <option value="clip">{tr('ov.ghost.startClip')}</option> : null}
          </select>
        </label>
      </div>
      {timeText && !timeMs ? <p className="notice small">{tr('ov.ghost.badTime')}</p> : null}
      {g ? (
        <p className="small muted">{tr('ov.ghost.pace', { pace: `${formatPace(g.distanceM / (g.timeMs / 1000), style.units)} ${paceUnit(style.units)}` })}</p>
      ) : (
        <p className="notice small">{tr('ov.ghost.need')}</p>
      )}
    </div>
  );
}

/** A preview instant inside the ski runs (the second run when the playhead is not in one). */
function snowPreviewT(ride: RideData, t: number): number {
  const runs = detectRuns(ride);
  if (!runs.length || runs.some((r) => t >= r.startMs && t < r.endMs + 15_000)) return t;
  const r = runs[Math.min(1, runs.length - 1)];
  return r.startMs + (r.endMs - r.startMs) * 0.6;
}

function Color({ label, k }: { label: string; k: 'textColor' | 'accentColor' | 'outlineColor' | 'gradientFrom' | 'gradientTo' }) {
  const { style, setStyle } = useApp();
  const hex = /^#[0-9a-f]{6}$/i.test(style[k]) ? style[k] : '#000000';
  return (
    <label className="field">
      {label}
      <input type="color" value={hex} onChange={(e) => setStyle({ [k]: e.target.value } as Partial<OverlayStyle>)} />
    </label>
  );
}

export function StepOverlays() {
  const { ride, overlays, toggleOverlay, style, setStyle, sync, activeClipId, playhead, setStep, overlayLang, setOverlayLang, sport, setSport } = useApp();
  const tr = useT();
  const lang = useLang((s) => s.lang);
  const [theme, setTheme] = useState<OverlayTheme>(storedTheme);
  const chooseTheme = (th: OverlayTheme) => {
    setTheme(th);
    try {
      localStorage.setItem(THEME_KEY, th);
    } catch {
      /* ignore */
    }
  };
  if (!ride) return <section><p>{tr('sync.needRide')}</p></section>;
  const cycling = overlaysForSport(ride, 'cycling');
  const natal = cycling.filter((d) => d.theme === 'natal');
  const classic = cycling.filter((d) => (d.theme ?? 'default') === 'default');
  const segs = classic.filter((d) => isSegmentOverlay(d.id));
  const defs = classic.filter((d) => !panelMetricOf(d.id) && !isDialOverlay(d.id) && !isSegmentOverlay(d.id));
  const dials = classic.filter((d) => isDialOverlay(d.id));
  const panels = classic.filter((d) => panelMetricOf(d.id));
  const sportList = sport === 'cycling' ? [] : overlaysForSport(ride, sport);
  const byGroup = (g: ReturnType<typeof overlayGroup>) => sportList.filter((d) => overlayGroup(d.id) === g);
  const chartMetrics = PANEL_METRICS.filter((m) => ride.available.has(m));
  const distUnit = style.units.system === 'metric' ? 'km' : 'mi';
  const setPanel = (m: PanelMetric, patch: Partial<PanelOptions>) =>
    setStyle({ panels: { ...style.panels, [m]: { ...panelOptions(m, style, ride), ...patch } } });
  const clip = sync.clips.find((c) => c.id === activeClipId);
  const cam = clip ? sync.cameras.find((c) => c.id === clip.cameraId) : undefined;
  const cs = clip && cam ? effectiveStart(clip, cam) : undefined;
  const clipStart = cs ?? ride.startTime + (ride.endTime - ride.startTime) * 0.4;
  const clipEnd = clip ? clipStart + clip.meta.durationMs : clipStart + 60_000;
  const t = playhead?.t ?? clipStart + 1000;
  const showHr = ride.available.has('heartRate') && overlays.some((o) => getOverlay(o).requires === 'heartRate');
  const showPower = ride.available.has('power') && overlays.some((o) => getOverlay(o).requires === 'power' || isSegmentOverlay(o));
  // Segment gadgets are empty outside segments: preview them inside one (the second lap, if any).
  const sortedSegs = sortedSegments(style.segments);
  const sample = sortedSegs[Math.min(1, sortedSegs.length - 1)];
  const segT = segmentAt(style.segments, t) || !sample ? t : sample.startMs + (sample.endMs - sample.startMs) * 0.6;
  // The PR ghost is previewed during the race (40 % of the PR time in, when the playhead is outside it).
  const ghostStart = style.ghost?.startMs ?? ride.startTime;
  const ghostT = style.ghost && (t < ghostStart || t > ghostStart + style.ghost.timeMs * 1.1) ? ghostStart + style.ghost.timeMs * 0.4 : t;
  const previewT = (d: OverlayDefinition) =>
    isSegmentOverlay(d.id) ? segT : d.id === 'runGhost' ? ghostT : d.id === 'snowRunLive' || d.id === 'snowRuns' ? snowPreviewT(ride, t) : t;

  const card = (d: OverlayDefinition) => (
    <label key={d.id} className={`overlay-card${overlays.includes(d.id) ? ' on' : ''}`}>
      <input type="checkbox" checked={overlays.includes(d.id)} onChange={(e) => toggleOverlay(d.id, e.target.checked)} />
      <span>{overlayLabel(d.id, lang)}</span>
      <div className="checker">
        <OverlayCanvas id={d.id} ride={ride} style={style} t={previewT(d)} clipStart={clipStart} clipEnd={clipEnd} cssScale={0.45} fitHeight={190} />
      </div>
    </label>
  );
  const grid = (list: OverlayDefinition[]) => (list.length ? <div className="overlay-grid">{list.map(card)}</div> : null);
  const panelGrid = (list: OverlayDefinition[]) => (
    <div className="overlay-grid panels">
      {list.map((d) => {
        const m = panelMetricOf(d.id)!;
        const o = panelOptions(m, style, ride);
        const on = overlays.includes(d.id);
        return (
          <div key={d.id} className={`overlay-card${on ? ' on' : ''}`}>
            <label className="overlay-card-head">
              <input type="checkbox" checked={on} onChange={(e) => toggleOverlay(d.id, e.target.checked)} />
              <span>{overlayLabel(d.id, lang)}</span>
            </label>
            <div className="panel-opts">
              <label className="field">
                {tr('ov.chart')}
                <select value={o.chart} onChange={(e) => setPanel(m, { chart: e.target.value as PanelMetric })}>
                  {chartMetrics.map((c) => <option key={c} value={c}>{panelMetricName(c, lang)}</option>)}
                </select>
              </label>
              <label className="field">
                {tr('ov.window')}
                <select value={o.window} onChange={(e) => setPanel(m, { window: e.target.value as PanelOptions['window'] })}>
                  <option value="time">{tr('ov.lastMin', { n: style.chartMinutes })}</option>
                  <option value="distance">{tr('ov.lastDist', { n: style.chartDistance, unit: distUnit })}</option>
                </select>
              </label>
            </div>
            <div className="checker" onClick={() => toggleOverlay(d.id, !on)}>
              <OverlayCanvas id={d.id} ride={ride} style={style} t={t} clipStart={clipStart} clipEnd={clipEnd} cssScale={0.45} fitHeight={220} />
            </div>
          </div>
        );
      })}
    </div>
  );
  /** Gadgets, dials and panels of a sport other than cycling (same sections as cycling). */
  const sportSections = (lead: string) => (
    <>
      <p className="lead">{lead}</p>
      <h3>{tr('ov.gadgets')}</h3>
      {grid(byGroup('gadget'))}
      <h3>{tr('ov.dials')}</h3>
      {grid(byGroup('dial'))}
      {byGroup('panel').length ? (
        <>
          <h3>{tr('ov.panels')}</h3>
          <p className="lead">{tr('ov.panelsLead')}</p>
          {panelGrid(byGroup('panel'))}
        </>
      ) : null}
    </>
  );

  return (
    <section>
      <h2>{tr('ov.title')}</h2>
      <p className="lead">{tr('ov.lead')}</p>
      <div className="sport-tabs" role="tablist">
        {SPORTS.map((sp: Sport) => {
          const n = overlays.filter((o) => overlaySports(o).includes(sp)).length;
          return (
            <button key={sp} role="tab" aria-selected={sport === sp} className={sport === sp ? 'active' : ''} onClick={() => setSport(sp)}>
              {tr(`ov.sport.${sp}`)}
              {n ? <span className="theme-count">{n}</span> : null}
              {ride.sport === sp ? <span className="sport-file">{tr('ov.sportFromFile')}</span> : null}
            </button>
          );
        })}
      </div>

      {showPower ? <PowerOptions /> : null}
      {showHr ? <HeartRateOptions /> : null}

      {sport === 'cycling' ? (
        <>
          <div className="theme-tabs" role="tablist">
            {OVERLAY_THEMES.map((th) => {
              const n = overlays.filter((o) => overlayTheme(o) === th && overlaySports(o).includes('cycling')).length;
              return (
                <button key={th} role="tab" aria-selected={theme === th} className={theme === th ? 'active' : ''} onClick={() => chooseTheme(th)}>
                  {tr(`ov.theme.${th}`)}
                  {n ? <span className="theme-count">{n}</span> : null}
                </button>
              );
            })}
          </div>
          {theme === 'default' ? (
            <>
              {grid(defs)}
              <h3>{tr('ov.dials')}</h3>
              <p className="lead">{tr('ov.dialsLead')}</p>
              {grid(dials)}
              <h3>{tr('ov.panels')}</h3>
              <p className="lead">{tr('ov.panelsLead')}</p>
              {panelGrid(panels)}
              <h3>{tr('seg.section')}</h3>
              <p className="lead">{tr('seg.sectionLead')}</p>
              {style.segments.length === 0 ? <p className="notice">{tr('seg.noneHint')}</p> : null}
              {grid(segs)}
            </>
          ) : (
            <>
              <p className="lead">{tr('ov.natalLead')}</p>
              {grid(natal)}
            </>
          )}
        </>
      ) : sport === 'running' ? (
        <>
          {sportSections(tr('ov.run.lead'))}
          <h3>{tr('ov.run.live')}</h3>
          <p className="lead">{tr('ov.run.liveLead')}</p>
          <GhostOptions clipStart={cs} />
          {style.segments.length === 0 ? <p className="notice">{tr('seg.noneHint')}</p> : null}
          {grid(byGroup('live'))}
        </>
      ) : (
        <>
          {sportSections(tr('ov.snow.lead'))}
          <h3>{tr('ov.snow.live')}</h3>
          <p className="lead">{tr('ov.snow.liveLead')}</p>
          {detectRuns(ride).length === 0 ? <p className="notice">{tr('ov.snow.noRuns')}</p> : null}
          {grid(byGroup('live'))}
        </>
      )}

      <h3>{tr('ov.style')}</h3>
      <div className="style-form">
        <label className="field">
          {tr('ov.language')}
          <select value={overlayLang} onChange={(e) => setOverlayLang(e.target.value as Lang | 'auto')}>
            <option value="auto">{tr('ov.sameAsApp', { name: langName(lang) })}</option>
            {LANGS.map((l) => <option key={l} value={l}>{langName(l)}</option>)}
          </select>
        </label>
        <Color label={tr('ov.text')} k="textColor" />
        <Color label={tr('ov.accent')} k="accentColor" />
        <Color label={tr('ov.outline')} k="outlineColor" />
        <label className="field">
          {tr('ov.outlineWidth')}
          <input type="range" min={0} max={8} step={0.5} value={style.outlineWidth} onChange={(e) => setStyle({ outlineWidth: Number(e.target.value) })} />
        </label>
        <label className="field check"><input type="checkbox" checked={style.shadow} onChange={(e) => setStyle({ shadow: e.target.checked })} /> {tr('ov.shadow')}</label>
        <label className="field check"><input type="checkbox" checked={style.showLabel} onChange={(e) => setStyle({ showLabel: e.target.checked })} /> {tr('ov.labels')}</label>
        <label className="field check"><input type="checkbox" checked={style.showUnit} onChange={(e) => setStyle({ showUnit: e.target.checked })} /> {tr('ov.units')}</label>
        <label className="field">
          {tr('ov.font')}
          <input value={style.fontFamily} onChange={(e) => setStyle({ fontFamily: e.target.value })} list="fonts" />
          <datalist id="fonts">
            <option value="TelemeSync Inter" />
          </datalist>
        </label>
        <label className="field">
          {tr('ov.units')}
          <select value={style.units.system} onChange={(e) => setStyle({ units: { ...style.units, system: e.target.value as 'metric' | 'imperial' } })}>
            <option value="metric">{tr('ov.metric')}</option>
            <option value="imperial">{tr('ov.imperial')}</option>
          </select>
        </label>
        <label className="field">
          {tr('ov.temperature')}
          <select value={style.units.temperature} onChange={(e) => setStyle({ units: { ...style.units, temperature: e.target.value as 'C' | 'F' } })}>
            <option value="C">°C</option>
            <option value="F">°F</option>
          </select>
        </label>
        <label className="field">
          {tr('ov.rate')}
          <select value={style.textRateHz} onChange={(e) => setStyle({ textRateHz: Number(e.target.value) })}>
            {[1, 2, 4, 5, 10].map((v) => <option key={v} value={v}>{v} Hz</option>)}
          </select>
        </label>
        <label className="field">
          {tr('ov.resolution')}
          <select value={style.scale} onChange={(e) => setStyle({ scale: Number(e.target.value) })}>
            {[1, 1.5, 2, 3].map((v) => <option key={v} value={v}>{v}×</option>)}
          </select>
        </label>
        <label className="field">
          {tr('ov.map')}
          <select value={style.mapMode} onChange={(e) => setStyle({ mapMode: e.target.value as 'full' | 'clip' })}>
            <option value="full">{tr('ov.mapFull')}</option>
            <option value="clip">{tr('ov.mapClip')}</option>
          </select>
        </label>
        <label className="field">
          {tr('ov.gapSpeed')}
          <select value={style.gapSpeed} onChange={(e) => setStyle({ gapSpeed: e.target.value as 'zero' | 'dash' })}>
            <option value="zero">0</option>
            <option value="dash">—</option>
          </select>
        </label>
        <Color label={tr('ov.gradientLow')} k="gradientFrom" />
        <Color label={tr('ov.gradientHigh')} k="gradientTo" />
        <label className="field">
          {tr('ov.panelRate')}
          <select value={style.panelRate} onChange={(e) => setStyle({ panelRate: e.target.value as OverlayStyle['panelRate'] })}>
            <option value="smooth">{tr('ov.smooth')}</option>
            <option value="text">{tr('ov.textRate')}</option>
          </select>
        </label>
        <label className="field">
          {tr('ov.panelBg')}
          <input type="range" min={0} max={1} step={0.05} value={style.panelOpacity} onChange={(e) => setStyle({ panelOpacity: Number(e.target.value) })} />
        </label>
        <label className="field">
          {tr('ov.timeWindow')}
          <input type="number" min={1} max={120} step={1} value={style.chartMinutes} onChange={(e) => Number(e.target.value) > 0 && setStyle({ chartMinutes: Number(e.target.value) })} />
        </label>
        <label className="field">
          {tr('ov.distWindow', { unit: distUnit })}
          <input type="number" min={0.5} max={200} step={0.5} value={style.chartDistance} onChange={(e) => Number(e.target.value) > 0 && setStyle({ chartDistance: Number(e.target.value) })} />
        </label>
        <button className="small" onClick={() => setStyle({ ...DEFAULT_STYLE, language: style.language, segments: style.segments, weightKg: style.weightKg, ftp: style.ftp, hrZones: style.hrZones, hrMax: style.hrMax })}>{tr('ov.resetStyle')}</button>
      </div>
      <button className="primary" onClick={() => setStep('render')} disabled={!overlays.length}>{tr('ov.next')}</button>
    </section>
  );
}
