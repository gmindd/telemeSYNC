import { convert, formatDateTime, formatDuration, formatNumber, OVERLAYS, overlayLabel } from '@telemesync/core';
import { Dropzone } from '../components/Dropzone.tsx';
import { useLang, useT } from '../i18n/index.tsx';
import { useApp } from '../lib/store.ts';
import { fmtBytes } from '../lib/format.ts';

export function StepTelemetry() {
  const { ride, rideFile, rideError, rideLoading, loadTelemetry, setStep, style } = useApp();
  const t = useT();
  const lang = useLang((s) => s.lang);
  const u = style.units;
  const speed = (ms: number) => `${formatNumber(convert.speed(ms, u), 1, lang)} ${convert.speedUnit(u)}`;
  return (
    <section>
      <h2>{t('nav.telemetry')}</h2>
      <p className="lead">{t('tel.lead')}</p>
      <Dropzone accept=".fit,.gpx,.FIT,.GPX" onFiles={(f) => loadTelemetry(f[0])}>
        {rideLoading ? t('tel.reading') : t('tel.drop', { files: `.fit ${t('tel.or')} .gpx` })}
      </Dropzone>
      {rideError ? <p className="error">{rideError}</p> : null}
      {ride && rideFile ? (
        <div className="card">
          <h3>
            {rideFile.name} <span className="muted">({fmtBytes(rideFile.size, lang)}, {ride.source.toUpperCase()}{ride.device ? ` · ${ride.device}` : ''})</span>
          </h3>
          <div className="stats">
            <div><span>{t('tel.start')}</span><b>{formatDateTime(ride.startTime, style.timeZone)}</b></div>
            <div><span>{t('tel.duration')}</span><b>{formatDuration(ride.totals.durationMs)}</b></div>
            <div><span>{t('tel.distance')}</span><b>{formatNumber(convert.distance(ride.totals.distanceM, u), 2, lang)} {convert.distanceUnit(u)}</b></div>
            <div><span>{t('tel.gain')}</span><b>{Math.round(convert.elevation(ride.totals.elevationGainM, u))} {convert.elevationUnit(u)}</b></div>
            <div><span>{t('tel.maxSpeed')}</span><b>{speed(ride.totals.maxSpeed)}</b></div>
            <div><span>{t('tel.avgSpeed')}</span><b>{speed(ride.totals.avgMovingSpeed)}</b></div>
          </div>
          <p>
            {t('tel.metrics')}{' '}
            {OVERLAYS.filter((o) => ride.available.has(o.requires)).map((o) => (
              <span key={o.id} className="chip">{overlayLabel(o.id, lang)}</span>
            ))}
          </p>
          {ride.localOffsetMs !== undefined ? (
            <p className="muted">{t('tel.tz', { offset: `${ride.localOffsetMs >= 0 ? '+' : '−'}${formatNumber(Math.abs(ride.localOffsetMs / 3600_000), Number.isInteger(ride.localOffsetMs / 3600_000) ? 0 : 1, lang)}` })}</p>
          ) : null}
          <button className="primary" onClick={() => setStep('clips')}>{t('tel.next')}</button>
        </div>
      ) : null}
    </section>
  );
}
