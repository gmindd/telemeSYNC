// Sync: the clip's start found in its metadata, a fine adjustment, and the ride's numbers at the playhead to compare
// with what the video shows, plus a zoomed round map to line a bend of the road up with the video.
import { useEffect, useRef } from 'react';
import { convert, getOverlay, overlayPixelSize, renderOverlayFrame, sampleAt, STREETS_ATTRIBUTION, type Ctx2D, type RideData, type Streets } from '@telemesync/core';
import { clock, LANG, num, t } from '../i18n.ts';
import { startSource } from '../lib/project.ts';
import { clipStart, styleOf, useProject } from '../state.ts';

/** Map radius around the rider (m), from a few bends to a whole valley. */
const ZOOMS = [50, 100, 200, 400, 800, 1600, 3200];

/** The round map (the same as the gadget, heading up) at a moment of the ride, with its zoom. */
function SyncMap(props: { ride: RideData; at: number; zoomM: number; streets?: Streets; streetsState: string; onZoom: (m: number) => void; onRetry: () => void }) {
  const { ride, at, zoomM, streets, onZoom } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  const def = getOverlay('dialMap');
  const style = styleOf({ mapZoomM: zoomM, look: useProject((st) => st.look) });
  const { width, height } = overlayPixelSize(def, style);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) renderOverlayFrame(ctx as unknown as Ctx2D, def, at, style, { ride, clipStart: at, clipEnd: at + 60_000, streets });
  });
  const i = ZOOMS.indexOf(zoomM);
  const step = (d: number) => onZoom(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 2 : i) + d))]!);
  const radius = zoomM >= 1000 ? `${num(zoomM / 1000)} km` : `${zoomM} m`;
  return (
    <div className="syncmap">
      <canvas ref={ref} width={width} height={height} className="syncmap__map" />
      <div className="syncmap__zoom">
        <button type="button" className="chip-btn" aria-label={t('sync.zoomIn')} disabled={i === 0} onClick={() => step(-1)}>
          +
        </button>
        <span className="fine">{t('sync.radius', { r: radius })}</span>
        <button type="button" className="chip-btn" aria-label={t('sync.zoomOut')} disabled={i === ZOOMS.length - 1} onClick={() => step(1)}>
          −
        </button>
      </div>
      <p className="fine">
        {props.streetsState === 'loading' ? (
          t('sync.streetsLoading')
        ) : props.streetsState === 'failed' ? (
          <>
            {t('sync.streetsFailed')}{' '}
            <button type="button" className="link" onClick={props.onRetry}>
              {t('sync.streetsRetry')}
            </button>
          </>
        ) : streets ? (
          `${t('sync.streets')} ${STREETS_ATTRIBUTION}`
        ) : null}
      </p>
      <p className="fine">{t('sync.mapHint')}</p>
    </div>
  );
}

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
  const u = s.look.units;
  const values = [
    s.ride.available.has('speed') && `${num(convert.speed(sample.speed, u))} ${convert.speedUnit(u)}`,
    s.ride.available.has('heartRate') && Number.isFinite(sample.heartRate) && `${Math.round(sample.heartRate)} bpm`,
    s.ride.available.has('power') && Number.isFinite(sample.power) && `${Math.round(sample.power)} W`,
    s.ride.available.has('altitude') && `${Math.round(convert.elevation(sample.altitude, u))} ${convert.elevationUnit(u)}`,
  ].filter(Boolean);
  const offsetLabel = signed(s.offsetS);
  // The slider fine-tunes within ±5 min of the whole hours set with the ±1 h buttons.
  const hours = Math.round(s.offsetS / 3600) * 3600;
  const source = s.clip ? startSource(s.clip, s.ride, LANG) : undefined;

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
      {s.ride.available.has('map') && <SyncMap ride={s.ride} at={at} zoomM={s.mapZoomM} streets={s.streets} streetsState={s.streetsState} onZoom={s.setMapZoom} onRetry={s.retryStreets} />}
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
