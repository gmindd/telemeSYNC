import { effectiveStart, formatHint, formatLabel, formatNumber, OUTPUT_FORMATS, outputExtension, overlayFileSlug, overlayLabel, tr, type OutputFormat } from '@telemesync/core';
import { useLang, useT } from '../i18n/index.tsx';
import { useApp } from '../lib/store.ts';
import { api } from '../lib/api.ts';
import { fmtFps } from '../lib/format.ts';

export function StepRender() {
  const st = useApp();
  const { ride, sync, selected, overlays, job, format, maxFps, outputDir, rideName, renderError, rideId, exportSeparate, exportComposite, compositeShortSide } = st;
  const t = useT();
  const lang = useLang((s) => s.lang);
  if (!ride) return <section><p>{t('sync.needRide')}</p></section>;
  const cams = new Map(sync.cameras.map((c) => [c.id, c]));
  const running = job?.status === 'running';
  const chosen = sync.clips.filter((c) => selected[c.id]);
  const invalid = chosen.filter((c) => effectiveStart(c, cams.get(c.cameraId)!) === undefined || !c.meta.fps);
  const formatInfo = OUTPUT_FORMATS.find((f) => f.id === format) ?? OUTPUT_FORMATS[0];
  const ext = outputExtension(format);

  return (
    <section>
      <h2>{t('nav.render')}</h2>
      <div className="card">
        <div className="row">
          <label className="field grow">
            {t('render.outputDir')}
            <input value={outputDir} onChange={(e) => st.setOutputDir(e.target.value)} disabled={running} />
          </label>
          <button className="small" onClick={st.saveOutputDir} disabled={running}>{t('render.saveDefault')}</button>
        </div>
        <div className="row">
          <label className="field grow">
            {t('render.rideName')}
            <input value={rideName} onChange={(e) => st.setRideName(e.target.value)} disabled={running} />
          </label>
          <label className="field">
            {t('render.fps')}
            <select value={maxFps} onChange={(e) => st.setMaxFps(Number(e.target.value))} disabled={running}>
              <option value={0}>{t('render.fpsSame')}</option>
              <option value={30}>{t('render.fps30')}</option>
            </select>
          </label>
        </div>
        <div className="row">
          <label className="field grow">
            {t('render.format')}
            <select value={format} onChange={(e) => st.setFormat(e.target.value as OutputFormat)} disabled={running}>
              {OUTPUT_FORMATS.map((f) => <option key={f.id} value={f.id}>{formatLabel(f.id, lang)}</option>)}
            </select>
            <span className="format-hint">{formatHint(formatInfo.id, lang)}</span>
          </label>
        </div>
        <p className="format-note">
          <b>{t('render.blackBg')}</b> {t('render.blackBgFix')}
        </p>
        <div className="export-modes">
          <label className={`mode${exportSeparate ? ' on' : ''}`}>
            <input type="checkbox" checked={exportSeparate} disabled={running} onChange={(e) => st.setExportOptions({ exportSeparate: e.target.checked })} />
            <div>
              <b>{t('render.separate')}</b>
              <span>{t('render.separateText')}</span>
              <code>{'{clip}'}_{overlayFileSlug('speed', lang)}{ext}, {'{clip}'}_{overlayFileSlug('map', lang)}{ext}…</code>
            </div>
          </label>
          <label className={`mode${exportComposite ? ' on' : ''}`}>
            <input type="checkbox" checked={exportComposite} disabled={running} onChange={(e) => st.setExportOptions({ exportComposite: e.target.checked })} />
            <div>
              <b>{t('render.composite')}</b>
              <span>{t('render.compositeText')}</span>
              <code>{'{clip}'}_{tr(lang, 'file.composite')}{ext}</code>
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
          {t('render.folder')} <code>{outputDir || '…'}/{rideName}/{'{clip}'}/</code> · {t('render.gadgets')}{' '}
          {overlays.map((o) => <span key={o} className="chip small">{overlayLabel(o, lang)} → _{overlayFileSlug(o, lang)}</span>)}
        </p>
      </div>

      <table className="grid">
        <thead>
          <tr>
            <th><input type="checkbox" checked={chosen.length === sync.clips.length && sync.clips.length > 0} onChange={(e) => sync.clips.forEach((c) => st.toggleSelected(c.id, e.target.checked))} /></th>
            <th>{t('list.clip')}</th>
            <th>{t('clips.duration')}</th>
            <th>fps</th>
            <th>{t('render.progress')}</th>
          </tr>
        </thead>
        <tbody>
          {sync.clips.map((c) => {
            const tasks = job?.tasks.filter((k) => k.clipId === c.id) ?? [];
            const p = tasks.length ? tasks.reduce((a, k) => a + k.progress, 0) / tasks.length : 0;
            const err = tasks.find((k) => k.status === 'error');
            return (
              <tr key={c.id}>
                <td><input type="checkbox" checked={!!selected[c.id]} onChange={(e) => st.toggleSelected(c.id, e.target.checked)} disabled={running} /></td>
                <td>{c.meta.fileName}</td>
                <td>{formatNumber(c.meta.durationMs / 1000, 1, lang)} s</td>
                <td>{fmtFps(c.meta.fps, lang)}</td>
                <td className="progress-cell">
                  {tasks.length ? (
                    <>
                      <progress value={p} max={1} /> {Math.round(p * 100)}%
                      {err ? <div className="error" title={err.error}>{t('render.error', { error: err.error?.slice(0, 120) ?? '' })}</div> : null}
                    </>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {invalid.length ? <p className="error">{t('render.invalid', { files: invalid.map((c) => c.meta.fileName).join(', ') })}</p> : null}
      {renderError ? <p className="error">{renderError}</p> : null}

      {job ? (
        <div className="card">
          <div className="row">
            <b>{t('render.total')}</b>
            <progress className="grow" value={job.progress} max={1} />
            <span>{Math.round(job.progress * 100)}%</span>
            {running ? <button onClick={st.cancelRender}>{t('render.cancel')}</button> : null}
          </div>
          {!running ? (
            <div>
              <p>
                {t(job.status === 'done' ? 'render.done' : job.status === 'cancelled' ? 'render.cancelled' : 'render.withErrors')} ·{' '}
                {t('render.files', { done: job.tasks.filter((k) => k.status === 'done').length, total: job.tasks.length })}
                {job.finishedAt ? ` ${t('render.in', { s: Math.round((job.finishedAt - job.startedAt) / 1000) })}` : ''}.
              </p>
              <button className="primary" onClick={() => api.openFolder(job.rideDir)}>{t('render.openFolder')}</button>
            </div>
          ) : null}
        </div>
      ) : null}

      <button
        className="primary big"
        disabled={running || !rideId || chosen.length === 0 || overlays.length === 0 || invalid.length > 0 || (!exportSeparate && !exportComposite)}
        onClick={st.startRender}
      >
        {t('render.button', { clips: chosen.length, files: (exportSeparate ? overlays.length : 0) + (exportComposite ? 1 : 0) })}
      </button>
    </section>
  );
}
