import { pick, tr, type CoreKey, type Lang, type Translations } from '../../i18n/index.ts';
import { METRIC_SLUGS } from '../slugs.ts';

/** Second design of the same metric (from the mountain-bike half of the Christmas board). */
export type Variant = 'reindeer' | 'log' | 'warning' | 'cabin' | 'wreath' | 'globe' | 'mug';

const NATAL_SLUG: Translations = ['xmas', 'natal', 'noel', 'navidad', 'weihnachten'];
const VARIANT_SLUG: Record<Variant, Translations> = {
  reindeer: ['reindeer', 'renas', 'rennes', 'renos', 'rentier'],
  log: ['log', 'tronco', 'buche', 'tronco', 'baumstamm'],
  warning: ['warning', 'perigo', 'danger', 'peligro', 'warnschild'],
  cabin: ['cabin', 'cabana', 'chalet', 'cabana', 'huette'],
  wreath: ['wreath', 'coroa', 'couronne', 'corona', 'kranz'],
  globe: ['globe', 'globo', 'boule', 'bola', 'schneekugel'],
  mug: ['mug', 'caneca', 'tasse', 'taza', 'tasse'],
};

/** App name ("Natal · Velocidade (tronco)") and file slug ("natal-velocidade-tronco") of a Christmas overlay. */
export function natalNames(name: CoreKey, slug: keyof typeof METRIC_SLUGS, variant?: Variant) {
  return {
    labelFor: (lang: Lang | undefined) =>
      tr(lang, 'overlay.natal', { name: tr(lang, name) }) + (variant ? ` (${tr(lang, `natal.v.${variant}`)})` : ''),
    slugFor: (lang: Lang | undefined) =>
      [pick(NATAL_SLUG, lang), pick(METRIC_SLUGS[slug], lang), ...(variant ? [pick(VARIANT_SLUG[variant], lang)] : [])].join('-'),
  };
}
