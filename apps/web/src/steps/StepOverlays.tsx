import {
  availableOverlays,
  DEFAULT_STYLE,
  effectiveStart,
  isDialOverlay,
  LANGS,
  overlayLabel,
  PANEL_METRICS,
  panelMetricName,
  panelMetricOf,
  panelOptions,
  type Lang,
  type OverlayStyle,
  type PanelMetric,
  type PanelOptions,
} from '@telemesync/core';
import { OverlayCanvas } from '../components/OverlayCanvas.tsx';
import { langName, useLang, useT } from '../i18n/index.tsx';
import { useApp } from '../lib/store.ts';

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
  if (!ride) return <section><p>{tr('sync.needRide')}</p></section>;
  const all = availableOverlays(ride);
  const defs = all.filter((d) => !panelMetricOf(d.id) && !isDialOverlay(d.id));
  const dials = all.filter((d) => isDialOverlay(d.id));
  const panels = all.filter((d) => panelMetricOf(d.id));
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

  return (
    <section>
      <h2>{tr('ov.title')}</h2>
      <p className="lead">{tr('ov.lead')}</p>
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
        <button className="small" onClick={() => setStyle({ ...DEFAULT_STYLE, language: style.language })}>{tr('ov.resetStyle')}</button>
      </div>
      <button className="primary" onClick={() => setStep('render')} disabled={!overlays.length}>{tr('ov.next')}</button>
    </section>
  );
}
