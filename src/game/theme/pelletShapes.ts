import type { PelletShape } from './worldThemes';

const TAU = Math.PI * 2;

function noise(a: number, b: number): number {
  let h = Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Dibuja un punto del mundo con su forma (semilla, tuerca, copo, grano, perla, brasa, estrella…). */
export function drawPelletShape(ctx: CanvasRenderingContext2D, shape: PelletShape, color: string, x: number, y: number, frame: number, col: number, row: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  switch (shape) {
    case 'seed': {
      ctx.rotate(-0.6 + noise(col, row) * 1.2);
      ctx.beginPath();
      ctx.ellipse(0, 0, 1.7, 1.05, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(120,70,20,0.45)';
      ctx.beginPath();
      ctx.ellipse(0.5, 0, 0.55, 0.35, 0, 0, TAU);
      ctx.fill();
      break;
    }
    case 'bolt': {
      // Tuerca hexagonal con agujero.
      ctx.beginPath();
      for (let i = 0; i < 6; i++) ctx.lineTo(Math.cos((i / 6) * TAU) * 1.8, Math.sin((i / 6) * TAU) * 1.8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#1b1d28';
      ctx.beginPath();
      ctx.arc(0, 0, 0.7, 0, TAU);
      ctx.fill();
      break;
    }
    case 'snowflake': {
      ctx.lineWidth = 0.45;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI;
        ctx.moveTo(Math.cos(a) * 1.9, Math.sin(a) * 1.9);
        ctx.lineTo(-Math.cos(a) * 1.9, -Math.sin(a) * 1.9);
      }
      ctx.stroke();
      break;
    }
    case 'grain': {
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-1.1, -1.1, 2.2, 2.2);
      break;
    }
    case 'pearl': {
      const g = ctx.createRadialGradient(-0.5, -0.5, 0.1, 0, 0, 1.8);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#9fb4cf');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 1.6, 0, TAU);
      ctx.fill();
      break;
    }
    case 'ember': {
      ctx.shadowColor = '#ff7a30';
      ctx.shadowBlur = ctx.getTransform().a * 2.2;
      ctx.globalAlpha = 0.65 + 0.35 * Math.sin(frame / 6 + col * 2 + row);
      ctx.beginPath();
      ctx.arc(0, 0, 1.25, 0, TAU);
      ctx.fill();
      break;
    }
    case 'star': {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const r = i % 2 === 0 ? 2 : 0.7;
        const a = (i / 8) * TAU - Math.PI / 2;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'coin': {
      ctx.beginPath();
      ctx.arc(0, 0, 1.75, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(150,100,10,0.6)';
      ctx.lineWidth = 0.35;
      ctx.beginPath();
      ctx.arc(0, 0, 1.0, 0, TAU);
      ctx.stroke();
      break;
    }
    case 'pixel': {
      // Píxeles que parpadean con colores de "error".
      const slot = Math.floor(frame / 9) + col * 7 + row * 13;
      const n = noise(slot, col);
      ctx.fillStyle = n > 0.82 ? '#ff3df2' : n > 0.64 ? '#00ffe5' : color;
      ctx.fillRect(-1.1, -1.1, 2.2, 2.2);
      break;
    }
    case 'dot':
      ctx.beginPath();
      ctx.arc(0, 0, 1.2, 0, TAU);
      ctx.fill();
      break;
  }
  ctx.restore();
}
