import type { ReactElement } from 'react';
import { create } from 'zustand';
import { interpolate, isLang, LANGS, pick, type Lang, type Params } from '@telemesync/core';
import { MESSAGES, type MessageKey } from './messages.ts';

const LANG_KEY = 'telemesync.lang';

function storedLang(): Lang {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (isLang(v)) return v;
  } catch {
    /* ignore */
  }
  return 'en';
}

interface LangState {
  lang: Lang;
  setLang(lang: Lang): void;
}

/** App language, English by default, remembered on this computer. */
export const useLang = create<LangState>((set) => ({
  lang: storedLang(),
  setLang(lang) {
    set({ lang });
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* ignore */
    }
  },
}));
document.documentElement.lang = useLang.getState().lang;

/** Current language, outside React (store actions, API client). */
export function currentLang(): Lang {
  return useLang.getState().lang;
}

export type T = (key: MessageKey, params?: Params) => string;

export function translate(lang: Lang, key: MessageKey, params?: Params): string {
  return interpolate(pick(MESSAGES[key], lang), params);
}

/** Text in the current language, outside React. */
export const t: T = (key, params) => translate(currentLang(), key, params);

/** Translation function for components (re-renders when the language changes). */
export function useT(): T {
  const lang = useLang((s) => s.lang);
  return (key, params) => translate(lang, key, params);
}

/** BCP 47 locale for dates and numbers formatted by the browser. */
export function locale(lang: Lang): string {
  return { en: 'en-GB', pt: 'pt-PT', fr: 'fr-FR', es: 'es-ES', de: 'de-DE' }[lang];
}

const NAMES: Record<Lang, string> = { en: 'English', pt: 'Português', fr: 'Français', es: 'Español', de: 'Deutsch' };

const FLAGS: Record<Lang, ReactElement> = {
  en: (
    <svg viewBox="0 0 60 40" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="60" height="40" fill="#012169" />
      <path d="M0 0 60 40M60 0 0 40" stroke="#fff" strokeWidth="8" />
      <path d="M0 0 60 40M60 0 0 40" stroke="#c8102e" strokeWidth="3" />
      <path d="M30 0v40M0 20h60" stroke="#fff" strokeWidth="12" />
      <path d="M30 0v40M0 20h60" stroke="#c8102e" strokeWidth="7" />
    </svg>
  ),
  pt: (
    <svg viewBox="0 0 30 20" aria-hidden="true">
      <rect width="12" height="20" fill="#006600" />
      <rect x="12" width="18" height="20" fill="#ff0000" />
      <circle cx="12" cy="10" r="4.2" fill="#ffcc00" />
      <circle cx="12" cy="10" r="2.6" fill="#ff0000" stroke="#fff" strokeWidth=".8" />
    </svg>
  ),
  fr: (
    <svg viewBox="0 0 30 20" aria-hidden="true">
      <rect width="10" height="20" fill="#002654" />
      <rect x="10" width="10" height="20" fill="#fff" />
      <rect x="20" width="10" height="20" fill="#ce1126" />
    </svg>
  ),
  es: (
    <svg viewBox="0 0 30 20" aria-hidden="true">
      <rect width="30" height="20" fill="#aa151b" />
      <rect y="5" width="30" height="10" fill="#f1bf00" />
    </svg>
  ),
  de: (
    <svg viewBox="0 0 30 20" aria-hidden="true">
      <rect width="30" height="7" fill="#000" />
      <rect y="6.6" width="30" height="6.8" fill="#dd0000" />
      <rect y="13.3" width="30" height="6.7" fill="#ffce00" />
    </svg>
  ),
};

export function langName(lang: Lang): string {
  return NAMES[lang];
}

/** Flag buttons in the header, as on the site. */
export function LangSwitch() {
  const { lang, setLang } = useLang();
  return (
    <div className="lang-switch" role="group" aria-label="Language · Língua · Langue · Idioma · Sprache">
      {LANGS.map((l) => (
        <button key={l} type="button" className="lang-flag" lang={l} title={NAMES[l]} aria-label={NAMES[l]} aria-pressed={l === lang} onClick={() => setLang(l)}>
          {FLAGS[l]}
        </button>
      ))}
    </div>
  );
}
