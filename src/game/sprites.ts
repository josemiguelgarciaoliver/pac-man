import type { GhostName } from './actors/ai';
import { DIRS, Dir } from './constants';
import type { FruitKind } from './rules';

/**
 * Sprites vectoriales: se dibujan directamente en el canvas (en coordenadas lógicas del arcade,
 * 1 unidad = 1 px de 224×288) y se ven nítidos a cualquier resolución, con degradados y brillos.
 */

const TAU = Math.PI * 2;

function parse(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mezcla `hex` con `to` en la proporción t (0 = hex, 1 = to). */
function mix(hex: string, to: string, t: number): string {
  const a = parse(hex);
  const b = parse(to);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const lighten = (hex: string, t: number) => mix(hex, '#ffffff', t);
const darken = (hex: string, t: number) => mix(hex, '#000000', t);

function sphere(ctx: CanvasRenderingContext2D, color: string, r: number): CanvasGradient {
  const g = ctx.createRadialGradient(r * -0.35, r * -0.4, r * 0.1, 0, 0, r * 1.15);
  g.addColorStop(0, lighten(color, 0.65));
  g.addColorStop(0.45, color);
  g.addColorStop(1, darken(color, 0.35));
  return g;
}

// ───────────────────────── Pac-Man ─────────────────────────

const FACING: Record<Dir, number> = {
  [Dir.Right]: 0,
  [Dir.Down]: Math.PI / 2,
  [Dir.Left]: Math.PI,
  [Dir.Up]: -Math.PI / 2,
};

const PAC_R = 7;

function pacShape(ctx: CanvasRenderingContext2D, x: number, y: number, facing: number, mouth: number): void {
  ctx.save();
  ctx.translate(x, y);
  const g = ctx.createRadialGradient(-2.4, -2.6, 0.6, 0, 0, PAC_R * 1.1);
  g.addColorStop(0, '#fffbb0');
  g.addColorStop(0.35, '#ffee22');
  g.addColorStop(1, '#e8a800');
  ctx.fillStyle = g;
  ctx.beginPath();
  if (mouth <= 0.03) {
    ctx.arc(0, 0, PAC_R, 0, TAU);
  } else {
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, PAC_R, facing + mouth, facing + TAU - mouth);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}

/** `anim` avanza 1 por tick mientras Pac-Man se mueve; la boca abre y cierra suavemente. */
export function drawPac(ctx: CanvasRenderingContext2D, x: number, y: number, dir: Dir, anim: number): void {
  const phase = (anim % 8) / 8;
  const mouth = 0.04 + 0.78 * (0.5 - 0.5 * Math.cos(phase * TAU));
  pacShape(ctx, x, y, FACING[dir], mouth);
}

/** progress 0..1: la boca se abre hasta consumir a Pac-Man y estalla en destellos. */
export function drawPacDeath(ctx: CanvasRenderingContext2D, x: number, y: number, progress: number): void {
  if (progress < 0.85) {
    pacShape(ctx, x, y, FACING[Dir.Up], 0.1 + (progress / 0.85) * (Math.PI - 0.1));
    return;
  }
  const t = (progress - 0.85) / 0.15;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = `rgba(255, 238, 34, ${1 - t})`;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * (3 + t * 8), Math.sin(a) * (3 + t * 8), 1.3 * (1 - t * 0.5), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// ───────────────────────── Fantasmas ─────────────────────────

const GHOST_COLOR: Record<GhostName, string> = {
  blinky: '#ff2a2a',
  pinky: '#ffa6f0',
  inky: '#27e8ff',
  clyde: '#ffa83a',
};

export type GhostLook = 'normal' | 'frightened' | 'flash' | 'eyes';

function ghostBody(ctx: CanvasRenderingContext2D, wave: boolean): void {
  const w = 14 / 3;
  ctx.beginPath();
  ctx.moveTo(-7, 6.5);
  ctx.lineTo(-7, -1);
  ctx.arc(0, -1, 7, Math.PI, TAU);
  ctx.lineTo(7, 6.5);
  for (let i = 0; i < 3; i++) {
    const x1 = 7 - i * w;
    const up = (i % 2 === 0) !== wave;
    ctx.quadraticCurveTo(x1 - w / 2, 6.5 + (up ? 3.2 : -1.4), x1 - w, 6.5);
  }
  ctx.closePath();
}

function ghostEyes(ctx: CanvasRenderingContext2D, dir: Dir): void {
  const d = DIRS[dir];
  for (const ex of [-2.7, 2.7]) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(ex, -1.6, 2.3, 2.9, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1a2cff';
    ctx.beginPath();
    ctx.arc(ex + d.x * 1.1, -1.6 + d.y * 1.5, 1.35, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(ex + d.x * 1.1 - 0.4, -1.6 + d.y * 1.5 - 0.5, 0.4, 0, TAU);
    ctx.fill();
  }
}

export function drawGhost(ctx: CanvasRenderingContext2D, x: number, y: number, name: GhostName, dir: Dir, anim: number, look: GhostLook): void {
  ctx.save();
  ctx.translate(x, y);
  const wave = Math.floor(anim / 6) % 2 === 0;

  if (look === 'eyes') {
    ghostEyes(ctx, dir);
    ctx.restore();
    return;
  }

  const frightened = look !== 'normal';
  const base = look === 'flash' ? '#f4f4ff' : look === 'frightened' ? '#2a3dff' : GHOST_COLOR[name];
  const g = ctx.createLinearGradient(0, -8, 0, 9);
  g.addColorStop(0, lighten(base, frightened ? 0.25 : 0.4));
  g.addColorStop(0.5, base);
  g.addColorStop(1, darken(base, 0.3));
  ctx.fillStyle = g;
  ghostBody(ctx, wave);
  ctx.fill();

  if (!frightened) {
    ghostEyes(ctx, dir);
  } else {
    const face = look === 'flash' ? '#ff2a2a' : '#ffd2c8';
    ctx.fillStyle = face;
    for (const ex of [-2.5, 2.5]) {
      ctx.beginPath();
      ctx.arc(ex, -1.6, 1.2, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = face;
    ctx.lineWidth = 0.9;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-4.8, 3.6);
    for (let i = 0; i < 5; i++) ctx.lineTo(-4.8 + (i + 1) * 1.92, i % 2 === 0 ? 2.1 : 3.6);
    ctx.stroke();
  }
  ctx.restore();
}

// ───────────────────────── Frutas ─────────────────────────

function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size = 3): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = '#35b52a';
  ctx.beginPath();
  ctx.ellipse(size * 0.5, 0, size, size * 0.45, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function ball(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = sphere(ctx, color, r);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.restore();
}

export function drawFruit(ctx: CanvasRenderingContext2D, kind: FruitKind, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = 'round';
  switch (kind) {
    case 'cherry': {
      ctx.strokeStyle = '#4a8f2a';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-3.2, 2);
      ctx.quadraticCurveTo(-3, -3.5, 2.4, -6.2);
      ctx.moveTo(3.4, 2.8);
      ctx.quadraticCurveTo(3.4, -2.5, 2.4, -6.2);
      ctx.stroke();
      leaf(ctx, 2.6, -6.2, -0.5, 3.4);
      ball(ctx, -3.2, 4, 3.4, '#ff2233');
      ball(ctx, 3.4, 4.8, 3.4, '#e5102a');
      break;
    }
    case 'strawberry': {
      ctx.save();
      ctx.translate(0, 0.5);
      const g = ctx.createRadialGradient(-2, -2, 1, 0, 0, 8);
      g.addColorStop(0, '#ff7a86');
      g.addColorStop(0.5, '#ff2640');
      g.addColorStop(1, '#a30f26');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 7);
      ctx.bezierCurveTo(-7.5, 3, -7.5, -3.2, -3, -4.2);
      ctx.quadraticCurveTo(0, -5, 3, -4.2);
      ctx.bezierCurveTo(7.5, -3.2, 7.5, 3, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#ffe680';
      for (const [sx, sy] of [[-3, -1], [0, -1.5], [3, -1], [-2, 2], [2, 2], [0, 4.2]]) ctx.fillRect(sx - 0.4, sy - 0.6, 0.8, 1.2);
      ctx.restore();
      leaf(ctx, 0, -4.4, -2.6, 3.4);
      leaf(ctx, 0, -4.4, -0.55, 3.4);
      leaf(ctx, 0, -4.4, -1.57, 3);
      break;
    }
    case 'orange': {
      ball(ctx, 0, 1, 6, '#ffa31a');
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      for (const [sx, sy] of [[-2, 2], [1.5, 3.5], [2.5, 0], [-3, -0.5]]) ctx.fillRect(sx, sy, 0.7, 0.7);
      ctx.strokeStyle = '#6b4a1e';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(0.5, -6.6);
      ctx.stroke();
      leaf(ctx, 0.6, -5.8, -0.4, 3.4);
      break;
    }
    case 'apple': {
      ball(ctx, -2.2, 1.8, 4.4, '#ff2a2a');
      ball(ctx, 2.2, 1.8, 4.4, '#ee1c1c');
      ball(ctx, 0, 2.4, 4.6, '#f52424');
      ctx.strokeStyle = '#6b4a1e';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(0, -2.2);
      ctx.quadraticCurveTo(0.3, -4.5, 1.6, -6);
      ctx.stroke();
      leaf(ctx, 0.8, -4.6, -0.7, 3.6);
      break;
    }
    case 'melon': {
      ball(ctx, 0, 1, 6.2, '#46c43a');
      ctx.strokeStyle = 'rgba(15,95,25,0.7)';
      ctx.lineWidth = 0.6;
      for (const bend of [-3.4, -1.2, 1.2, 3.4]) {
        ctx.beginPath();
        ctx.moveTo(0, -5.2);
        ctx.quadraticCurveTo(bend * 1.3, 1, 0, 7.2);
        ctx.stroke();
      }
      ctx.strokeStyle = '#6b8f2a';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(0, -5.2);
      ctx.lineTo(0, -6.8);
      ctx.stroke();
      break;
    }
    case 'galaxian': {
      const wing = (s: number) => {
        ctx.fillStyle = '#2a4bff';
        ctx.beginPath();
        ctx.moveTo(s * 1.5, -3);
        ctx.lineTo(s * 7, -5.5);
        ctx.lineTo(s * 6.6, 1.5);
        ctx.lineTo(s * 3.5, 4.2);
        ctx.lineTo(s * 1.5, 1);
        ctx.closePath();
        ctx.fill();
      };
      wing(-1);
      wing(1);
      const g = ctx.createLinearGradient(0, -7, 0, 7);
      g.addColorStop(0, '#fff27a');
      g.addColorStop(1, '#f0a800');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(2.2, -1);
      ctx.lineTo(1.4, 6.5);
      ctx.lineTo(-1.4, 6.5);
      ctx.lineTo(-2.2, -1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ff2a2a';
      ctx.fillRect(-0.7, -6, 1.4, 3);
      break;
    }
    case 'bell': {
      const g = ctx.createLinearGradient(-6, 0, 6, 0);
      g.addColorStop(0, '#f0a800');
      g.addColorStop(0.4, '#fff27a');
      g.addColorStop(1, '#d99200');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-6.4, 4.6);
      ctx.quadraticCurveTo(-5.8, -6.2, 0, -6);
      ctx.quadraticCurveTo(5.8, -6.2, 6.4, 4.6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 6, 1.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffd24a';
      ctx.fillRect(-0.8, -7.4, 1.6, 1.6);
      break;
    }
    case 'key': {
      ctx.strokeStyle = '#3ae8ff';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, -3.6, 2.6, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#e8ffff';
      ctx.fillRect(-0.9, -1, 1.8, 8);
      ctx.fillStyle = '#3ae8ff';
      ctx.fillRect(0.9, 3.8, 2.6, 1.3);
      ctx.fillRect(0.9, 6, 1.8, 1.3);
      break;
    }
  }
  ctx.restore();
}
