// Gadget picker of step 4, organised on three axes that are the same everywhere: the sport (which metrics), the
// theme (the look, as a gallery of cards) and the category (the kind of gadget). The gadgets already chosen are
// listed as chips at the top, whatever their theme, so mixing themes never gets lost.
import { useState } from 'react';
import {
  categoryName,
  GADGET_CATEGORIES,
  glassPanelMetricOf,
  isSegmentOverlay,
  offeredThemes,
  overlayCategory,
  overlayLabel,
  overlayTheme,
  PANEL_METRICS,
  panelMetricName,
  panelMetricOf,
  panelOptions,
  sportName,
  sportOf,
  SPORTS,
  themeInfo,
  themeLead,
  themeName,
  themeOverlays,
  WATCH_METRICS,
  watchMetricName,
  watchModeName,
  watchOptions,
  type OverlayDefinition,
  type RideData,
  type WatchField,
  type WatchMetric,
  type WatchMode,
  type OverlayId,
  type PanelMetric,
  type PanelOptions,
  type Sport,
  type ThemeId,
} from '@telemesync/core';
import { OverlayCanvas } from './OverlayCanvas.tsx';
import { useLang, useT } from '../i18n/index.tsx';
import { useApp } from '../lib/store.ts';

const THEME_KEY = 'telemesync.overlayTheme';
const PREVIEW_KEY = 'telemesync.previewThemes';

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** Gadget shown on a theme's card: a dial (heart rate or speed first), else its first gadget. */
function coverOf(defs: OverlayDefinition[]): OverlayDefinition | undefined {
  const dials = defs.filter((d) => overlayCategory(d.id) === 'dials');
  return dials.find((d) => /heartRate|HeartRate/.test(d.id)) ?? dials.find((d) => /speed|Speed|pace/.test(d.id)) ?? dials[0] ?? defs[0];
}

/** Options of the GPS watch: 3 or 4 fields, each a metric shown now, as an average, for the lap or as the maximum. */
function WatchOptionsForm({ ride }: { ride: RideData }) {
  const { style, setStyle } = useApp();
  const tr = useT();
  const lang = useLang((s) => s.lang);
  const opts = watchOptions(style);
  const metrics = WATCH_METRICS.filter((m) => ride.available.has(m.requires));
  const setFields = (fields: WatchField[]) => setStyle({ watch: { ...opts, fields } });
  const setField = (k: number, patch: Partial<WatchField>) => {
    const fields = opts.fields.map((f, i) => (i === k ? { ...f, ...patch } : f));
    // A mode the new metric does not have falls back to "now".
    const spec = WATCH_METRICS.find((m) => m.metric === fields[k].metric)!;
    if (!spec.modes.includes(fields[k].mode)) fields[k] = { ...fields[k], mode: 'now' };
    setFields(fields);
  };
  const setCount = (n: number) => {
    const fields = opts.fields.slice(0, n);
    while (fields.length < n) fields.push({ metric: 'distance', mode: 'now' });
    setFields(fields);
  };
  return (
    <div className="watch-opts" onClick={(e) => e.stopPropagation()}>
      <label className="field">
        {tr('ov.watch.count')}
        <select value={opts.fields.length} onChange={(e) => setCount(Number(e.target.value))}>
          <option value={3}>3</option>
          <option value={4}>4</option>
        </select>
      </label>
      {opts.fields.map((f, k) => {
        const spec = WATCH_METRICS.find((m) => m.metric === f.metric)!;
        return (
          <div key={k} className="watch-field">
            <span className="watch-field__n">{tr('ov.watch.field', { n: k + 1 })}</span>
            <select value={f.metric} onChange={(e) => setField(k, { metric: e.target.value as WatchMetric })}>
              {metrics.map((m) => (
                <option key={m.metric} value={m.metric}>
                  {watchMetricName(m.metric, lang)}
                </option>
              ))}
            </select>
            <select value={f.mode} onChange={(e) => setField(k, { mode: e.target.value as WatchMode })} disabled={spec.modes.length < 2}>
              {spec.modes.map((m) => (
                <option key={m} value={m}>
                  {watchModeName(m, lang)}
                </option>
              ))}
            </select>
          </div>
        );
      })}
      {ride.available.has('heartRate') ? (
        <label className="field check small">
          <input type="checkbox" checked={opts.hrGauge} onChange={(e) => setStyle({ watch: { ...opts, hrGauge: e.target.checked } })} /> {tr('ov.watch.gauge')}
        </label>
      ) : null}
    </div>
  );
}

