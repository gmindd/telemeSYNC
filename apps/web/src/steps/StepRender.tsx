import { effectiveStart, getOverlay, OVERLAY_FILE_SLUG } from '@telemesync/core';
import { useApp } from '../lib/store.ts';
import { api } from '../lib/api.ts';
import { fmtFps } from '../lib/format.ts';

export function StepRender() {
  const st = useApp();
  const { ride, sync, selected, overlays, job, format, outputDir, rideName, renderError, rideId } = st;
  if (!ride) return <section><p>Carregue primeiro a telemetria.</p></section>;
  const cams = new Map(sync.cameras.map((c) => [c.id, c]));
  const running = job?.status === 'running';
  const chosen = sync.clips.filter((c) => selected[c.id]);
  const invalid = chosen.filter((c) => effectiveStart(c, cams.get(c.cameraId)!) === undefined || !c.meta.fps);

  return (
    <section>
      <h2>5. Renderizar</h2>
      <div className="card">
        <div className="row">
          <label className="field grow">
            Pasta de saída
            <input value={outputDir} onChange={(e) => st.setOutputDir(e.target.value)} disabled={running} />
          </label>
          <button className="small" onClick={st.saveOutputDir} disabled={running}>Guardar como predefinida</button>
        </div>
        <div className="row">
          <label className="field grow">
            Nome da volta (subpasta)
            <input value={rideName} onChange={(e) => st.setRideName(e.target.value)} disabled={running} />
          </label>
          <label className="field">
            Formato
            <select value={format} onChange={(e) => st.setFormat(e.target.value as 'prores' | 'png')} disabled={running}>
              <option value="prores">ProRes 4444 com alfa (.mov)</option>
              <option value="png">Sequência PNG</option>
            </select>
          </label>
        </div>
        <p className="muted">
          Estrutura: <code>{outputDir || '…'}/{rideName}/{'{clip}'}/{'{clip}'}_{'{métrica}'}.mov</code> · Overlays:{' '}
          {overlays.map((o) => <span key={o} className="chip small">{getOverlay(o).label} → _{OVERLAY_FILE_SLUG[o]}</span>)}
        </p>
      </div>

      <table className="grid">
        <thead>
          <tr>
            <th><input type="checkbox" checked={chosen.length === sync.clips.length && sync.clips.length > 0} onChange={(e) => sync.clips.forEach((c) => st.toggleSelected(c.id, e.target.checked))} /></th>
            <th>Clip</th>
            <th>Duração</th>
            <th>fps</th>
            <th>Progresso</th>
          </tr>
        </thead>
        <tbody>
          {sync.clips.map((c) => {
            const tasks = job?.tasks.filter((t) => t.clipId === c.id) ?? [];
            const p = tasks.length ? tasks.reduce((a, t) => a + t.progress, 0) / tasks.length : 0;
            const err = tasks.find((t) => t.status === 'error');
            return (
              <tr key={c.id}>
                <td><input type="checkbox" checked={!!selected[c.id]} onChange={(e) => st.toggleSelected(c.id, e.target.checked)} disabled={running} /></td>
                <td>{c.meta.fileName}</td>
                <td>{(c.meta.durationMs / 1000).toFixed(1).replace('.', ',')} s</td>
                <td>{fmtFps(c.meta.fps)}</td>
                <td className="progress-cell">
                  {tasks.length ? (
                    <>
                      <progress value={p} max={1} /> {Math.round(p * 100)}%
                      {err ? <div className="error" title={err.error}>Erro: {err.error?.slice(0, 120)}</div> : null}
                    </>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {invalid.length ? <p className="error">Clips sem hora de início ou fps: {invalid.map((c) => c.meta.fileName).join(', ')}</p> : null}
      {renderError ? <p className="error">{renderError}</p> : null}

      {job ? (
        <div className="card">
          <div className="row">
            <b>Total</b>
            <progress className="grow" value={job.progress} max={1} />
            <span>{Math.round(job.progress * 100)}%</span>
            {running ? <button onClick={st.cancelRender}>Cancelar</button> : null}
          </div>
          {!running ? (
            <div>
              <p>
                {job.status === 'done' ? '✔ Concluído' : job.status === 'cancelled' ? 'Cancelado' : 'Terminado com erros'} ·{' '}
                {job.tasks.filter((t) => t.status === 'done').length} de {job.tasks.length} ficheiros
                {job.finishedAt ? ` em ${Math.round((job.finishedAt - job.startedAt) / 1000)} s` : ''}.
              </p>
              <button className="primary" onClick={() => api.openFolder(job.rideDir)}>Abrir pasta</button>
            </div>
          ) : null}
        </div>
      ) : null}

      <button
        className="primary big"
        disabled={running || !rideId || chosen.length === 0 || overlays.length === 0 || invalid.length > 0}
        onClick={st.startRender}
      >
        Renderizar {chosen.length} clip(s) × {overlays.length} overlay(s)
      </button>
    </section>
  );
}
