import { availableOverlays, DEFAULT_STYLE, effectiveStart, type OverlayStyle } from '@telemesync/core';
import { OverlayCanvas } from '../components/OverlayCanvas.tsx';
import { useApp } from '../lib/store.ts';

function Color({ label, k }: { label: string; k: 'textColor' | 'accentColor' | 'outlineColor' }) {
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
  const { ride, overlays, toggleOverlay, style, setStyle, sync, activeClipId, playhead, setStep } = useApp();
  if (!ride) return <section><p>Carregue primeiro a telemetria.</p></section>;
  const defs = availableOverlays(ride);
  const clip = sync.clips.find((c) => c.id === activeClipId);
  const cam = clip ? sync.cameras.find((c) => c.id === clip.cameraId) : undefined;
  const cs = clip && cam ? effectiveStart(clip, cam) : undefined;
  const clipStart = cs ?? ride.startTime + (ride.endTime - ride.startTime) * 0.4;
  const clipEnd = clip ? clipStart + clip.meta.durationMs : clipStart + 60_000;
  const t = playhead?.t ?? clipStart + 1000;

  return (
    <section>
      <h2>4. Overlays e estilo</h2>
      <p className="lead">Cada overlay escolhido gera um vídeo transparente por clip. Só aparecem as métricas que existem no ficheiro.</p>
      <div className="overlay-grid">
        {defs.map((d) => (
          <label key={d.id} className={`overlay-card${overlays.includes(d.id) ? ' on' : ''}`}>
            <input type="checkbox" checked={overlays.includes(d.id)} onChange={(e) => toggleOverlay(d.id, e.target.checked)} />
            <span>{d.label}</span>
            <div className="checker">
              <OverlayCanvas id={d.id} ride={ride} style={style} t={t} clipStart={clipStart} clipEnd={clipEnd} cssScale={0.45} fitHeight={190} />
            </div>
          </label>
        ))}
      </div>

      <h3>Estilo</h3>
      <div className="style-form">
        <Color label="Texto" k="textColor" />
        <Color label="Destaque" k="accentColor" />
        <Color label="Contorno" k="outlineColor" />
        <label className="field">
          Espessura do contorno
          <input type="range" min={0} max={8} step={0.5} value={style.outlineWidth} onChange={(e) => setStyle({ outlineWidth: Number(e.target.value) })} />
        </label>
        <label className="field check"><input type="checkbox" checked={style.shadow} onChange={(e) => setStyle({ shadow: e.target.checked })} /> Sombra</label>
        <label className="field check"><input type="checkbox" checked={style.showLabel} onChange={(e) => setStyle({ showLabel: e.target.checked })} /> Rótulos</label>
        <label className="field check"><input type="checkbox" checked={style.showUnit} onChange={(e) => setStyle({ showUnit: e.target.checked })} /> Unidades</label>
        <label className="field">
          Fonte
          <input value={style.fontFamily} onChange={(e) => setStyle({ fontFamily: e.target.value })} list="fonts" />
          <datalist id="fonts">
            <option value="TelemeSync Inter" />
          </datalist>
        </label>
        <label className="field">
          Unidades
          <select value={style.units.system} onChange={(e) => setStyle({ units: { ...style.units, system: e.target.value as 'metric' | 'imperial' } })}>
            <option value="metric">Métricas (km/h, m)</option>
            <option value="imperial">Imperiais (mph, ft)</option>
          </select>
        </label>
        <label className="field">
          Temperatura
          <select value={style.units.temperature} onChange={(e) => setStyle({ units: { ...style.units, temperature: e.target.value as 'C' | 'F' } })}>
            <option value="C">°C</option>
            <option value="F">°F</option>
          </select>
        </label>
        <label className="field">
          Atualização dos números
          <select value={style.textRateHz} onChange={(e) => setStyle({ textRateHz: Number(e.target.value) })}>
            {[1, 2, 4, 5, 10].map((v) => <option key={v} value={v}>{v} Hz</option>)}
          </select>
        </label>
        <label className="field">
          Resolução
          <select value={style.scale} onChange={(e) => setStyle({ scale: Number(e.target.value) })}>
            {[1, 1.5, 2, 3].map((v) => <option key={v} value={v}>{v}×</option>)}
          </select>
        </label>
        <label className="field">
          Mapa
          <select value={style.mapMode} onChange={(e) => setStyle({ mapMode: e.target.value as 'full' | 'clip' })}>
            <option value="full">Volta inteira</option>
            <option value="clip">Zoom no troço do clip</option>
          </select>
        </label>
        <label className="field">
          Velocidade numa pausa
          <select value={style.gapSpeed} onChange={(e) => setStyle({ gapSpeed: e.target.value as 'zero' | 'dash' })}>
            <option value="zero">0</option>
            <option value="dash">—</option>
          </select>
        </label>
        {ride.available.has('heartRate') ? (
          <>
            <label className="field check"><input type="checkbox" checked={style.colorByZone} onChange={(e) => setStyle({ colorByZone: e.target.checked })} /> Cor da FC por zona</label>
            <label className="field">
              Zonas FC (limites superiores Z1–Z4, bpm)
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
        <button className="small" onClick={() => setStyle(DEFAULT_STYLE)}>Repor estilo</button>
      </div>
      <button className="primary" onClick={() => setStep('render')} disabled={!overlays.length}>Seguinte: renderizar →</button>
    </section>
  );
}
