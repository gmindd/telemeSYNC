import { decimalSeparator, formatLapTime, formatTime, sortedSegments, type RideData, type Segment } from '@telemesync/core';
import { useLang, useT } from '../i18n/index.tsx';
import { useApp } from '../lib/store.ts';

/** Clock time with tenths, e.g. "09:12:03.4". */
function clock(ms: number, tz: string, dec: string): string {
  return `${formatTime(Math.floor(ms / 1000) * 1000, tz)}${dec}${Math.floor((((ms % 1000) + 1000) % 1000) / 100)}`;
}

/** Marks segments (PR attempts) and laps at the playhead, and lists them for renaming, fine tuning and deleting. */
export function SegmentsPanel({ ride, timeZone }: { ride: RideData; timeZone: string }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const dec = decimalSeparator(lang);
  const { playhead, segAnchor, style, markSegmentStart, markSegmentEnd, markLap, cancelSegmentAnchor, updateSegment, removeSegment, clearSegments, importDeviceLaps, setPlayhead } = useApp();
  const now = playhead?.t;
  const segments = sortedSegments(style.segments);
  const deviceLaps = ride.laps?.length ?? 0;
  const nudge = (g: Segment, edge: 'startMs' | 'endMs', d: number) => updateSegment(g.id, { [edge]: g[edge] + d });
  return (
    <div className="card segments">
      <h3>{t('seg.title')}</h3>
      <p className="muted small">{t('seg.help')}</p>
      <div className="row">
        <button className="small" disabled={now === undefined} onClick={() => now !== undefined && markSegmentStart(now)}>⇤ {t('seg.markStart')}</button>
        <button className="small" disabled={now === undefined || segAnchor === undefined || now <= segAnchor} onClick={() => now !== undefined && markSegmentEnd(now)}>⇥ {t('seg.markEnd')}</button>
        <button className="small" disabled={now === undefined} onClick={() => now !== undefined && markLap(now)}>⚑ {t('seg.markLap')}</button>
      </div>
      {now === undefined ? <p className="muted small">{t('seg.needPlayhead')}</p> : null}
      {segAnchor !== undefined ? (
        <p className="notice small">
          {t('seg.anchor', { time: clock(segAnchor, timeZone, dec) })} <button className="small" onClick={cancelSegmentAnchor}>{t('seg.cancel')}</button>
        </p>
      ) : null}
      {deviceLaps > 1 ? (
        <button className="small" onClick={importDeviceLaps}>⚑ {t('seg.importLaps', { n: deviceLaps })}</button>
      ) : null}
      {segments.length === 0 ? (
        <p className="muted small">{t('seg.empty')}</p>
      ) : (
        <ul className="segment-list">
          {segments.map((g) => (
            <li key={g.id} className={`seg-${g.kind}`}>
              <div className="row">
                <span className="seg-kind">{t(`seg.kind.${g.kind}`)}</span>
                <input className="seg-name" value={g.name} maxLength={60} onChange={(e) => updateSegment(g.id, { name: e.target.value })} />
                <b className="seg-time">{formatLapTime(g.endMs - g.startMs, dec)}</b>
                <button className="small" title={t('seg.goto')} onClick={() => setPlayhead({ t: g.startMs, source: 'user' })}>⏵</button>
                <button className="small" title={t('seg.delete')} aria-label={t('seg.delete')} onClick={() => removeSegment(g.id)}>✕</button>
              </div>
              <div className="row muted small">
                <span>{t('seg.startNudge')} {clock(g.startMs, timeZone, dec)}</span>
                <button className="tiny" onClick={() => nudge(g, 'startMs', -1000)}>−1 s</button>
                <button className="tiny" onClick={() => nudge(g, 'startMs', 1000)}>+1 s</button>
                <span>{t('seg.endNudge')} {clock(g.endMs, timeZone, dec)}</span>
                <button className="tiny" onClick={() => nudge(g, 'endMs', -1000)}>−1 s</button>
                <button className="tiny" onClick={() => nudge(g, 'endMs', 1000)}>+1 s</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {segments.length > 1 ? (
        <button className="small" onClick={clearSegments}>{t('seg.deleteAll')}</button>
      ) : null}
    </div>
  );
}
