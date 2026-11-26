// Sync step: the round map (the same as the gadget, heading up, with the streets around) at the playhead, with its
// zoom. Pause as the video enters a bend and adjust the offset until the arrow sits at the same point of the bend.
// The zoom is the gadget's own (style.mapRadiusM): the map dragged onto the video and exported looks the same.
import { STREETS_ATTRIBUTION, formatNumber, type OverlayStyle, type RideData } from '@telemesync/core';
import { useLang, useT } from '../i18n/index.tsx';
import { useApp } from '../lib/store.ts';
import { MAP_ZOOMS, nextZoom } from '../lib/mapZoom.ts';
import { OverlayCanvas } from './OverlayCanvas.tsx';

export function SyncMap(props: { ride: RideData; t: number; clipStart: number; clipEnd: number; style: OverlayStyle }) {
  const { streets, streetsState, retryStreets, setStyle, overlays, toggleOverlay } = useApp();
  const t = useT();
  const lang = useLang((s) => s.lang);
  const zoom = props.style.mapRadiusM;
  const radius = zoom === undefined ? t('sync.radiusAuto') : zoom >= 1000 ? `${formatNumber(zoom / 1000, 1, lang)} km` : `${zoom} m`;
  const onVideo = overlays.includes('dialMap');
  return (
    <div className="syncmap">
      <h3>{t('sync.mapTitle')}</h3>
      <OverlayCanvas id="dialMap" ride={props.ride} style={props.style} t={props.t} clipStart={props.clipStart} clipEnd={props.clipEnd} streets={streets} cssScale={0.6} fitHeight={260} className="syncmap__map" />
      <div className="syncmap__zoom">
        <button className="small" aria-label={t('sync.zoomIn')} title={t('sync.zoomIn')} disabled={zoom === MAP_ZOOMS[0]} onClick={() => setStyle({ mapRadiusM: nextZoom(zoom, -1) })}>
          +
        </button>
        <span className="muted">{t('sync.radius', { r: radius })}</span>
        <button className="small" aria-label={t('sync.zoomOut')} title={t('sync.zoomOut')} disabled={zoom === MAP_ZOOMS.at(-1)} onClick={() => setStyle({ mapRadiusM: nextZoom(zoom, 1) })}>
          −
        </button>
        {zoom !== undefined ? (
          <button className="link-inline" onClick={() => setStyle({ mapRadiusM: undefined })}>
            {t('sync.zoomAuto')}
          </button>
        ) : null}
      </div>
      <p className="muted syncmap__note">
        {streetsState === 'loading' ? (
          t('sync.streetsLoading')
        ) : streetsState === 'failed' ? (
          <>
            {t('sync.streetsFailed')}{' '}
            <button className="link-inline" onClick={retryStreets}>
              {t('sync.streetsRetry')}
            </button>
          </>
        ) : streets ? (
          `${t('sync.streets')} ${STREETS_ATTRIBUTION}`
        ) : zoom !== undefined && zoom > 1600 ? (
          t('sync.streetsWide')
        ) : null}
      </p>
      <p className="muted syncmap__note">{t('sync.mapHint')}</p>
      <button className={`small${onVideo ? ' toggle-on' : ''}`} aria-pressed={onVideo} onClick={() => toggleOverlay('dialMap', !onVideo)}>
        {onVideo ? t('sync.mapOnVideo') : t('sync.mapAdd')}
      </button>
    </div>
  );
}
