import type { Ctx2D, OverlayStyle } from './types.ts';

export function font(style: OverlayStyle, sizePx: number, weight = 700): string {
  return `${weight} ${sizePx}px "${style.fontFamily}", "Inter", "Segoe UI", Arial, sans-serif`;
}

const digitWidthCache = new Map<string, number>();

/** Widest digit for the current font: each digit is drawn centred in a cell this wide (tabular figures). */
function digitCell(ctx: Ctx2D): number {
  const key = ctx.font;
  let w = digitWidthCache.get(key);
  if (w === undefined) {
    w = 0;
    for (let d = 0; d <= 9; d++) w = Math.max(w, ctx.measureText(String(d)).width);
    digitWidthCache.set(key, w);
  }
  return w;
}

/** Width of `text` laid out with tabular digits. */
export function measureTabular(ctx: Ctx2D, text: string): number {
  const cell = digitCell(ctx);
  let w = 0;
  for (const ch of text) w += ch >= '0' && ch <= '9' ? cell : ctx.measureText(ch).width;
  return w;
}

function applyShadow(ctx: Ctx2D, style: OverlayStyle, on: boolean) {
  if (on && style.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1.5;
  } else {
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }
}

/**
 * Draws text with tabular digits, an outline and optional shadow.
 * `x` is interpreted according to `align`; baseline is alphabetic.
 * Returns the drawn width.
 */
export function drawText(
  ctx: Ctx2D,
  text: string,
  x: number,
  y: number,
  style: OverlayStyle,
  opts: { size: number; weight?: number; color?: string; align?: 'left' | 'right' | 'center'; tabular?: boolean },
): number {
  ctx.font = font(style, opts.size, opts.weight ?? 700);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const tabular = opts.tabular ?? true;
  const total = tabular ? measureTabular(ctx, text) : ctx.measureText(text).width;
  let cx = opts.align === 'right' ? x - total : opts.align === 'center' ? x - total / 2 : x;
  const cell = digitCell(ctx);
  const glyphs: { ch: string; x: number }[] = [];
  if (tabular) {
    for (const ch of text) {
      const isDigit = ch >= '0' && ch <= '9';
      const w = ctx.measureText(ch).width;
      glyphs.push({ ch, x: isDigit ? cx + (cell - w) / 2 : cx });
      cx += isDigit ? cell : w;
    }
  } else glyphs.push({ ch: text, x: cx });

  ctx.lineJoin = 'round';
  if (style.outlineWidth > 0) {
    applyShadow(ctx, style, true);
    ctx.strokeStyle = style.outlineColor;
    ctx.lineWidth = style.outlineWidth * (opts.size / 40) * 2;
    for (const g of glyphs) ctx.strokeText(g.ch, g.x, y);
    applyShadow(ctx, style, false);
  } else applyShadow(ctx, style, true);
  ctx.fillStyle = opts.color ?? style.textColor;
  for (const g of glyphs) ctx.fillText(g.ch, g.x, y);
  applyShadow(ctx, style, false);
  return total;
}

/** Strokes the current path twice: outline (wider, dark) then colour. */
export function strokeWithOutline(ctx: Ctx2D, style: OverlayStyle, color: string, width: number) {
  if (style.outlineWidth > 0) {
    ctx.strokeStyle = style.outlineColor;
    ctx.lineWidth = width + style.outlineWidth * 1.5;
    ctx.stroke();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

export function dot(ctx: Ctx2D, style: OverlayStyle, x: number, y: number, r: number, color: string) {
  ctx.beginPath();
  ctx.arc(x, y, r + (style.outlineWidth > 0 ? style.outlineWidth * 0.8 : 0), 0, Math.PI * 2);
  ctx.fillStyle = style.outlineWidth > 0 ? style.outlineColor : color;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}
