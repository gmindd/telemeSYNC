import { useState } from 'react';
import {
  CAMERA_PROFILES,
  clipWarnings,
  describeCandidate,
  effectiveStart,
  utcToWall,
  wallToUtc,
  type Camera,
  type Clip,
} from '@telemesync/core';
import { ClipList } from '../components/ClipList.tsx';
import { Preview } from '../components/Preview.tsx';
import { Timeline } from '../components/Timeline.tsx';
import { ValuesPanel } from '../components/ValuesPanel.tsx';
import { useApp } from '../lib/store.ts';
import { fmtOffset } from '../lib/format.ts';

const TIME_ZONES = ['Europe/Lisbon', 'Atlantic/Madeira', 'Atlantic/Azores', 'Europe/Madrid', 'Europe/Paris', 'Europe/London', 'UTC'];

function Nudges({ onNudge }: { onNudge: (ms: number) => void }) {
  return (
    <span className="nudges">
      {[-60000, -1000, -100, 100, 1000, 60000].map((d) => (
        <button key={d} className="small" onClick={() => onNudge(d)}>
          {d > 0 ? '+' : '−'}
          {Math.abs(d) >= 60000 ? '1 min' : Math.abs(d) >= 1000 ? '1 s' : '0,1 s'}
        </button>
      ))}
    </span>
  );
}

function CameraRow({ cam }: { cam: Camera }) {
  const { setCameraOffset, setCameraTimeZone, setCameraLabel } = useApp();
  const [text, setText] = useState<string | null>(null);
  return (
    <div className="camera-row" style={{ borderLeftColor: cam.color }}>
      <input className="cam-label" value={cam.label} onChange={(e) => setCameraLabel(cam.id, e.target.value)} />
      <span className="muted">{CAMERA_PROFILES[cam.profile].label}</span>
      <label>
        Offset
        <input
          className="num"
          value={text ?? (cam.offsetMs / 1000).toFixed(1).replace('.', ',')}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const v = Number((text ?? '').replace(',', '.'));
            if (text !== null && Number.isFinite(v)) setCameraOffset(cam.id, v * 1000);
            setText(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        s
      </label>
      <Nudges onNudge={(d) => setCameraOffset(cam.id, cam.offsetMs + d)} />
      <span className="muted">{fmtOffset(cam.offsetMs)}</span>
      <select value={cam.timeZone} onChange={(e) => setCameraTimeZone(cam.id, e.target.value)} title="Fuso horário do relógio da câmara">
        {[...new Set([cam.timeZone, ...TIME_ZONES])].map((z) => <option key={z}>{z}</option>)}
      </select>
    </div>
  );
}

function toLocalInput(utcMs: number, tz: string): string {
  return new Date(utcToWall(utcMs, tz)).toISOString().slice(0, 19);
}

function ClipDetail({ clip, cam }: { clip: Clip; cam: Camera }) {
  const { ride, setClipOffset, setManualStart, setCameraOffset } = useApp();
  const start = effectiveStart(clip, cam);
  const warnings = ride ? clipWarnings(clip, cam, ride.startTime, ride.endTime) : [];
  return (
    <div className="card clip-detail">
      <h3>{clip.meta.fileName}</h3>
      {warnings.map((w) => (
        <div key={w.code} className="warning">
          ⚠ {w.message}
          {w.suggestedOffsetMs ? (
            <button className="small" onClick={() => setCameraOffset(cam.id, cam.offsetMs + w.suggestedOffsetMs!)}>
              Corrigir câmara {w.suggestedOffsetMs > 0 ? '+' : '−'}{Math.abs(w.suggestedOffsetMs / 3600_000)} h
            </button>
          ) : null}
        </div>
      ))}
      <div className="row">
        <span>Ajuste só deste clip: <b>{fmtOffset(clip.clipOffsetMs)}</b></span>
        <Nudges onNudge={(d) => setClipOffset(clip.id, clip.clipOffsetMs + d)} />
        {clip.clipOffsetMs ? <button className="small" onClick={() => setClipOffset(clip.id, 0)}>Repor</button> : null}
      </div>
      <div className="row">
        <label>
          Hora de início manual ({cam.timeZone}):{' '}
          <input
            type="datetime-local"
            step="1"
            value={clip.manualStartUtcMs !== undefined ? toLocalInput(clip.manualStartUtcMs, cam.timeZone) : ''}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return setManualStart(clip.id, undefined);
              const wall = Date.parse(`${v.length === 16 ? `${v}:00` : v}Z`);
              if (Number.isFinite(wall)) setManualStart(clip.id, wallToUtc(wall, cam.timeZone));
            }}
          />
        </label>
        {clip.manualStartUtcMs !== undefined ? <button className="small" onClick={() => setManualStart(clip.id, undefined)}>Usar automática</button> : null}
      </div>
      <details>
        <summary>Fontes de hora encontradas</summary>
        <ul>
          {clip.resolved.candidates.length === 0 ? <li>Nenhuma.</li> : null}
          {clip.resolved.candidates.map((c) => (
            <li key={c.resolver}>
              {describeCandidate(c, cam.timeZone)} {c.resolver === clip.resolved.source ? <b>(em uso)</b> : (
                <button className="small" onClick={() => setManualStart(clip.id, c.startUtcMs)}>Usar esta</button>
              )}
            </li>
          ))}
          {clip.chapterStartUtcMs !== undefined ? <li>Capítulo {clip.chapter?.index}: início encadeado no fim do capítulo anterior <b>(em uso)</b></li> : null}
        </ul>
        {!CAMERA_PROFILES[cam.profile].verified ? (
          <p className="muted">A interpretação das datas do perfil {CAMERA_PROFILES[cam.profile].label} ainda não foi validada com ficheiros reais.</p>
        ) : null}
      </details>
      {start === undefined ? <p className="error">Sem hora de início: indique-a manualmente.</p> : null}
    </div>
  );
}

