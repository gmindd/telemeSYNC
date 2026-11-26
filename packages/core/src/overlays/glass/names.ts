import { pick, tr, type CoreKey, type Lang, type Translations } from '../../i18n/index.ts';
import { METRIC_SLUGS } from '../slugs.ts';

/** Second design of the same metric in the glass theme. */
export type GlassVariant = 'zone' | 'strip';

const GLASS_SLUG: Translations = ['glass', 'vidro', 'verre', 'cristal', 'glas'];
const PANEL_SLUG: Translations = ['panel', 'painel', 'panneau', 'panel', 'panel'];
const VARIANT_SLUG: Record<GlassVariant, Translations> = {
  zone: ['zone', 'zona', 'zone', 'zona', 'zone'],
  strip: ['strip', 'faixa', 'bandeau', 'franja', 'leiste'],
};

/** App name ("Vidro · Velocidade", "Vidro · Painel · Velocidade") and file slug ("vidro-painel-velocidade"). */
export function glassNames(name: CoreKey, slug: keyof typeof METRIC_SLUGS, opts: { panel?: boolean; variant?: GlassVariant } = {}) {
  return {
    labelFor: (lang: Lang | undefined) => {
      const inner = opts.panel ? tr(lang, 'overlay.panel', { name: tr(lang, name) }) : tr(lang, name);
      return tr(lang, 'overlay.glass', { name: inner }) + (opts.variant ? ` (${tr(lang, `glass.v.${opts.variant}`)})` : '');
    },
    slugFor: (lang: Lang | undefined) =>
      [
        pick(GLASS_SLUG, lang),
        ...(opts.panel ? [pick(PANEL_SLUG, lang)] : []),
        pick(METRIC_SLUGS[slug], lang),
        ...(opts.variant ? [pick(VARIANT_SLUG[opts.variant], lang)] : []),
      ].join('-'),
  };
}
