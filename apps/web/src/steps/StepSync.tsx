import { useMemo, useState } from 'react';
import {
  CAMERA_PROFILES,
  clipWarnings,
  describeCandidate,
  effectiveStart,
  formatNumber,
  resolveLayout,
  profileLabel,
  utcToWall,
  wallToUtc,
  type Camera,
  type Clip,
} from '@telemesync/core';
import { ClipList } from '../components/ClipList.tsx';
import { SegmentsPanel } from '../components/SegmentsPanel.tsx';
import { gadgetZones } from '../components/Preview.tsx';
import { PLATFORM_NAMES, SOCIAL_PLATFORMS } from '../lib/safeZones.ts';
import { Preview } from '../components/Preview.tsx';
import { Timeline } from '../components/Timeline.tsx';
import { ValuesPanel } from '../components/ValuesPanel.tsx';
import { useLang, useT } from '../i18n/index.tsx';
import { drawStyle, useApp } from '../lib/store.ts';
import { dec, fmtOffset, parseDecimal } from '../lib/format.ts';

const TIME_ZONES = ['Europe/Lisbon', 'Atlantic/Madeira', 'Atlantic/Azores', 'Europe/Madrid', 'Europe/Paris', 'Europe/London', 'UTC'];

function Nudges({ onNudge }: { onNudge: (ms: number) => void }) {
  const lang = useLang((s) => s.lang);
  return (
    <span className="nudges">
      {[-60000, -1000, -100, 100, 1000, 60000].map((d) => (
        <button key={d} className="small" onClick={() => onNudge(d)}>
          {d > 0 ? '+' : '−'}
          {Math.abs(d) >= 60000 ? '1 min' : Math.abs(d) >= 1000 ? '1 s' : `${dec(0.1, 1, lang)} s`}
        </button>
      ))}
    </span>
  );
}

function CameraRow({ cam }: { cam: Camera }) {
  const { setCameraOffset, setCameraTimeZone, setCameraLabel } = useApp();
  const [text, setText] = useState<string | null>(null);
  const t = useT();
  const lang = useLang((s) => s.lang);
  return (
    <div className="camera-row" style={{ borderLeftColor: cam.color }}>
      <input className="cam-label" value={cam.label} onChange={(e) => setCameraLabel(cam.id, e.target.value)} />
      <span className="muted">{profileLabel(cam.profile, lang)}</span>
      <label>
        {t('sync.offset')}
        <input
          className="num"
          value={text ?? dec(cam.offsetMs / 1000, 1, lang)}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const v = text === null ? undefined : parseDecimal(text);
            if (v !== undefined) setCameraOffset(cam.id, v * 1000);
            setText(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        s
      </label>
      <Nudges onNudge={(d) => setCameraOffset(cam.id, cam.offsetMs + d)} />
      <span className="muted">{fmtOffset(cam.offsetMs, lang)}</span>
      <select value={cam.timeZone} onChange={(e) => setCameraTimeZone(cam.id, e.target.value)} title={t('sync.tzTitle')}>
        {[...new Set([cam.timeZone, ...TIME_ZONES])].map((z) => <option key={z}>{z}</option>)}
      </select>
    </div>
  );
}

/** Social-app zones over the preview: one toggle per app, and whether any gadget sits under their buttons. */
function SafeZoneBar({ clip }: { clip: Clip }) {
  const { safeZones, toggleSafeZone, overlays, layout, style } = useApp();
  const t = useT();
  const aspect = clip.meta.width && clip.meta.height ? clip.meta.width / clip.meta.height : 16 / 9;
  const zones = gadgetZones(overlays, resolveLayout(overlays, layout, aspect, style), aspect, style, safeZones);
  const covered = Object.values(zones).filter((z) => z === 'ui').length;
  const maybe = Object.values(zones).filter((z) => z === 'maybe').length;
  return (
    <div className="safe-zone-bar">
      <span className="muted">{t('sz.title')}</span>
      {SOCIAL_PLATFORMS.map((p) => (
        <button key={p} className={`small${safeZones.includes(p) ? ' toggle-on' : ''}`} aria-pressed={safeZones.includes(p)} onClick={() => toggleSafeZone(p)}>
          {PLATFORM_NAMES[p]}
        </button>
      ))}
      {safeZones.length ? (
        <span className={`safe-zone-status ${covered ? 'bad' : maybe ? 'warn' : 'ok'}`}>
          {covered ? `⚠ ${t('sz.covered', { n: covered })}` : maybe ? t('sz.maybe', { n: maybe }) : `✓ ${t('sz.allClear')}`}
        </span>
      ) : null}
      {safeZones.length ? <p className="muted small">{t(aspect < 0.7 ? 'sz.help' : 'sz.notVertical')}</p> : null}
    </div>
  );
}

function toLocalInput(utcMs: number, tz: string): string {
  return new Date(utcToWall(utcMs, tz)).toISOString().slice(0, 19);
}

function ClipDetail({ clip, cam }: { clip: Clip; cam: Camera }) {
  const { ride, setClipOffset, setManualStart, setCameraOffset } = useApp();
  const t = useT();
  const lang = useLang((s) => s.lang);
  const start = effectiveStart(clip, cam);
  const warnings = ride ? clipWarnings(clip, cam, ride.startTime, ride.endTime, lang) : [];
  return (
    <div className="card clip-detail">
      <h3>{clip.meta.fileName}</h3>
      {warnings.map((w) => (
        <div key={w.code} className="warning">
          ⚠ {w.message}
          {w.suggestedOffsetMs ? (
            <button className="small" onClick={() => setCameraOffset(cam.id, cam.offsetMs + w.suggestedOffsetMs!)}>
              {t('sync.fixCamera', { offset: `${w.suggestedOffsetMs > 0 ? '+' : '−'}${formatNumber(Math.abs(w.suggestedOffsetMs / 3600_000), 0, lang)}` })}
            </button>
          ) : null}
        </div>
      ))}
      <div className="row">
        <span>{t('sync.clipOffset')} <b>{fmtOffset(clip.clipOffsetMs, lang)}</b></span>
        <Nudges onNudge={(d) => setClipOffset(clip.id, clip.clipOffsetMs + d)} />
        {clip.clipOffsetMs ? <button className="small" onClick={() => setClipOffset(clip.id, 0)}>{t('sync.reset')}</button> : null}
      </div>
      <div className="row">
        <label>
          {t('sync.manualStart', { tz: cam.timeZone })}{' '}
          <input
            type="datetime-local"
            step="1"
            value={clip.manualStartUtcMs !== undefined ? toLocalInput(clip.manualStartUtcMs, cam.timeZone) : ''}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return setManualStart(clip.id, undefined);
              const wall = Date.parse(`${v.length === 16 ? `${v}:00` : v}Z`);
              if (Number.isFinite(wall)) setManualStart(clip.id, wallToUtc(wall, cam.timeZone));
            }}
          />
        </label>
        {clip.manualStartUtcMs !== undefined ? <button className="small" onClick={() => setManualStart(clip.id, undefined)}>{t('sync.useAuto')}</button> : null}
      </div>
      <details>
        <summary>{t('sync.sources')}</summary>
        <ul>
          {clip.resolved.candidates.length === 0 ? <li>{t('sync.noneFound')}</li> : null}
          {clip.resolved.candidates.map((c) => (
            <li key={c.resolver}>
              {describeCandidate(c, cam.timeZone, lang)} {c.resolver === clip.resolved.source ? <b>{t('sync.inUse')}</b> : (
                <button className="small" onClick={() => setManualStart(clip.id, c.startUtcMs)}>{t('sync.useThis')}</button>
              )}
            </li>
          ))}
          {clip.chapterStartUtcMs !== undefined ? <li>{t('sync.chapter', { n: clip.chapter?.index ?? '?' })} <b>{t('sync.inUse')}</b></li> : null}
        </ul>
        {!CAMERA_PROFILES[cam.profile].verified ? (
          <p className="muted">{t('sync.unverified', { profile: profileLabel(cam.profile, lang) })}</p>
        ) : null}
      </details>
      {start === undefined ? <p className="error">{t('sync.noStart')}</p> : null}
    </div>
  );
}

