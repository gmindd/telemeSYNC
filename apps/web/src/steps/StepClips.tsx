import { CAMERA_PROFILES, clipWarnings, effectiveStart, formatDateTime, type CameraProfileId } from '@telemesync/core';
import { Dropzone } from '../components/Dropzone.tsx';
import { useApp } from '../lib/store.ts';
import { fmtBytes, fmtFps } from '../lib/format.ts';

const SOURCE_LABEL: Record<string, string> = {
  manual: 'manual',
  gpmf: 'GPS (GPMF)',
  creationTime: 'creation_time',
  filename: 'nome do ficheiro',
  timecode: 'timecode',
};

export function StepClips() {
  const { sync, ride, files, clipErrors, addClipFiles, removeClip, assignCamera, setStep, style } = useApp();
  const cams = new Map(sync.cameras.map((c) => [c.id, c]));
  return (
    <section>
      <h2>2. Clips de vídeo</h2>
      <p className="lead">
        Arraste os clips (vários de uma vez, de várias câmaras). Os vídeos <b>não são enviados</b>: o browser lê apenas os metadados (duração, fps, datas).
      </p>
      <Dropzone accept="video/*,.mp4,.MP4,.mov,.MOV,.insv,.INSV,.lrv,.LRV" multiple onFiles={addClipFiles}>
        Arraste aqui os ficheiros <b>MP4 / MOV / INSV</b>, ou clique para escolher
      </Dropzone>
      {clipErrors.length ? (
        <ul className="error">{clipErrors.map((e) => <li key={e}>{e}</li>)}</ul>
      ) : null}
      {sync.clips.length ? (
        <table className="grid">
          <thead>
            <tr>
              <th>Ficheiro</th>
              <th>Câmara</th>
              <th>Duração</th>
              <th>fps</th>
              <th>Resolução</th>
              <th>Início detetado</th>
              <th>Fonte</th>
              <th>Avisos</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sync.clips.map((c) => {
              const cam = cams.get(c.cameraId)!;
              const s = effectiveStart(c, cam);
              const warnings = ride ? clipWarnings(c, cam, ride.startTime, ride.endTime) : [];
              return (
                <tr key={c.id}>
                  <td title={`${fmtBytes(c.meta.sizeBytes)} · ${c.meta.codec ?? ''}`}>
                    {c.meta.fileName}
                    {!files[c.id] ? <span className="muted"> (sem ficheiro)</span> : null}
                    {c.chapter ? <span className="chip small">cap. {c.chapter.index}</span> : null}
                  </td>
                  <td>
                    <select value={c.cameraId} onChange={(e) => assignCamera(c.id, e.target.value)} style={{ borderColor: cam.color }}>
                      {sync.cameras.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                      {(Object.keys(CAMERA_PROFILES) as CameraProfileId[]).map((p) => (
                        <option key={p} value={`new:${p}`}>+ nova câmara {CAMERA_PROFILES[p].label}</option>
                      ))}
                    </select>
                  </td>
                  <td>{(c.meta.durationMs / 1000).toFixed(1).replace('.', ',')} s</td>
                  <td>{fmtFps(c.meta.fps)}</td>
                  <td>{c.meta.width ? `${c.meta.width}×${c.meta.height}` : '—'}</td>
                  <td>{s !== undefined ? formatDateTime(s, style.timeZone) : '—'}</td>
                  <td>{c.chapterStartUtcMs !== undefined ? 'capítulo anterior' : c.resolved.source ? SOURCE_LABEL[c.resolved.source] : '—'}</td>
                  <td className="warnings">{warnings.map((w) => <div key={w.code} title={w.message}>⚠ {w.message}</div>)}</td>
                  <td><button className="small" onClick={() => removeClip(c.id)} title="Remover">✕</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
      {sync.clips.length ? (
        <button className="primary" onClick={() => setStep('sync')} disabled={!ride}>Seguinte: sincronizar →</button>
      ) : null}
      {!ride && sync.clips.length ? <p className="muted">Carregue primeiro a telemetria para sincronizar.</p> : null}
    </section>
  );
}
