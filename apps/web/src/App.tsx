import { useEffect, useRef, useState } from 'react';
import { APP_INFO } from './config.ts';
import { AboutDialog } from './components/AboutDialog.tsx';
import { UpdateBanner } from './components/UpdateBanner.tsx';
import { DonateButton, WebsiteLink } from './components/ExternalLinks.tsx';
import { StepWelcome } from './steps/StepWelcome.tsx';
import { useApp, type Step } from './lib/store.ts';
import { StepTelemetry } from './steps/StepTelemetry.tsx';
import { StepClips } from './steps/StepClips.tsx';
import { StepSync } from './steps/StepSync.tsx';
import { StepOverlays } from './steps/StepOverlays.tsx';
import { StepRender } from './steps/StepRender.tsx';
import { LangSwitch, useT } from './i18n/index.tsx';
import type { MessageKey } from './i18n/messages.ts';

const STEPS: { id: Step; label: MessageKey }[] = [
  { id: 'welcome', label: 'nav.welcome' },
  { id: 'telemetry', label: 'nav.telemetry' },
  { id: 'clips', label: 'nav.clips' },
  { id: 'sync', label: 'nav.sync' },
  { id: 'overlays', label: 'nav.overlays' },
  { id: 'render', label: 'nav.render' },
];

export function App() {
  const { step, setStep, init, notice, dismissNotice, saveProject, openProject, ride, sync } = useApp();
  const projectInput = useRef<HTMLInputElement>(null);
  const [about, setAbout] = useState(false);
  const t = useT();
  useEffect(() => {
    void init();
  }, [init]);
  return (
    <div className="app">
      <header>
        <h1 className="logo" onClick={() => setStep('welcome')}>
          tele<em>me</em>SYNC
        </h1>
        <nav>
          {STEPS.map((s) => (
            <button key={s.id} className={step === s.id ? 'active' : ''} onClick={() => setStep(s.id)}>
              {t(s.label)}
            </button>
          ))}
        </nav>
        <div className="project">
          <button className="small" onClick={() => projectInput.current?.click()}>{t('project.open')}</button>
          <button className="small" onClick={saveProject} disabled={!ride && !sync.clips.length}>{t('project.save')}</button>
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
        <LangSwitch />
      </header>
      <UpdateBanner />
      {notice ? (
        <div className="notice-bar">
          {notice} <button className="small" onClick={dismissNotice}>OK</button>
        </div>
      ) : null}
      <main>
        {step === 'welcome' && <StepWelcome onAbout={() => setAbout(true)} />}
        {step === 'telemetry' && <StepTelemetry />}
        {step === 'clips' && <StepClips />}
        {step === 'sync' && <StepSync />}
        {step === 'overlays' && <StepOverlays />}
        {step === 'render' && <StepRender />}
      </main>
      <footer>
        <span>
          {APP_INFO.name} v{APP_INFO.version} · {t('footer.free')} · © {APP_INFO.year} {APP_INFO.author} · <WebsiteLink />
        </span>
        <span className="footer-actions">
          <button className="linklike" onClick={() => setAbout(true)}>
            {t('footer.about')}
          </button>
          <DonateButton />
        </span>
      </footer>
      {about ? <AboutDialog onClose={() => setAbout(false)} /> : null}
    </div>
  );
}
