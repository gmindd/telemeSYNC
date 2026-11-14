// Editor: the picture on top, the timeline under it, and the tools in a panel with tabs at the bottom (gadgets,
// sync, format), the way phone video editors are laid out.
import { useEffect } from 'react';
import { Stage } from '../components/Stage.tsx';
import { Timeline } from '../components/Timeline.tsx';
import { t } from '../i18n.ts';
import { pause } from '../lib/player.ts';
import { FormatPanel } from '../panels/FormatPanel.tsx';
import { GadgetsPanel } from '../panels/GadgetsPanel.tsx';
import { SyncPanel } from '../panels/SyncPanel.tsx';
import { useProject, type Tab } from '../state.ts';

const ICONS: Record<Tab, string> = {
  gadgets: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM16.5 13a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z',
  sync: 'M12 4a8 8 0 1 0 8 8h-2a6 6 0 1 1-6-6V4zm-1 3h2v5.4l3.5 2.1-1 1.7L11 13.5z',
  format: 'M3 6h4V4H3a1 1 0 0 0-1 1v4h2V6zm18-2h-4v2h4v3h2V5a1 1 0 0 0-1-1zM4 15H2v4a1 1 0 0 0 1 1h4v-2H4v-3zm16 3h-3v2h4a1 1 0 0 0 1-1v-4h-2v3zM8 8h8v8H8z',
};

export function EditorScreen() {
  const s = useProject();
  const tabs: Tab[] = ['gadgets', 'sync', 'format'];
  // Gadgets in their default places may sit on areas the social apps cover: move them on opening
  useEffect(() => useProject.getState().settleAll(), []);
  return (
    <main className="editor">
      <header className="bar">
        <button type="button" className="icon" aria-label={t('editor.back')} onClick={() => (pause(), s.setScreen('start'))}>
          <svg viewBox="0 0 24 24" width="24" height="24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <span className="bar__title">{s.clip?.name}</span>
        <button type="button" className="primary small" disabled={!s.overlays.length} onClick={() => (pause(), s.setScreen('export'))}>
          {t('editor.export')}
        </button>
      </header>
      <Stage />
      <Timeline />
      <section className="tools">
        {s.tab === 'gadgets' && <GadgetsPanel />}
        {s.tab === 'sync' && <SyncPanel />}
        {s.tab === 'format' && <FormatPanel />}
      </section>
      <nav className="tabs">
        {tabs.map((tab) => (
          <button key={tab} type="button" className={s.tab === tab ? 'is-on' : ''} aria-current={s.tab === tab} onClick={() => s.setTab(tab)}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d={ICONS[tab]} fill="currentColor" /></svg>
            <span>{t(`tab.${tab}`)}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
