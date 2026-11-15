// Sync: the clip's start found in its metadata, a fine adjustment, and the ride's numbers at the playhead to compare
// with what the video shows.
import { sampleAt } from '@telemesync/core';
import { clock, LANG, num, t } from '../i18n.ts';
import { startSource } from '../lib/project.ts';
import { clipStart, useProject } from '../state.ts';

// ±1 h: a camera clock in the wrong time zone (or never set after a battery change) is off by whole hours.
const STEPS = [-3600, -10, -1, -0.1, 0.1, 1, 10, 3600];

/** "+1 h 2 min 3,5 s", "−0,4 s", "0 s". */
function signed(offsetS: number): string {
  const abs = Math.round(Math.abs(offsetS) * 10) / 10;
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const sec = Math.round((abs % 60) * 10) / 10;
  const parts = [h && `${h} h`, m && `${m} min`, (sec || (!h && !m)) && `${num(sec)} s`].filter(Boolean);
  return `${offsetS > 0 ? '+' : offsetS < 0 ? '−' : ''}${parts.join(' ')}`;
}

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
  const offsetLabel = signed(s.offsetS);
  // The slider fine-tunes within ±5 min of the whole hours set with the ±1 h buttons.
  const hours = Math.round(s.offsetS / 3600) * 3600;
  const source = s.clip ? startSource(s.clip, LANG) : undefined;

  return (
    <div className="panel">
      <dl className="facts">
        <dt>{t('sync.start')}</dt>
        <dd>
          {s.autoStart ? clock(s.autoStart) : t('sync.unknown')}
          {s.autoStart && source ? <span className="fine"> · {source}</span> : null}
        </dd>
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
              {Math.abs(d) >= 3600 ? '1 h' : num(Math.abs(d))}
            </button>
          ))}
        </div>
        <input type="range" min={-300} max={300} step={0.5} value={Math.max(-300, Math.min(300, s.offsetS - hours))} onChange={(e) => s.setOffset(hours + Number(e.target.value))} aria-label={t('sync.offset')} />
      </div>
      <p className="fine">{t('sync.hint')}</p>
    </div>
  );
}