interface Times {
  t: number;
  segT: number;
  clipStart: number;
  clipEnd: number;
}

export function GadgetPicker({ times }: { times: Times }) {
  const { ride, overlays, toggleOverlay, style, setStyle } = useApp();
  const tr = useT();
  const lang = useLang((s) => s.lang);
  const [showPreview, setShowPreview] = useState(() => load(PREVIEW_KEY) === '1');
  const [stored, setStored] = useState<ThemeId>(() => (load(THEME_KEY) as ThemeId) ?? 'default');
  if (!ride) return null;
  const sport = sportOf(style, ride);
  const themes = offeredThemes(sport, showPreview);
  const theme: ThemeId = themes.includes(stored) ? stored : 'default';
  const choose = (th: ThemeId) => {
    setStored(th);
    save(THEME_KEY, th);
  };
  const defs = themeOverlays(ride, theme, sport);
  const sections = GADGET_CATEGORIES.map((c) => ({ c, list: defs.filter((d) => overlayCategory(d.id) === c) })).filter((s) => s.list.length);
  const { t, segT, clipStart, clipEnd } = times;
  const thumb = (id: OverlayId, at = t, h = 190) => <OverlayCanvas id={id} ride={ride} style={style} t={at} clipStart={clipStart} clipEnd={clipEnd} cssScale={0.45} fitHeight={h} />;
  const chartMetrics = PANEL_METRICS.filter((m) => ride.available.has(m));
  const distUnit = style.units.system === 'metric' ? 'km' : 'mi';
  const setPanel = (m: PanelMetric, patch: Partial<PanelOptions>) =>
    setStyle({ panels: { ...style.panels, [m]: { ...panelOptions(m, style, ride), ...patch } } });

  return (
    <div className="picker">
      {/* 1. Sport: which metrics (pace for running, vertical drop for ski…) and which themes come first. */}
      <div className="sport-row">
        <span className="sport-row__label">{tr('ov.sport')}</span>
        {SPORTS.map((s: Sport) => (
          <button
            key={s}
            type="button"
            className={`chip-toggle${s === sport ? ' on' : ''}`}
            aria-pressed={s === sport}
            onClick={() => setStyle({ sport: s === ride.sport ? undefined : s })}
          >
            {sportName(s, lang)}
          </button>
        ))}
        <span className="sport-row__note">
          {style.sport && style.sport !== ride.sport
            ? tr('ov.sportChosen', { sport: sportName(ride.sport, lang) })
            : ride.sportFromFile
              ? tr('ov.sportFromFile')
              : tr('ov.sportGuessed')}
        </span>
      </div>

      {/* 2. Theme gallery. */}
      <div className="theme-head">
        <h3>{tr('ov.themes')}</h3>
        <label className="field check small">
          <input
            type="checkbox"
            checked={showPreview}
            onChange={(e) => {
              setShowPreview(e.target.checked);
              save(PREVIEW_KEY, e.target.checked ? '1' : '0');
            }}
          />{' '}
          {tr('ov.showPreview')}
        </label>
      </div>
      <div className="theme-gallery" role="tablist">
        {themes.map((th) => {
          const info = themeInfo(th);
          const tdefs = themeOverlays(ride, th, sport);
          const cover = coverOf(tdefs);
          const used = overlays.filter((o) => overlayTheme(o) === th).length;
          return (
            <button
              key={th}
              type="button"
              role="tab"
              aria-selected={th === theme}
              className={`theme-card${th === theme ? ' on' : ''}`}
              style={{ '--accent': info.accent } as React.CSSProperties}
              onClick={() => choose(th)}
            >
              <span className={`theme-card__cover${th === 'glass' ? ' glass-backdrop' : ''}`}>{cover ? thumb(cover.id, t, 120) : null}</span>
              <span className="theme-card__name">
                {themeName(th, lang)}
                {used ? <span className="theme-count">{used}</span> : null}
              </span>
              <span className="theme-card__tags">
                {info.status === 'preview' ? <span className="tag preview">{tr('ov.preview')}</span> : null}
                {info.sports.includes(sport) ? <span className="tag">{sportName(sport, lang)}</span> : null}
              </span>
            </button>
          );
        })}
      </div>

      {/* 3. Gadgets in use, from any theme. */}
      <div className="in-use">
        <span className="in-use__label">{tr('ov.inUse', { n: overlays.length })}</span>
        {overlays.length ? (
          overlays.map((id) => (
            <span key={id} className="chip-x">
              <button type="button" className="chip-x__name" onClick={() => choose(overlayTheme(id))} title={themeName(overlayTheme(id), lang)}>
                {overlayLabel(id, lang)}
              </button>
              <button type="button" className="chip-x__del" aria-label={tr('ov.remove')} onClick={() => toggleOverlay(id, false)}>
                ×
              </button>
            </span>
          ))
        ) : (
          <span className="in-use__none">{tr('ov.inUseNone')}</span>
        )}
      </div>

      {/* 4. The theme's gadgets by category. */}
      <p className="lead">{themeLead(theme, lang)}</p>
      {sections.map(({ c, list }) => (
        <section key={c} className="gadget-section">
          <h3>{categoryName(c, lang)}</h3>
          {c === 'segments' ? (
            <>
              <p className="lead">{tr('seg.sectionLead')}</p>
              {style.segments.length === 0 ? <p className="notice">{tr('seg.noneHint')}</p> : null}
            </>
          ) : null}
          <div className={`overlay-grid${c === 'panels' ? ' panels' : ''}${theme === 'glass' ? ' glass' : ''}`}>
            {list.map((d) => {
              const on = overlays.includes(d.id);
              const m = panelMetricOf(d.id) ?? glassPanelMetricOf(d.id);
              if (m) {
                const o = panelOptions(m, style, ride);
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
                          {chartMetrics.map((cm) => <option key={cm} value={cm}>{panelMetricName(cm, lang)}</option>)}
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
                    <div className={`checker${theme === 'glass' ? ' glass-backdrop' : ''}`} onClick={() => toggleOverlay(d.id, !on)}>
                      {thumb(d.id, t, 220)}
                    </div>
                  </div>
                );
              }
              if (d.id === 'minimal.gpsWatch') {
                return (
                  <div key={d.id} className={`overlay-card${on ? ' on' : ''}`}>
                    <label className="overlay-card-head">
                      <input type="checkbox" checked={on} onChange={(e) => toggleOverlay(d.id, e.target.checked)} />
                      <span>{overlayLabel(d.id, lang)}</span>
                    </label>
                    <WatchOptionsForm ride={ride} />
                    <div className="checker" onClick={() => toggleOverlay(d.id, !on)}>
                      {thumb(d.id, t, 260)}
                    </div>
                  </div>
                );
              }
              return (
                <label key={d.id} className={`overlay-card${on ? ' on' : ''}`}>
                  <input type="checkbox" checked={on} onChange={(e) => toggleOverlay(d.id, e.target.checked)} />
                  <span>{overlayLabel(d.id, lang)}</span>
                  <div className={`checker${theme === 'glass' ? ' glass-backdrop' : ''}`}>{thumb(d.id, isSegmentOverlay(d.id) ? segT : t)}</div>
                </label>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
