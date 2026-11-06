import { useState } from 'react';
import {
  availableOverlays,
  DEFAULT_STYLE,
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
function PowerOptions() {
  const { style, setStyle } = useApp();
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
      {needWeight ? <p className="notice small">{tr('ov.power.needWeight')}</p> : style.powerWkg ? <p className="muted small">{tr('ov.power.lead')}</p> : null}
    </div>
  );
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
  const { ride, overlays, toggleOverlay, style, setStyle, sync, activeClipId, playhead, setStep, overlayLang, setOverlayLang } = useApp();
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
  const all = availableOverlays(ride);
  const natal = all.filter((d) => d.theme === 'natal');
  const classic = all.filter((d) => (d.theme ?? 'default') === 'default');
  const segs = classic.filter((d) => isSegmentOverlay(d.id));
  const defs = classic.filter((d) => !panelMetricOf(d.id) && !isDialOverlay(d.id) && !isSegmentOverlay(d.id));
  const dials = classic.filter((d) => isDialOverlay(d.id));
  const panels = classic.filter((d) => panelMetricOf(d.id));
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
  const showPower = ride.available.has('power') && overlays.some((o) => getOverlay(o).requires === 'power' || isSegmentOverlay(o));
  // Segment gadgets are empty outside segments: preview them inside one (the second lap, if any).
  const sortedSegs = sortedSegments(style.segments);
  const sample = sortedSegs[Math.min(1, sortedSegs.length - 1)];
  const segT = segmentAt(style.segments, t) || !sample ? t : sample.startMs + (sample.endMs - sample.startMs) * 0.6;

  return (
    <section>
      <h2>{tr('ov.title')}</h2>
      <p className="lead">{tr('ov.lead')}</p>
      <div className="theme-tabs" role="tablist">
        {OVERLAY_THEMES.map((th) => {
          const n = overlays.filter((o) => overlayTheme(o) === th).length;
          return (
            <button key={th} role="tab" aria-selected={theme === th} className={theme === th ? 'active' : ''} onClick={() => chooseTheme(th)}>
              {tr(`ov.theme.${th}`)}
              {n ? <span className="theme-count">{n}</span> : null}
            </button>
          );
        })}
      </div>

      {showPower ? <PowerOptions /> : null}

      {theme === 'default' ? (
        <>
        <div className="overlay-grid">
          {defs.map((d) => (
            <label key={d.id} className={`overlay-card${overlays.includes(d.id) ? ' on' : ''}`}>
              <input type="checkbox" checked={overlays.includes(d.id)} onChange={(e) => toggleOverlay(d.id, e.target.checked)} />
              <span>{overlayLabel(d.id, lang)}</span>
              <div className="checker">
                <OverlayCanvas id={d.id} ride={ride} style={style} t={t} clipStart={clipStart} clipEnd={clipEnd} cssScale={0.45} fitHeight={190} />
              </div>
            </label>
          ))}
        </div>

        <h3>{tr('ov.dials')}</h3>
        <p className="lead">{tr('ov.dialsLead')}</p>
        <div className="overlay-grid">
          {dials.map((d) => (
            <label key={d.id} className={`overlay-card${overlays.includes(d.id) ? ' on' : ''}`}>
              <input type="checkbox" checked={overlays.includes(d.id)} onChange={(e) => toggleOverlay(d.id, e.target.checked)} />
              <span>{overlayLabel(d.id, lang)}</span>
              <div className="checker">
                <OverlayCanvas id={d.id} ride={ride} style={style} t={t} clipStart={clipStart} clipEnd={clipEnd} cssScale={0.45} fitHeight={190} />
              </div>
            </label>
          ))}
        </div>

        <h3>{tr('ov.panels')}</h3>
        <p className="lead">{tr('ov.panelsLead')}</p>
        <div className="overlay-grid panels">
          {panels.map((d) => {
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

          <h3>{tr('seg.section')}</h3>
          <p className="lead">{tr('seg.sectionLead')}</p>
          {style.segments.length === 0 ? <p className="notice">{tr('seg.noneHint')}</p> : null}
          <div className="overlay-grid">
            {segs.map((d) => (
              <label key={d.id} className={`overlay-card${overlays.includes(d.id) ? ' on' : ''}`}>
                <input type="checkbox" checked={overlays.includes(d.id)} onChange={(e) => toggleOverlay(d.id, e.target.checked)} />
                <span>{overlayLabel(d.id, lang)}</span>
                <div className="checker">
                  <OverlayCanvas id={d.id} ride={ride} style={style} t={segT} clipStart={clipStart} clipEnd={clipEnd} cssScale={0.45} fitHeight={190} />
                </div>
              </label>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="lead">{tr('ov.natalLead')}</p>
          <div className="overlay-grid">
            {natal.map((d) => (
              <label key={d.id} className={`overlay-card${overlays.includes(d.id) ? ' on' : ''}`}>
                <input type="checkbox" checked={overlays.includes(d.id)} onChange={(e) => toggleOverlay(d.id, e.target.checked)} />
                <span>{overlayLabel(d.id, lang)}</span>
                <div className="checker">
                  <OverlayCanvas id={d.id} ride={ride} style={style} t={t} clipStart={clipStart} clipEnd={clipEnd} cssScale={0.45} fitHeight={190} />
                </div>
              </label>
            ))}
          </div>
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
        {ride.available.has('heartRate') ? (
          <>
            <label className="field check"><input type="checkbox" checked={style.colorByZone} onChange={(e) => setStyle({ colorByZone: e.target.checked })} /> {tr('ov.hrZoneColor')}</label>
            <label className="field">
              {tr('ov.hrZones')}
              <input
                value={style.hrZones.join(' / ')}
                onChange={(e) => {
                  const z = e.target.value.split(/[\s/;,]+/).map(Number).filter((n) => n > 0);
                  if (z.length === 4) setStyle({ hrZones: z });
                }}
              />
            </label>
          </>
        ) : null}
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
        {ride.available.has('power') ? (
          <label className="field">
            FTP (W)
            <input type="number" min={50} max={600} step={5} value={style.ftp} onChange={(e) => Number(e.target.value) > 0 && setStyle({ ftp: Number(e.target.value) })} />
          </label>
        ) : null}
        <button className="small" onClick={() => setStyle({ ...DEFAULT_STYLE, language: style.language, segments: style.segments, weightKg: style.weightKg })}>{tr('ov.resetStyle')}</button>
      </div>
      <button className="primary" onClick={() => setStep('render')} disabled={!overlays.length}>{tr('ov.next')}</button>
    </section>
  );
}
