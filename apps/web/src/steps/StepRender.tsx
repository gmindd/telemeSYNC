import { effectiveStart, getOverlay, OVERLAY_FILE_SLUG } from '@telemesync/core';
import { useApp } from '../lib/store.ts';
import { api } from '../lib/api.ts';
import { fmtFps } from '../lib/format.ts';

export function StepRender() {
  const st = useApp();
  const { ride, sync, selected, overlays, job, format, outputDir, rideName, renderError, rideId, exportSeparate, exportComposite, compositeShortSide } = st;
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
        <div className="export-modes">
          <label className={`mode${exportSeparate ? ' on' : ''}`}>
            <input type="checkbox" checked={exportSeparate} disabled={running} onChange={(e) => st.setExportOptions({ exportSeparate: e.target.checked })} />
            <div>
              <b>Gadgets separados</b>
              <span>Um ficheiro por gadget, do tamanho do gadget. Ideal para reenquadrar (1:1 → 16:9 / 9:16) e posicionar à mão no editor.</span>
              <code>{'{clip}'}_velocidade.mov, {'{clip}'}_mapa.mov…</code>
            </div>
          </label>
          <label className={`mode${exportComposite ? ' on' : ''}`}>
            <input type="checkbox" checked={exportComposite} disabled={running} onChange={(e) => st.setExportOptions({ exportComposite: e.target.checked })} />
            <div>
              <b>Composição única</b>
              <span>Um só ficheiro por clip, com a proporção do vídeo e os gadgets nas posições arrastadas no preview. Basta pôr por cima do clip.</span>
              <code>{'{clip}'}_composicao.mov</code>
              <select value={compositeShortSide} disabled={running || !exportComposite} onChange={(e) => st.setExportOptions({ compositeShortSide: Number(e.target.value) })}>
                <option value={720}>720p</option>
                <option value={1080}>1080p (Full HD)</option>
                <option value={1440}>1440p</option>
                <option value={2160}>2160p (4K)</option>
              </select>
            </div>
          </label>
        </div>
        <p className="muted">
          Pasta: <code>{outputDir || '…'}/{rideName}/{'{clip}'}/</code> · Gadgets:{' '}
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
        disabled={running || !rideId || chosen.length === 0 || overlays.length === 0 || invalid.length > 0 || (!exportSeparate && !exportComposite)}
        onClick={st.startRender}
      >
        Renderizar {chosen.length} clip(s) · {(exportSeparate ? overlays.length : 0) + (exportComposite ? 1 : 0)} ficheiro(s) por clip
      </button>
    </section>
  );
}
