import type { EmblemKind } from './worldThemes';

const TAU = Math.PI * 2;

/** Emblema del mundo (para la tarjeta de inicio), centrado en (x, y) y de radio `r`. */
export function drawEmblem(ctx: CanvasRenderingContext2D, kind: EmblemKind, x: number, y: number, r: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = color;
  ctx.shadowBlur = ctx.getTransform().a * 3;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.8, r * 0.14);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (kind) {
    case 'pacman': {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, 0.6, TAU - 0.6);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'leaf': {
      ctx.beginPath();
      ctx.moveTo(-r, r * 0.8);
      ctx.quadraticCurveTo(-r * 0.9, -r * 0.9, r * 0.9, -r);
      ctx.quadraticCurveTo(r * 0.9, r * 0.7, -r, r * 0.8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,40,10,0.7)';
      ctx.beginPath();
      ctx.moveTo(-r * 0.8, r * 0.7);
      ctx.lineTo(r * 0.5, -r * 0.5);
      ctx.stroke();
      break;
    }
    case 'gear': {
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const rr = i % 2 === 0 ? r : r * 0.78;
        const a = (i / 16) * TAU;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#0a0a10';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.35, 0, TAU);
      ctx.fill();
      break;
    }
    case 'snowflake': {
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI;
        ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        ctx.lineTo(-Math.cos(a) * r, -Math.sin(a) * r);
      }
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.6 - Math.sin(a) * r * 0.25, Math.sin(a) * r * 0.6 + Math.cos(a) * r * 0.25);
        ctx.lineTo(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78);
        ctx.lineTo(Math.cos(a) * r * 0.6 + Math.sin(a) * r * 0.25, Math.sin(a) * r * 0.6 - Math.cos(a) * r * 0.25);
        ctx.stroke();
      }
      break;
    }
    case 'pyramid': {
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r, r * 0.8);
      ctx.lineTo(-r, r * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(70,40,0,0.7)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, r * 0.1);
      ctx.lineTo(r * 0.5, r * 0.1);
      ctx.moveTo(-r * 0.25, -r * 0.45);
      ctx.lineTo(r * 0.25, -r * 0.45);
      ctx.stroke();
      break;
    }
    case 'wave': {
      for (let k = 0; k < 3; k++) {
        const yy = (k - 1) * r * 0.65;
        ctx.beginPath();
        ctx.moveTo(-r, yy);
        ctx.bezierCurveTo(-r * 0.5, yy - r * 0.45, -r * 0.1, yy - r * 0.45, 0, yy);
        ctx.bezierCurveTo(r * 0.1, yy + r * 0.45, r * 0.5, yy + r * 0.45, r, yy);
        ctx.stroke();
      }
      break;
    }
    case 'flame': {
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.bezierCurveTo(r * 0.9, -r * 0.2, r * 0.9, r * 0.9, 0, r);
      ctx.bezierCurveTo(-r * 0.9, r * 0.9, -r * 0.8, -r * 0.1, -r * 0.2, -r * 0.4);
      ctx.bezierCurveTo(-r * 0.2, -r * 0.7, 0, -r * 0.8, 0, -r);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffe6a0';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.45, r * 0.3, r * 0.42, 0, 0, TAU);
      ctx.fill();
      break;
    }
    case 'planet': {
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.62, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = r * 0.16;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.05, r * 0.32, -0.5, 0, TAU);
      ctx.stroke();
      break;
    }
    case 'castle': {
      ctx.beginPath();
      ctx.rect(-r * 0.8, -r * 0.1, r * 1.6, r * 1.0);
      for (let i = 0; i < 3; i++) ctx.rect(-r * 0.8 + i * r * 0.62, -r * 0.5, r * 0.36, r * 0.42);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#0b0818';
      ctx.beginPath();
      ctx.arc(0, r * 0.9, r * 0.3, Math.PI, 0);
      ctx.fill();
      break;
    }
    case 'glitch': {
      for (const [dx, dy, w, h, c2] of [
        [-r, -r * 0.8, r * 1.2, r * 0.4, color],
        [-r * 0.3, -r * 0.2, r * 1.3, r * 0.4, '#00ffe5'],
        [-r * 0.9, r * 0.4, r * 1.1, r * 0.4, color],
        [r * 0.1, r * 0.4, r * 0.8, r * 0.4, '#ffffff'],
      ] as const) {
        ctx.fillStyle = c2;
        ctx.fillRect(dx, dy, w, h);
      }
      break;
    }
  }
  ctx.restore();
}
