import { formatDateTime, formatDuration, OVERLAYS } from '@telemesync/core';
import { Dropzone } from '../components/Dropzone.tsx';
import { useApp } from '../lib/store.ts';
import { fmtBytes } from '../lib/format.ts';

export function StepTelemetry() {
  const { ride, rideFile, rideError, rideLoading, loadTelemetry, setStep, style } = useApp();
  return (
    <section>
      <h2>1. Telemetria</h2>
      <p className="lead">Carregue o ficheiro FIT (preferido) ou GPX do ciclocomputador (Bryton, Garmin, iGPSPORT…).</p>
      <Dropzone accept=".fit,.gpx,.FIT,.GPX" onFiles={(f) => loadTelemetry(f[0])}>
        {rideLoading ? 'A ler…' : <>Arraste aqui o ficheiro <b>.fit</b> ou <b>.gpx</b>, ou clique para escolher</>}
      </Dropzone>
      {rideError ? <p className="error">{rideError}</p> : null}
      {ride && rideFile ? (
        <div className="card">
          <h3>
            {rideFile.name} <span className="muted">({fmtBytes(rideFile.size)}, {ride.source.toUpperCase()}{ride.device ? ` · ${ride.device}` : ''})</span>
          </h3>
          <div className="stats">
            <div><span>Início</span><b>{formatDateTime(ride.startTime, style.timeZone)}</b></div>
            <div><span>Duração</span><b>{formatDuration(ride.totals.durationMs)}</b></div>
            <div><span>Distância</span><b>{(ride.totals.distanceM / 1000).toFixed(2).replace('.', ',')} km</b></div>
            <div><span>D+</span><b>{Math.round(ride.totals.elevationGainM)} m</b></div>
            <div><span>Vel. máx.</span><b>{(ride.totals.maxSpeed * 3.6).toFixed(1).replace('.', ',')} km/h</b></div>
            <div><span>Vel. média (em movimento)</span><b>{(ride.totals.avgMovingSpeed * 3.6).toFixed(1).replace('.', ',')} km/h</b></div>
          </div>
          <p>
            Métricas disponíveis:{' '}
            {OVERLAYS.filter((o) => ride.available.has(o.requires)).map((o) => (
              <span key={o.id} className="chip">{o.label}</span>
            ))}
          </p>
          {ride.localOffsetMs !== undefined ? (
            <p className="muted">O dispositivo registou um fuso de UTC{ride.localOffsetMs >= 0 ? '+' : '−'}{Math.abs(ride.localOffsetMs / 3600_000)} h.</p>
          ) : null}
          <button className="primary" onClick={() => setStep('clips')}>Seguinte: clips →</button>
        </div>
      ) : null}
    </section>
  );
}
