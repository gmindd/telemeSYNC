// Export: summary, quality and file name, progress (with a time estimate), then the finished video to save where
// the user picks or to share.
import { useEffect, useMemo, useRef, useState } from 'react';
import { mmss, num, t } from '../i18n.ts';
import { framingMoves } from '../lib/formats.ts';
import { outputSizeFor, renderVideo, type RenderProgress, type RenderResult } from '../lib/render.ts';
import { defaultName, fileNameFor, saveVideoAs, shareVideo } from '../lib/save.ts';
import { clipStart, frameAspect, frameCrop, projectStyle, useProject } from '../state.ts';

type Status = { kind: 'idle' } | { kind: 'working'; p?: RenderProgress } | { kind: 'done'; r: RenderResult } | { kind: 'error'; message: string };

export function ExportScreen() {
  const s = useProject();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const abort = useRef<AbortController | null>(null);
  const [name, setName] = useState(() => (s.clip ? defaultName(clipStart(s) + s.trim.start * 1000, s.format) : 'telemesync'));
  const [saved, setSaved] = useState<{ name: string; folder?: string | null } | null>(null);
  const [handing, setHanding] = useState<'save' | 'share' | null>(null);
  const [handError, setHandError] = useState('');
  const crop = frameCrop(s);
  const len = s.trim.end - s.trim.start;
  const social = s.format !== 'original' ? frameAspect(s) : undefined;
  const out = crop ? outputSizeFor(crop.width, crop.height, s.shortSide, social) : undefined;

  async function run() {
    if (!s.clip || !s.ride) return;
    abort.current = new AbortController();
    setStatus({ kind: 'working' });
    setSaved(null);
    try {
      const r = await renderVideo(
        s.clip.file,
        {
          ride: s.ride,
          clipStartUtcMs: clipStart(s),
          overlays: s.overlays,
          layout: s.layout,
          style: projectStyle(s),
          streets: s.streets,
          crop,
          cropAt: framingMoves(s.cropKeys) ? (sec) => frameCrop(s, sec)! : undefined,
          trim: s.trim,
          shortSide: s.shortSide,
          formatAspect: social,
        },
        (p) => setStatus({ kind: 'working', p }),
        abort.current.signal,
      );
      setStatus({ kind: 'done', r });
    } catch (e) {
      setStatus(abort.current.signal.aborted ? { kind: 'idle' } : { kind: 'error', message: (e as Error).message });
    }
  }

  const url = useMemo(() => (status.kind === 'done' ? URL.createObjectURL(new Blob([status.r.data as BlobPart], { type: 'video/mp4' })) : ''), [status]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  const working = status.kind === 'working';
  const fileName = fileNameFor(name);

  async function handOver(how: 'save' | 'share', data: Uint8Array) {
    setHanding(how);
    setHandError('');
    try {
      if (how === 'share') await shareVideo(data, fileName);
      else {
        const r = await saveVideoAs(data, fileName);
        if (r) setSaved(r);
      }
    } catch (e) {
      // The video stays on screen, so it can be saved or shared another way.
      setHandError(t('export.handError', { msg: (e as Error).message }));
    } finally {
      setHanding(null);
    }
  }

  const nameField = (
    <label className="field">
      <span>{t('export.fileName')}</span>
      <span className="filename">
        <input type="text" value={name} maxLength={80} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(e) => (setName(e.target.value), setSaved(null))} />
        <span className="filename__ext">.mp4</span>
      </span>
    </label>
  );

  return (
    <main className="export">
      <header className="bar">
        <button type="button" className="icon" aria-label={t('editor.back')} disabled={working} onClick={() => s.setScreen('editor')}>
          <svg viewBox="0 0 24 24" width="24" height="24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <span className="bar__title">{t('export.title')}</span>
        <span />
      </header>

      {status.kind === 'done' ? (
        <section className="done">
          <h2>{t('export.done')}</h2>
          <video src={url} controls playsInline className="done__video" />
          <p className="fine">
            {t('export.stats', {
              time: mmss(status.r.elapsedMs / 1000),
              dur: mmss(status.r.durationS),
              speed: num(status.r.durationS / (status.r.elapsedMs / 1000), 2),
              size: `${num(status.r.data.byteLength / 1048576)} MB`,
            })}
          </p>
          {nameField}
          {saved && (
            <p className="saved" role="status">
              {saved.folder != null ? t('export.savedIn', { folder: saved.folder || t('export.storage'), name: saved.name }) : t('export.saved', { name: saved.name })}
            </p>
          )}
          {handError && <p className="error">{handError}</p>}
          <button type="button" className="primary big" disabled={!!handing} onClick={() => void handOver('save', status.r.data)}>
            {handing === 'save' ? t('export.saving') : t('export.save')}
          </button>
          <button type="button" className="ghost big" disabled={!!handing} onClick={() => void handOver('share', status.r.data)}>
            {handing === 'share' ? t('export.preparing') : t('export.share')}
          </button>
          <button type="button" className="ghost big" onClick={() => s.setScreen('editor')}>
            {t('export.again')}
          </button>
        </section>
      ) : working ? (
        <section className="working">
          <Ring value={status.p?.progress ?? 0} />
          <h2>{t('export.working')}</h2>
          {status.p && status.p.progress > 0.03 && (
            <p className="muted">{t('export.remaining', { t: mmss((status.p.elapsedMs / 1000) * (1 / status.p.progress - 1)) })}</p>
          )}
          <p className="fine">{t('export.keepOpen')}</p>
          <button type="button" className="ghost big" onClick={() => abort.current?.abort()}>
            {t('export.cancel')}
          </button>
        </section>
      ) : (
        <section className="summary">
          <dl className="facts">
            <dt>{t('export.format')}</dt>
            <dd>{out ? `${out.width}×${out.height}` : '—'}</dd>
            <dt>{t('export.duration')}</dt>
            <dd>{mmss(len)}</dd>
            <dt>{t('export.gadgets')}</dt>
            <dd>{s.overlays.length}</dd>
          </dl>
          <div className="field">
            <span>{t('export.quality')}</span>
            <div className="segmented">
              {[1080, 720].map((q) => (
                <button key={q} type="button" className={s.shortSide === q ? 'is-on' : ''} aria-pressed={s.shortSide === q} onClick={() => s.setShortSide(q)}>
                  {q}p
                </button>
              ))}
            </div>
          </div>
          {nameField}
          {status.kind === 'error' && <p className="error">{t('export.error', { msg: status.message })}</p>}
          {!s.overlays.length && <p className="warn">{t('export.noGadgets')}</p>}
          <button type="button" className="primary big" disabled={!s.overlays.length} onClick={() => void run()}>
            {t('export.start')}
          </button>
        </section>
      )}
    </main>
  );
}

/** Round progress indicator with the percentage in the middle. */
function Ring({ value }: { value: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <svg viewBox="0 0 120 120" width="160" height="160">
        <defs>
          <linearGradient id="ring-g" x1="0" x2="1">
            <stop offset="0" stopColor="#ffc400" />
            <stop offset="1" stopColor="#ff3d00" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={r} className="ring__track" />
        <circle cx="60" cy="60" r={r} className="ring__bar" stroke="url(#ring-g)" strokeDasharray={c} strokeDashoffset={c * (1 - value)} />
      </svg>
      <b>{Math.round(value * 100)} %</b>
    </div>
  );
}
