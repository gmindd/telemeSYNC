import { useEffect, useRef } from 'react';
import { useApp, type Step } from './lib/store.ts';
import { StepTelemetry } from './steps/StepTelemetry.tsx';
import { StepClips } from './steps/StepClips.tsx';
import { StepSync } from './steps/StepSync.tsx';
import { StepOverlays } from './steps/StepOverlays.tsx';
import { StepRender } from './steps/StepRender.tsx';

const STEPS: { id: Step; label: string }[] = [
  { id: 'telemetry', label: '1. Telemetria' },
  { id: 'clips', label: '2. Clips' },
  { id: 'sync', label: '3. Sincronização' },
  { id: 'overlays', label: '4. Overlays' },
  { id: 'render', label: '5. Renderizar' },
];

export function App() {
  const { step, setStep, init, notice, dismissNotice, saveProject, openProject, ride, sync } = useApp();
  const projectInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void init();
  }, [init]);
  return (
    <div className="app">
      <header>
        <h1>telemeSYNC</h1>
        <nav>
          {STEPS.map((s) => (
            <button key={s.id} className={step === s.id ? 'active' : ''} onClick={() => setStep(s.id)}>
              {s.label}
            </button>
          ))}
        </nav>
        <div className="project">
          <button className="small" onClick={() => projectInput.current?.click()}>Abrir projeto</button>
          <button className="small" onClick={saveProject} disabled={!ride && !sync.clips.length}>Guardar projeto</button>
          <input
            ref={projectInput}
            type="file"
            accept=".json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void openProject(f);
              e.target.value = '';
            }}
          />
        </div>
      </header>
      {notice ? (
        <div className="notice-bar">
          {notice} <button className="small" onClick={dismissNotice}>OK</button>
        </div>
      ) : null}
      <main>
        {step === 'telemetry' && <StepTelemetry />}
        {step === 'clips' && <StepClips />}
        {step === 'sync' && <StepSync />}
        {step === 'overlays' && <StepOverlays />}
        {step === 'render' && <StepRender />}
      </main>
    </div>
  );
}
