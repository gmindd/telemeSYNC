import { useState } from 'react';
import { clipOverlaps, clipSyncInfo, formatDuration, formatTime, tr, type Clip, type RideData, type SyncState } from '@telemesync/core';
import { useLang, useT } from '../i18n/index.tsx';
import { dec, fmtOffset, parseDecimal } from '../lib/format.ts';

/** Seconds typed with a comma or a point → ms; undefined when not a number. */
function parseSeconds(text: string): number | undefined {
  const v = parseDecimal(text);
  return v === undefined ? undefined : Math.round(v * 1000);
}

function OffsetInput({ clip, onChange }: { clip: Clip; onChange: (ms: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  const t = useT();
  const lang = useLang((s) => s.lang);
  const shown = dec(clip.clipOffsetMs / 1000, 1, lang);
  const tenth = dec(0.1, 1, lang);
  const commit = () => {
    const ms = text === null ? undefined : parseSeconds(text);
    if (ms !== undefined) onChange(ms);
    setText(null);
  };
  return (
    <span className="clip-offset" onClick={(e) => e.stopPropagation()}>
      <button className="small" title="−1 s" onClick={() => onChange(clip.clipOffsetMs - 1000)}>−1 s</button>
      <button className="small" title={`−${tenth} s`} onClick={() => onChange(clip.clipOffsetMs - 100)}>−{tenth}</button>
      <input
        className="num"
        aria-label={t('list.offsetOf', { file: clip.meta.fileName })}
        value={text ?? shown}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <button className="small" title={`+${tenth} s`} onClick={() => onChange(clip.clipOffsetMs + 100)}>+{tenth}</button>
      <button className="small" title="+1 s" onClick={() => onChange(clip.clipOffsetMs + 1000)}>+1 s</button>
    </span>
  );
}

/**
 * Every clip in one table: start used, where it comes from, where it falls in the ride, its own
 * fine adjustment and warnings. Each clip is exported on its own, so each can be checked here.
 */
export function ClipList({
  ride,
  sync,
  activeClipId,
  onSelect,
  onClipOffset,
}: {
  ride: RideData;
  sync: SyncState;
  activeClipId?: string;
  onSelect: (id: string) => void;
  onClipOffset: (id: string, ms: number) => void;
}) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const cams = new Map(sync.cameras.map((c) => [c.id, c]));
  const overlaps = clipOverlaps(sync);
  if (!sync.clips.length) return null;
  return (
    <div className="clip-list">
      <table>
        <thead>
          <tr>
            <th>{t('list.clip')}</th>
            <th>{t('list.start')}</th>
            <th>{t('list.onRide')}</th>
            <th>{t('list.source')}</th>
            <th>{t('list.offset')}</th>
            <th>{t('list.status')}</th>
          </tr>
        </thead>
        <tbody>
          {sync.clips.map((clip) => {
            const cam = cams.get(clip.cameraId)!;
            const info = clipSyncInfo(clip, cam, ride, overlaps.get(clip.id), lang);
            const s = info.startUtcMs;
            return (
              <tr key={clip.id} className={clip.id === activeClipId ? 'active' : ''} onClick={() => onSelect(clip.id)} title={t('list.preview')}>
                <td>
                  <span className="cam-dot" style={{ background: cam.color }} />
                  <span className="clip-name">{clip.meta.fileName}</span>
                  <span className="muted"> · {formatDuration(clip.meta.durationMs)}</span>
                </td>
                <td>{s === undefined ? '—' : formatTime(s, cam.timeZone)}</td>
                <td className="muted">{s === undefined ? '—' : `${formatDuration(Math.max(0, s - ride.startTime))} → ${formatDuration(Math.max(0, s + clip.meta.durationMs - ride.startTime))}`}</td>
                <td className="muted">
                  {info.source}
                  {cam.offsetMs ? ` · ${t('list.camera', { offset: fmtOffset(cam.offsetMs, lang) })}` : ''}
                </td>
                <td>
                  <OffsetInput clip={clip} onChange={(ms) => onClipOffset(clip.id, ms)} />
                </td>
                <td>
                  {info.warnings.length ? (
                    <span className="badge warn" title={info.warnings.join('\n')}>⚠ {info.warnings.length === 1 ? t('list.warning1') : t('list.warningN', { n: info.warnings.length })}</span>
                  ) : (
                    <span className="badge ok">✓</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted">{t('list.note', { file: tr(lang, 'file.report') })}</p>
    </div>
  );
}
