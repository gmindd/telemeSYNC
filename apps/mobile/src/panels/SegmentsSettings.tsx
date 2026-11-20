// Segments and laps, as on the desktop: marked at the playhead (start and end for a PR attempt, "lap here" at each
// crossing of the line), or taken from the bike computer's laps; listed to rename, nudge by a second, go to or delete.
// The segment gadgets show them while they are ridden.
import { decimalSeparator, formatLapTime, sortedSegments, type Segment } from '@telemesync/core';
import { clock, LANG, t } from '../i18n.ts';
import { seek } from '../lib/player.ts';
import { clipStart, useProject } from '../state.ts';

export function SegmentsSettings() {
  const s = useProject();
  if (!s.ride) return null;
  const ride = s.ride;
  const start = clipStart(s);
  const now = start + s.playheadS * 1000;
  const inRide = now >= ride.startTime && now <= ride.endTime;
  const dec = decimalSeparator(LANG);
  const segments = sortedSegments(s.segments);
  const deviceLaps = ride.laps?.length ?? 0;
  const nudge = (g: Segment, edge: 'startMs' | 'endMs', d: number) => s.updateSegment(g.id, { [edge]: g[edge] + d });
  // The video only covers part of the ride: "go to" works for what is in it
  const videoEnd = start + (s.info?.durationS ?? 0) * 1000;
  return (
    <div className="pr segs">
      <h3>{t('seg.title')}</h3>
      <p className="fine">{t('seg.help')}</p>
      <div className="segs__marks">
        <button type="button" className="chip-btn" disabled={!inRide} onClick={() => s.markSegmentStart(now)}>
          ⇤ {t('seg.markStart')}
        </button>
        <button type="button" className="chip-btn" disabled={!inRide || s.segAnchor === undefined || now <= s.segAnchor} onClick={() => s.markSegmentEnd(now)}>
          ⇥ {t('seg.markEnd')}
        </button>
        <button type="button" className="chip-btn" disabled={!inRide} onClick={() => s.markLap(now)}>
          ⚑ {t('seg.markLap')}
        </button>
      </div>
      {!inRide && <p className="warn">{t('seg.outside')}</p>}
      {s.segAnchor !== undefined && (
        <p className="fine">
          {t('seg.anchor', { time: clock(s.segAnchor) })}{' '}
          <button type="button" className="link" onClick={s.cancelSegmentAnchor}>
            {t('seg.cancel')}
          </button>
        </p>
      )}
      {deviceLaps > 1 && (
        <button type="button" className="chip-btn" onClick={s.importDeviceLaps}>
          ⚑ {t('seg.importLaps', { n: deviceLaps })}
        </button>
      )}
      {segments.length === 0 ? (
        <p className="fine">{t('seg.empty')}</p>
      ) : (
        <ul className="segs__list">
          {segments.map((g) => {
            const inVideo = g.startMs >= start && g.startMs <= videoEnd;
            return (
              <li key={g.id} className={`segs__item segs__item--${g.kind}`}>
                <div className="segs__head">
                  <span className="segs__kind">{t(`seg.kind.${g.kind}`)}</span>
                  <input className="num-input segs__name" value={g.name} maxLength={60} aria-label={t(`seg.kind.${g.kind}`)} onChange={(e) => s.updateSegment(g.id, { name: e.target.value })} />
                  <b className="segs__time">{formatLapTime(g.endMs - g.startMs, dec)}</b>
                </div>
                <div className="segs__nudge">
                  <span>
                    {t('seg.startNudge')} {clock(g.startMs)}
                  </span>
                  <button type="button" className="chip-btn" onClick={() => nudge(g, 'startMs', -1000)}>
                    −1 s
                  </button>
                  <button type="button" className="chip-btn" onClick={() => nudge(g, 'startMs', 1000)}>
                    +1 s
                  </button>
                </div>
                <div className="segs__nudge">
                  <span>
                    {t('seg.endNudge')} {clock(g.endMs)}
                  </span>
                  <button type="button" className="chip-btn" onClick={() => nudge(g, 'endMs', -1000)}>
                    −1 s
                  </button>
                  <button type="button" className="chip-btn" onClick={() => nudge(g, 'endMs', 1000)}>
                    +1 s
                  </button>
                </div>
                <div className="segs__actions">
                  <button type="button" className="chip-btn" disabled={!inVideo} onClick={() => seek((g.startMs - start) / 1000)}>
                    ⏵ {inVideo ? t('seg.goto') : t('seg.notInClip')}
                  </button>
                  <button type="button" className="chip-btn danger" onClick={() => s.removeSegment(g.id)}>
                    {t('seg.delete')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {segments.length > 1 && (
        <button type="button" className="chip-btn danger" onClick={s.clearSegments}>
          {t('seg.deleteAll')}
        </button>
      )}
    </div>
  );
}