export function StepSync() {
  const st = useApp();
  const { ride, sync, activeClipId, playhead, style, files, overlays, layout } = st;
  const t = useT();
  // Maps on "only the clips": the stretch the clips cover.
  const viewStyle = useMemo(() => drawStyle(style, sync), [style, sync]);
  if (!ride) return <section><p>{t('sync.needRide')}</p></section>;
  const cams = new Map(sync.cameras.map((c) => [c.id, c]));
  const clip = sync.clips.find((c) => c.id === activeClipId) ?? sync.clips[0];
  const cam = clip ? cams.get(clip.cameraId)! : undefined;
  return (
    <section>
      <h2>{t('nav.sync')}</h2>
      <p className="lead">{t('sync.lead')}</p>
      <div className="cameras">{sync.cameras.map((c) => <CameraRow key={c.id} cam={c} />)}</div>
      <ClipList ride={ride} sync={sync} activeClipId={clip?.id} onSelect={st.setActiveClip} onClipOffset={st.setClipOffset} />
      <Timeline
        ride={ride}
        sync={sync}
        timeZone={style.timeZone}
        activeClipId={clip?.id}
        playhead={playhead}
        onSelectClip={st.setActiveClip}
        onPlayhead={(t) => st.setPlayhead({ t, source: 'user' })}
        onCameraOffset={st.setCameraOffset}
        onClipOffset={st.setClipOffset}
        segments={style.segments}
        segAnchor={st.segAnchor}
      />
      {clip && cam ? (
        <div className="sync-bottom">
          <div className="sync-preview">
            <Preview clip={clip} camera={cam} file={files[clip.id]} ride={ride} overlays={overlays} style={viewStyle} layout={layout} onPlacement={st.setPlacement} />
            <div className="row muted">
              {t('sync.dragHint')}
              <button className="small" onClick={st.resetLayout}>{t('sync.resetLayout')}</button>
              <button
                className={`small${cam.videoRotation === 180 ? ' toggle-on' : ''}`}
                aria-pressed={cam.videoRotation === 180}
                title={t('preview.rotateTitle')}
                onClick={() => st.setCameraRotation(cam.id, cam.videoRotation === 180 ? 0 : 180)}
              >
                ⟲ {t('preview.rotate')}
              </button>
            </div>
            <SafeZoneBar clip={clip} />
          </div>
          <div className="sync-side">
            <ClipDetail clip={clip} cam={cam} />
            {playhead ? <ValuesPanel ride={ride} t={playhead.t} style={style} /> : null}
            <SegmentsPanel ride={ride} timeZone={style.timeZone} />
          </div>
        </div>
      ) : (
        <p className="muted">{t('sync.addClips')}</p>
      )}
    </section>
  );
}
