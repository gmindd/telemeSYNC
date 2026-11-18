// Activity picker: the athlete's Strava activities near the clip's time (the one the clip was filmed in at the top,
// marked), or the latest ones; tapping one loads its streams as the ride.
import { useEffect, useState } from 'react';
import { activityForClip, formatDuration, type RideData } from '@telemesync/core';
import { clock, num, t, LOCALE } from '../i18n.ts';
import { activityUrl, listActivities, loadActivityRide, openExternal, type ActivityItem } from '../lib/strava.ts';
import poweredByStrava from '../assets/strava/api_logo_pwrdBy_strava_horiz_white.svg';

export function stravaMessage(e: unknown): string {
  const m = (e as Error).message;
  if (m === 'signed out') return t('strava.signedOut');
  if (m === 'rate') return t('strava.rate');
  if (m === 'scope') return t('strava.scope');
  return t('strava.error', { msg: m });
}

export function StravaSheet(props: { clipStart?: number; onRide: (ride: RideData) => void; onClose: () => void; onSignedOut: () => void }) {
  const [around, setAround] = useState<number | undefined>(props.clipStart);
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setItems(null);
    setError('');
    listActivities(around)
      .then((list) => alive && setItems(list))
      .catch((e) => {
        if (!alive) return;
        setError(stravaMessage(e));
        if ((e as Error).message === 'signed out') props.onSignedOut();
        setItems([]);
      });
    return () => {
      alive = false;
    };
  }, [around]);

  const match = items && props.clipStart ? activityForClip(items, props.clipStart) : undefined;
  const ordered = items && match ? [match, ...items.filter((a) => a !== match)] : items;

  async function pick(a: ActivityItem) {
    setBusy(a.key);
    setError('');
    try {
      props.onRide(await loadActivityRide(a));
    } catch (e) {
      setError(stravaMessage(e));
      setBusy(null);
    }
  }

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={t('strava.pick')}>
      <div className="sheet__panel">
        <header className="sheet__head">
          <h2>{t('strava.pick')}</h2>
          <button type="button" className="link" onClick={props.onClose}>
            {t('strava.close')}
          </button>
        </header>
        <p className="fine">{around ? t('strava.aroundClip') : t('strava.recent')}</p>
        {error && <p className="error">{error}</p>}
        {!items ? (
          <p className="muted">{t('strava.loading')}</p>
        ) : ordered && ordered.length ? (
          <ul className="acts">
            {ordered.map((a) => (
              <li key={a.key}>
                <button type="button" className={`act${a === match ? ' is-match' : ''}`} disabled={busy !== null} onClick={() => void pick(a)}>
                  <span className="act__name">{a.name || a.sport_type}</span>
                  <span className="act__meta">
                    {new Date(a.startMs).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })} · {clock(a.startMs)} · {formatDuration(a.elapsedMs)}
                    {a.distance ? ` · ${num(a.distance / 1000)} km` : ''}
                  </span>
                  {a === match && <span className="act__badge">{t('strava.match')}</span>}
                  {busy === a.key && <span className="act__badge">{t('strava.loading')}</span>}
                </button>
                {/* Brand guidelines: links back to the activity on Strava read "View on Strava" in every language */}
                <a className="act__view" href={activityUrl(a)} onClick={(e) => (e.preventDefault(), openExternal(activityUrl(a)))}>
                  View on Strava
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t('strava.none')}</p>
        )}
        {around && (
          <button type="button" className="ghost" onClick={() => setAround(undefined)}>
            {t('strava.showRecent')}
          </button>
        )}
        <img className="powered" src={poweredByStrava} width={365} height={37} alt="Powered by Strava" />
      </div>
    </div>
  );
}
