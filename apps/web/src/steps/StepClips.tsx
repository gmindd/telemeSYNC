import { CAMERA_PROFILES, clipWarnings, effectiveStart, formatDateTime, formatNumber, profileLabel, type CameraProfileId, type ResolverId } from '@telemesync/core';
import { Dropzone } from '../components/Dropzone.tsx';
import { useLang, useT, type T } from '../i18n/index.tsx';
import { useApp } from '../lib/store.ts';
import { fmtBytes, fmtFps } from '../lib/format.ts';

function sourceLabel(source: ResolverId, t: T): string {
  if (source === 'manual') return t('clips.src.manual');
  if (source === 'filename') return t('clips.src.filename');
  return { gpmf: 'GPS (GPMF)', creationTime: 'creation_time', timecode: 'timecode' }[source];
}

export function StepClips() {
  const { sync, ride, files, clipErrors, addClipFiles, removeClip, assignCamera, setStep, style } = useApp();
  const t = useT();
  const lang = useLang((s) => s.lang);
  const cams = new Map(sync.cameras.map((c) => [c.id, c]));
  return (
    <section>
      <h2>{t('clips.title')}</h2>
      <p className="lead">{t('clips.lead')}</p>
      <Dropzone accept="video/*,.mp4,.MP4,.mov,.MOV,.insv,.INSV,.lrv,.LRV" multiple onFiles={addClipFiles}>
        {t('clips.drop', { files: 'MP4 / MOV / INSV' })}
      </Dropzone>
      {clipErrors.length ? (
        <ul className="error">{clipErrors.map((e) => <li key={e}>{e}</li>)}</ul>
      ) : null}
      {sync.clips.length ? (
        <table className="grid">
          <thead>
            <tr>
              <th>{t('clips.file')}</th>
              <th>{t('clips.camera')}</th>
              <th>{t('clips.duration')}</th>
              <th>fps</th>
              <th>{t('clips.resolution')}</th>
              <th>{t('clips.detected')}</th>
              <th>{t('clips.source')}</th>
              <th>{t('clips.warnings')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sync.clips.map((c) => {
              const cam = cams.get(c.cameraId)!;
              const s = effectiveStart(c, cam);
              const warnings = ride ? clipWarnings(c, cam, ride.startTime, ride.endTime, lang) : [];
              return (
                <tr key={c.id}>
                  <td title={`${fmtBytes(c.meta.sizeBytes, lang)} · ${c.meta.codec ?? ''}`}>
                    {c.meta.fileName}
                    {!files[c.id] ? <span className="muted"> {t('clips.noFile')}</span> : null}
                    {c.chapter ? <span className="chip small">{t('clips.chapter', { n: c.chapter.index })}</span> : null}
                  </td>
                  <td>
                    <select value={c.cameraId} onChange={(e) => assignCamera(c.id, e.target.value)} style={{ borderColor: cam.color }}>
                      {sync.cameras.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                      {(Object.keys(CAMERA_PROFILES) as CameraProfileId[]).map((p) => (
                        <option key={p} value={`new:${p}`}>{t('clips.newCamera', { profile: profileLabel(p, lang) })}</option>
                      ))}
                    </select>
                  </td>
                  <td>{formatNumber(c.meta.durationMs / 1000, 1, lang)} s</td>
                  <td>{fmtFps(c.meta.fps, lang)}</td>
                  <td>{c.meta.width ? `${c.meta.width}×${c.meta.height}` : '—'}</td>
                  <td>{s !== undefined ? formatDateTime(s, style.timeZone) : '—'}</td>
                  <td>{c.chapterStartUtcMs !== undefined ? t('clips.prevChapter') : c.resolved.source ? sourceLabel(c.resolved.source, t) : '—'}</td>
                  <td className="warnings">{warnings.map((w) => <div key={w.code} title={w.message}>⚠ {w.message}</div>)}</td>
                  <td><button className="small" onClick={() => removeClip(c.id)} title={t('clips.remove')} aria-label={t('clips.remove')}>✕</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
      {sync.clips.length ? (
        <button className="primary" onClick={() => setStep('sync')} disabled={!ride}>{t('clips.next')}</button>
      ) : null}
      {!ride && sync.clips.length ? <p className="muted">{t('clips.needRide')}</p> : null}
    </section>
  );
}