export function StepSync() {
  const st = useApp();
  const { ride, sync, activeClipId, playhead, style, files, overlays, layout } = st;
  if (!ride) return <section><p>Carregue primeiro a telemetria.</p></section>;
  const cams = new Map(sync.cameras.map((c) => [c.id, c]));
  const clip = sync.clips.find((c) => c.id === activeClipId) ?? sync.clips[0];
  const cam = clip ? cams.get(clip.cameraId)! : undefined;
  return (
    <section>
      <h2>3. Sincronização</h2>
      <p className="lead">
        Cada câmara tem um offset global: alinhar um clip alinha todos os clips dessa câmara. Valide numa paragem (a velocidade tem de ir a 0 quando a bicicleta para).
      </p>
      <div className="cameras">{sync.cameras.map((c) => <CameraRow key={c.id} cam={c} />)}</div>
      <ClipList ride={ride} sync={sync} activeClipId={clip?.id} onSelect={st.setActiveClip} onClipOffset={st.setClipOffset} />
      <Timeline
        ride={ride}
        sync={sync}
        timeZone={style.timeZone}
        activeClipId={clip?.id}
        playhead={playhead}
        onSelectClip={st.setActiveClip}
        onPlayhead={(t) => st.setPlayhead({ t, source: 'user' })}
        onCameraOffset={st.setCameraOffset}
        onClipOffset={st.setClipOffset}
      />
      {clip && cam ? (
        <div className="sync-bottom">
          <div className="sync-preview">
            <Preview clip={clip} camera={cam} file={files[clip.id]} ride={ride} overlays={overlays} style={style} layout={layout} onPlacement={st.setPlacement} />
            <div className="row muted">
              Arraste os gadgets para os posicionar; o canto inferior direito muda o tamanho. As posições são usadas na exportação "Composição".
              <button className="small" onClick={st.resetLayout}>Repor posições</button>
            </div>
          </div>
          <div className="sync-side">
            <ClipDetail clip={clip} cam={cam} />
            {playhead ? <ValuesPanel ride={ride} t={playhead.t} style={style} /> : null}
          </div>
        </div>
      ) : (
        <p className="muted">Adicione clips no passo 2.</p>
      )}
    </section>
  );
}
