import type { FamilyMember } from '../data/family';

/**
 * Caras reales de la familia para los sprites de las miniaturas. Si existe
 * `public/assets/faces/<nombre>.png` (cuadrada, con la cara centrada) se usa; si no, el juego
 * dibuja una carita vectorial. No hace falta tocar código para cambiarlas.
 */
const images = new Map<FamilyMember, HTMLImageElement | null>();

export function getFace(who: FamilyMember): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null; // pruebas sin navegador
  if (!images.has(who)) {
    images.set(who, null);
    const img = new Image();
    img.onload = () => images.set(who, img);
    img.onerror = () => images.set(who, null); // no hay foto: se queda la carita vectorial
    img.src = `${import.meta.env.BASE_URL}assets/faces/${who}.png`;
  }
  return images.get(who) ?? null;
}

/** Dibuja la cara de `who` centrada en (0,0) con radio r: la foto recortada en círculo o la carita vectorial. */
export function drawFace(ctx: CanvasRenderingContext2D, who: FamilyMember, r: number): void {
  const photo = getFace(who);
  if (photo) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(photo, -r, -r, r * 2, r * 2);
    ctx.restore();
    return;
  }
  // Carita provisional: piel, ojos, sonrisa y el peinado de cada uno.
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r * 1.1);
  g.addColorStop(0, '#ffe2c4');
  g.addColorStop(1, '#e9a878');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = who === 'aina' ? '#5a3418' : '#6a4420';
  ctx.beginPath();
  ctx.arc(0, -r * 0.1, r * 1.02, Math.PI * 1.08, Math.PI * 1.92);
  ctx.lineTo(0, -r * 0.2);
  ctx.closePath();
  ctx.fill();
  if (who === 'aina') {
    // Coletas y lazo.
    ctx.beginPath();
    ctx.arc(-r * 0.95, -r * 0.1, r * 0.3, 0, Math.PI * 2);
    ctx.arc(r * 0.95, -r * 0.1, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff5fa8';
    ctx.beginPath();
    ctx.arc(0, -r * 0.98, r * 0.24, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#2a1a10';
  ctx.beginPath();
  ctx.arc(-r * 0.36, r * 0.05, r * 0.11, 0, Math.PI * 2);
  ctx.arc(r * 0.36, r * 0.05, r * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#a0432e';
  ctx.lineWidth = Math.max(0.4, r * 0.1);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, r * 0.18, r * 0.36, 0.25, Math.PI - 0.25);
  ctx.stroke();
}
