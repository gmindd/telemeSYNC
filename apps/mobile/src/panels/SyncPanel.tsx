// Sync: the clip's start found in its metadata, a fine adjustment, and the ride's numbers at the playhead to compare
// with what the video shows.
import { sampleAt } from '@telemesync/core';
import { clock, num, t } from '../i18n.ts';
import { clipStart, useProject } from '../state.ts';

const STEPS = [-10, -1, -0.1, 0.1, 1, 10];

export function SyncPanel() {
  const s = useProject();
  if (!s.ride) return null;
  const at = clipStart(s) + s.playheadS * 1000;
  const sample = sampleAt(s.ride, at);
  const values = [
    s.ride.available.has('speed') && `${num(sample.speed * 3.6)} km/h`,
    s.ride.available.has('heartRate') && Number.isFinite(sample.heartRate) && `${Math.round(sample.heartRate)} bpm`,
    s.ride.available.has('power') && Number.isFinite(sample.power) && `${Math.round(sample.power)} W`,
    s.ride.available.has('altitude') && `${Math.round(sample.altitude)} m`,
  ].filter(Boolean);
  const offsetLabel = `${s.offsetS > 0 ? '+' : ''}${num(s.offsetS)} s`;

  return (
    <div className="panel">
      <dl className="facts">
        <dt>{t('sync.start')}</dt>
        <dd>{s.autoStart ? clock(s.autoStart) : t('sync.unknown')}</dd>
        <dt>{t('sync.atPlayhead')}</dt>
        <dd>
          <b>{clock(at)}</b> {sample.outside ? <span className="warn">· {t('sync.outside')}</span> : `· ${values.join(' · ')}`}
        </dd>
      </dl>
      <div className="offset">
        <div className="offset__head">
          <span>{t('sync.offset')}</span>
          <b className="offset__value">{offsetLabel}</b>
          <button type="button" className="link" disabled={!s.offsetS} onClick={() => s.setOffset(0)}>
            {t('sync.reset')}
          </button>
        </div>
        <div className="offset__steps">
          {STEPS.map((d) => (
            <button key={d} type="button" className="chip-btn" onClick={() => s.setOffset(Math.round((s.offsetS + d) * 10) / 10)}>
              {d > 0 ? '+' : '−'}
              {num(Math.abs(d))}
            </button>
          ))}
        </div>
        <input type="range" min={-300} max={300} step={0.5} value={s.offsetS} onChange={(e) => s.setOffset(Number(e.target.value))} aria-label={t('sync.offset')} />
      </div>
      <p className="fine">{t('sync.hint')}</p>
    </div>
  );
}
