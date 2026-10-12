/**
 * Texto del HUD. Mantiene la cuadrícula de 8 px del arcade (cada carácter ocupa una celda),
 * pero con tipografía suave en lugar de píxeles.
 */
export const CHAR_W = 6.6;

const FONT = "800 8.2px 'Arial Rounded MT Bold', 'Trebuchet MS', 'Segoe UI', Verdana, sans-serif";

export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string): void {
  ctx.save();
  ctx.font = FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = ctx.getTransform().a * 0.9;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ') continue;
    ctx.fillText(text[i].toUpperCase(), x + i * CHAR_W + CHAR_W / 2, y + 7.2);
  }
  ctx.restore();
}

/** Texto alineado a la derecha: `x` es el borde derecho. */
export function drawTextRight(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string): void {
  drawText(ctx, text, x - text.length * CHAR_W, y, color);
}

export function drawTextCentered(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, color: string): void {
  drawText(ctx, text, Math.round(cx - (text.length * CHAR_W) / 2), y, color);
}
