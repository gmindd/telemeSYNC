import { useState } from 'react';
import { clipOverlaps, clipSyncInfo, formatDuration, formatTime, type Clip, type RideData, type SyncState } from '@telemesync/core';
import { fmtOffset } from '../lib/format.ts';

/** Seconds typed with a comma or a point → ms; undefined when not a number. */
function parseSeconds(text: string): number | undefined {
  const v = Number(text.trim().replace('−', '-').replace(',', '.'));
  return Number.isFinite(v) ? Math.round(v * 1000) : undefined;
}

function OffsetInput({ clip, onChange }: { clip: Clip; onChange: (ms: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  const shown = (clip.clipOffsetMs / 1000).toFixed(1).replace('.', ',');
  const commit = () => {
    const ms = text === null ? undefined : parseSeconds(text);
    if (ms !== undefined) onChange(ms);
    setText(null);
  };
  return (
    <span className="clip-offset" onClick={(e) => e.stopPropagation()}>
      <button className="small" title="−1 s" onClick={() => onChange(clip.clipOffsetMs - 1000)}>−1 s</button>
      <button className="small" title="−0,1 s" onClick={() => onChange(clip.clipOffsetMs - 100)}>−0,1</button>
      <input
        className="num"
        aria-label={`Ajuste de ${clip.meta.fileName} em segundos`}
        value={text ?? shown}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <button className="small" title="+0,1 s" onClick={() => onChange(clip.clipOffsetMs + 100)}>+0,1</button>
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
  const cams = new Map(sync.cameras.map((c) => [c.id, c]));
  const overlaps = clipOverlaps(sync);
  if (!sync.clips.length) return null;
  return (
    <div className="clip-list">
      <table>
        <thead>
          <tr>
            <th>Clip</th>
            <th>Início</th>
            <th>Na volta</th>
            <th>Origem da hora</th>
            <th>Ajuste só deste clip (s)</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {sync.clips.map((clip) => {
            const cam = cams.get(clip.cameraId)!;
            const info = clipSyncInfo(clip, cam, ride, overlaps.get(clip.id));
            const s = info.startUtcMs;
            return (
              <tr key={clip.id} className={clip.id === activeClipId ? 'active' : ''} onClick={() => onSelect(clip.id)} title="Ver este clip na pré-visualização">
                <td>
                  <span className="cam-dot" style={{ background: cam.color }} />
                  <span className="clip-name">{clip.meta.fileName}</span>
                  <span className="muted"> · {formatDuration(clip.meta.durationMs)}</span>
                </td>
                <td>{s === undefined ? '—' : formatTime(s, cam.timeZone)}</td>
                <td className="muted">{s === undefined ? '—' : `${formatDuration(Math.max(0, s - ride.startTime))} → ${formatDuration(Math.max(0, s + clip.meta.durationMs - ride.startTime))}`}</td>
                <td className="muted">
                  {info.source}
                  {cam.offsetMs ? ` · câmara ${fmtOffset(cam.offsetMs)}` : ''}
                </td>
                <td>
                  <OffsetInput clip={clip} onChange={(ms) => onClipOffset(clip.id, ms)} />
                </td>
                <td>
                  {info.warnings.length ? (
                    <span className="badge warn" title={info.warnings.join('\n')}>⚠ {info.warnings.length === 1 ? '1 aviso' : `${info.warnings.length} avisos`}</span>
                  ) : (
                    <span className="badge ok">✓</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted">
        Cada clip é exportado à parte, com a sua hora de início. Confirme cada um: escolha o clip, avance até uma paragem ou curva e acerte com o ajuste só desse clip.
        A exportação grava um <b>sincronizacao.txt</b> com estes dados na pasta da volta.
      </p>
    </div>
  );
}
