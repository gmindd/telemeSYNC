// Transport and trim: play/pause, the playhead (drag anywhere on the bar to scrub) and the two handles that choose
// the part of the clip to export.
import { useRef } from 'react';
import { clock, mmss, t } from '../i18n.ts';
import { seek, togglePlay } from '../lib/player.ts';
import { clipStart, useProject } from '../state.ts';

const MIN_LEN = 1;

export function Timeline() {
  const s = useProject();
  const bar = useRef<HTMLDivElement>(null);
  const drag = useRef<'head' | 'start' | 'end' | null>(null);
  const dur = s.info?.durationS ?? 0;
  if (!dur) return null;
  const pct = (sec: number) => `${(sec / dur) * 100}%`;

  const secAt = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.min(dur, Math.max(0, ((clientX - r.left) / r.width) * dur));
  };
  const apply = (clientX: number) => {
    const sec = secAt(clientX);
    const { trim, setTrim } = useProject.getState();
    if (drag.current === 'start') {
      const start = Math.min(sec, trim.end - MIN_LEN);
      setTrim({ ...trim, start: Math.max(0, start) });
      seek(Math.max(0, start));
    } else if (drag.current === 'end') {
      const end = Math.max(sec, trim.start + MIN_LEN);
      setTrim({ ...trim, end: Math.min(dur, end) });
      seek(Math.min(dur, end));
    } else seek(sec);
  };
  const down = (which: 'head' | 'start' | 'end') => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    bar.current!.setPointerCapture(e.pointerId);
    drag.current = which;
    if (which === 'head') apply(e.clientX);
  };

  const len = s.trim.end - s.trim.start;
  return (
    <div className="timeline">
      <button type="button" className="round" onClick={togglePlay} aria-label={s.playing ? t('editor.pause') : t('editor.play')}>
        {s.playing ? (
          <svg viewBox="0 0 24 24" width="22" height="22"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
        )}
      </button>
      <div className="timeline__main">
        <div
          className="timeline__bar"
          ref={bar}
          onPointerDown={down('head')}
          onPointerMove={(e) => drag.current && apply(e.clientX)}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        >
          <div className="timeline__dim" style={{ left: 0, width: pct(s.trim.start) }} />
          <div className="timeline__dim" style={{ left: pct(s.trim.end), right: 0 }} />
          <div className="timeline__sel" style={{ left: pct(s.trim.start), width: pct(len) }} />
          <span className="timeline__grip timeline__grip--start" style={{ left: pct(s.trim.start) }} onPointerDown={down('start')} />
          <span className="timeline__grip timeline__grip--end" style={{ left: pct(s.trim.end) }} onPointerDown={down('end')} />
          <span className="timeline__head" style={{ left: pct(s.playheadS) }} />
        </div>
        <div className="timeline__labels">
          <span>{mmss(s.playheadS)}</span>
          <span className="timeline__clock">{s.ride ? clock(clipStart(s) + s.playheadS * 1000) : ''}</span>
          <span>
            {mmss(s.trim.start)}–{mmss(s.trim.end)} · <b>{mmss(len)}</b>
          </span>
        </div>
      </div>
    </div>
  );
}
