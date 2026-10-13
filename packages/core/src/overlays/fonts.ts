/** Embedded font family name used by DEFAULT_STYLE. Files live in packages/core/assets/fonts/inter. */
export const EMBEDDED_FONT_FAMILY = 'TelemeSync Inter';
export const EMBEDDED_FONT_WEIGHTS = [400, 600, 700, 800] as const;
export const embeddedFontFile = (weight: number) => `Inter-${weight}.woff2`;
