import { CORE_MESSAGES, type CoreKey } from './messages.ts';

/** Languages of the app and of the texts drawn in the overlays. English is the default. */
export type Lang = 'en' | 'pt' | 'fr' | 'es' | 'de';
export const LANGS: Lang[] = ['en', 'pt', 'fr', 'es', 'de'];
export const DEFAULT_LANG: Lang = 'en';

/** Every translation is a tuple in this order: en, pt, fr, es, de. */
export type Translations = readonly [en: string, pt: string, fr: string, es: string, de: string];

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGS as string[]).includes(v);
}

export type Params = Record<string, string | number>;

/** Replaces {name} placeholders. */
export function interpolate(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/** Picks the language from a tuple (unknown language → English). */
export function pick(t: Translations, lang: Lang | undefined): string {
  const i = LANGS.indexOf(lang ?? DEFAULT_LANG);
  return t[i < 0 ? 0 : i] || t[0];
}

/** Core texts (overlays, sync warnings, report, errors). */
export function tr(lang: Lang | undefined, key: CoreKey, params?: Params): string {
  return interpolate(pick(CORE_MESSAGES[key], lang), params);
}

/** An error whose text can be shown in any language (the message itself is English). */
export class LocalizedError extends Error {
  constructor(
    readonly key: CoreKey,
    readonly params?: Params,
  ) {
    super(tr('en', key, params));
    this.name = 'LocalizedError';
  }
}

/** Text of any error in `lang` (plain errors keep their own message). */
export function errorText(e: unknown, lang: Lang | undefined): string {
  if (e instanceof LocalizedError) return tr(lang, e.key, e.params);
  if (e && typeof e === 'object' && 'key' in e && typeof (e as { key: unknown }).key === 'string' && (e as { key: string }).key in CORE_MESSAGES) {
    return tr(lang, (e as { key: CoreKey }).key, (e as { params?: Params }).params);
  }
  return e instanceof Error ? e.message : String(e);
}

export function decimalSeparator(lang: Lang | undefined): string {
  return (lang ?? DEFAULT_LANG) === 'en' ? '.' : ',';
}

/** Fixed decimals with the language's decimal separator. NaN → "—". */
export function formatNumber(v: number, decimals: number, lang: Lang | undefined): string {
  if (!Number.isFinite(v)) return '—';
  const s = v.toFixed(decimals);
  const clean = s === '-0' || /^-0\.0+$/.test(s) ? s.slice(1) : s;
  return clean.replace('.', decimalSeparator(lang));
}

export type { CoreKey } from './messages.ts';
