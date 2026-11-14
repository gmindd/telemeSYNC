// First screen: pick the clip and the ride (a FIT/GPX file or a Strava activity), see that they match, open the
// editor.
import { useEffect, useState } from 'react';
import { StravaSheet, stravaMessage } from '../components/StravaSheet.tsx';
import { clock, mmss, num, t } from '../i18n.ts';
import { loadClip, loadRide } from '../lib/project.ts';
import { probeVideo } from '../lib/render.ts';
import { finishSignIn, loadSession, onSignInReturn, signOut, startSignIn, type StravaSession } from '../lib/strava.ts';
import { clipStart, useProject } from '../state.ts';

export function StartScreen() {
  const s = useProject();
  const [busy, setBusy] = useState<'clip' | 'ride' | 'strava' | null>(null);
  const [error, setError] = useState('');
  const [strava, setStrava] = useState<StravaSession | null>(() => loadSession());
  const [sheet, setSheet] = useState(false);

  // Back from Strava's authorization: claim the tokens and show the activities
  useEffect(
    () =>
      onSignInReturn((id) => {
        setBusy('strava');
        finishSignIn(id)
          .then((session) => {
            setStrava(session);
            setSheet(true);
          })
          .catch((e) => setError(stravaMessage(e)))
          .finally(() => setBusy(null));
      }),
    [],
  );

  async function fromStrava() {
    setError('');
    if (strava) return setSheet(true);
    setBusy('strava');
    try {
      await startSignIn();
    } catch (e) {
      setError(stravaMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function openClip(file: Blob, name: string, lastModified?: number) {
    setBusy('clip');
    setError('');
    try {
      const [c, info] = await Promise.all([loadClip(file, name, lastModified), probeVideo(file)]);
      if (!info.canDecode) throw new Error(t('start.cantDecode', { codec: info.codec ?? '?' }));
      s.setClip(c, info);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function openRide(file: Blob, name: string) {
    setBusy('ride');
    setError('');
    try {
      s.setRide(await loadRide(file, name));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function openDemo(clipName: string) {
    const get = async (n: string) => (await fetch(`/__fixtures/${n}`)).blob();
    await openRide(await get('ride.fit'), 'ride.fit');
    await openClip(await get(clipName), clipName);
  }

  const start = s.clip && s.ride ? clipStart(s) : undefined;
  const outside = start !== undefined && s.info && s.ride && (start + s.info.durationS * 1000 < s.ride.startTime || start > s.ride.endTime);

  return (
    <main className="start">
      <header className="start__head">
        <h1 className="brand">
          tele<em>me</em>SYNC
        </h1>
        <p>{t('app.tagline')}</p>
      </header>

      <section className={`pickcard${s.clip ? ' is-done' : ''}`}>
        <span className="pickcard__n">1</span>
        <div className="pickcard__body">
          <h2>{t('start.video')}</h2>
          {s.clip && s.info ? (
            <p className="pickcard__info">
              <b>{s.clip.name}</b>
              <br />
              {s.info.width}×{s.info.height} · {mmss(s.info.durationS)}
              {s.autoStart ? ` · ${clock(s.autoStart)}` : ''}
            </p>
          ) : (
            <p className="fine">{t('start.videoHint')}</p>
          )}
        </div>
        <label className="pick">
          <input type="file" accept="video/*" onChange={(e) => e.target.files?.[0] && void openClip(e.target.files[0], e.target.files[0].name, e.target.files[0].lastModified)} />
          <span>{busy === 'clip' ? t('start.loading') : s.clip ? t('start.changeVideo') : t('start.pickVideo')}</span>
        </label>
      </section>

      <section className={`pickcard${s.ride ? ' is-done' : ''}`}>
        <span className="pickcard__n">2</span>
        <div className="pickcard__body">
          <h2>{t('start.ride')}</h2>
          {s.ride ? (
            <p className="pickcard__info">
              <b>{s.ride.source === 'strava' ? s.ride.name : (s.ride.device ?? s.ride.source.toUpperCase())}</b>
              <br />
              {clock(s.ride.startTime)}–{clock(s.ride.endTime)} · {num(s.ride.totals.distanceM / 1000)} km
            </p>
          ) : (
            <p className="fine">{t('start.rideHint')}</p>
          )}
        </div>
        <div className="pickcard__actions">
          <button type="button" className="strava-btn" disabled={busy === 'strava'} onClick={() => void fromStrava()}>
            {busy === 'strava' ? t('strava.connecting') : strava ? t('strava.from') : t('strava.connect')}
          </button>
          <label className="pick">
            <input type="file" onChange={(e) => e.target.files?.[0] && void openRide(e.target.files[0], e.target.files[0].name)} />
            <span>{busy === 'ride' ? t('start.loading') : t('strava.file')}</span>
          </label>
        </div>
        {strava && (
          <p className="pickcard__foot fine">
            {t('strava.signedIn', { name: [strava.athlete?.firstname, strava.athlete?.lastname].filter(Boolean).join(' ') || 'Strava' })} ·{' '}
            <button type="button" className="link" onClick={() => (signOut(), setStrava(null))}>
              {t('strava.signOut')}
            </button>
          </p>
        )}
      </section>
      {sheet && strava && (
        <StravaSheet
          clipStart={s.autoStart !== undefined ? s.autoStart + s.offsetS * 1000 : undefined}
          onRide={(ride) => {
            s.setRide(ride);
            setSheet(false);
          }}
          onClose={() => setSheet(false)}
          onSignedOut={() => setStrava(null)}
        />
      )}

      {error && <p className="error">{error}</p>}
      {s.clip && !s.autoStart && <p className="warn">{t('start.noTime')}</p>}
      {outside && <p className="warn">{t('start.outside')}</p>}

      <button type="button" className="primary big" disabled={!s.clip || !s.ride || !!busy} onClick={() => s.setScreen('editor')}>
        {t('start.open')}
      </button>

      {import.meta.env.DEV && (
        <section className="demo">
          <span className="fine">{t('start.demo')}</span>
          <div className="row">
            <button type="button" className="chip-btn" onClick={() => void openDemo('clip-landscape.mp4')}>
              {t('start.demoLandscape')}
            </button>
            <button type="button" className="chip-btn" onClick={() => void openDemo('clip-portrait.mp4')}>
              {t('start.demoPortrait')}
            </button>
          </div>
        </section>
      )}
      <p className="version">v{__APP_VERSION__}</p>
    </main>
  );
}
