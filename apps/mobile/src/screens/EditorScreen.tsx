// Editor: the picture on top, the timeline under it, and the tools in a panel with tabs at the bottom (gadgets,
// sync, format), the way phone video editors are laid out.
import { useEffect, useRef, useState } from 'react';
import { Stage } from '../components/Stage.tsx';
import { Timeline } from '../components/Timeline.tsx';
import { t } from '../i18n.ts';
import { pause } from '../lib/player.ts';
import { FormatPanel } from '../panels/FormatPanel.tsx';
import { GadgetsPanel } from '../panels/GadgetsPanel.tsx';
import { useStreets } from '../lib/streets.ts';
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
  useStreets();
  // Gadgets in their default places may sit on areas the social apps cover: move them on opening
  useEffect(() => useProject.getState().settleAll(), []);
  const compact = useCompactStage(s.tab);
  return (
    <main className={`editor${compact.on ? ' is-compact' : ''}`}>
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
      <section className="tools" ref={compact.ref} onScroll={compact.onScroll} onTouchStart={compact.onTouchStart} onTouchMove={compact.onTouchMove}>
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

/** Scroll past this (px) in the tools and the picture shrinks; back at the top it grows again. */
const COMPACT_AT = 40;
/** A swipe down this long (px) at the top of the tools also brings the picture back (the list may not scroll). */
const EXPAND_SWIPE = 30;
/** The picture changing size moves the scroll: those scroll events are not the user's. */
const SETTLE_MS = 400;

/**
 * Smaller picture while the user scrolls through the gadgets and settings, so there is room to see them; it stays in
 * view, and swiping back to the top makes it big again. A new tab starts at the top with the big picture.
 */
function useCompactStage(tab: Tab) {
  const ref = useRef<HTMLElement>(null);
  const [on, setOn] = useState(false);
  const lockUntil = useRef(0);
  const touchY = useRef<number | null>(null);
  const set = (v: boolean) => {
    if (v === on) return;
    lockUntil.current = performance.now() + SETTLE_MS;
    setOn(v);
  };
  useEffect(() => {
    setOn(false);
    if (ref.current) ref.current.scrollTop = 0;
  }, [tab]);
  return {
    ref,
    on,
    onScroll: () => {
      const top = ref.current?.scrollTop ?? 0;
      if (performance.now() < lockUntil.current) return;
      if (!on && top > COMPACT_AT) set(true);
      else if (on && top <= 0) set(false);
    },
    onTouchStart: (e: React.TouchEvent) => {
      touchY.current = e.touches[0]?.clientY ?? null;
    },
    onTouchMove: (e: React.TouchEvent) => {
      const y = e.touches[0]?.clientY;
      if (!on || touchY.current === null || y === undefined || (ref.current?.scrollTop ?? 0) > 0) return;
      if (y - touchY.current > EXPAND_SWIPE) set(false);
    },
  };
}
