import { MAZE_TOP, SCREEN_W, TILE } from '../constants';
import type { Maze } from '../maze/maze';
import type { WorldTheme } from './worldThemes';

/** Ruido determinista (0–1) para texturas estables. */
function noise(a: number, b: number, c = 0): number {
  let h = Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const SCALE = 3;
const MAZE_H = 31 * TILE;

/**
 * Fondo del mundo: degradado, suelo de los pasillos con su textura (hierba, chapa, hielo, arena,
 * agua, lava, rejilla, piedra o ruido digital). Se pinta una vez y se redibuja si cae una pared.
 */
export function renderBackground(maze: Maze, theme: WorldTheme): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SCREEN_W * SCALE;
  canvas.height = MAZE_H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);

  const g = ctx.createLinearGradient(0, 0, 0, MAZE_H);
  g.addColorStop(0, theme.bg[0]);
  g.addColorStop(1, theme.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SCREEN_W, MAZE_H);

  if (theme.floorPattern === 'none') return canvas;
  for (let r = 0; r < maze.rows; r++) {
    for (let c = 0; c < maze.cols; c++) {
      if (!maze.isOpen(c, r)) continue;
      ctx.save();
      ctx.translate(c * TILE, r * TILE);
      ctx.fillStyle = theme.floor;
      ctx.fillRect(0, 0, TILE, TILE);
      drawFloorTile(ctx, theme, c, r);
      ctx.restore();
    }
  }
  return canvas;
}

function drawFloorTile(ctx: CanvasRenderingContext2D, theme: WorldTheme, c: number, r: number): void {
  const n = (k: number) => noise(c, r, k);
  ctx.lineCap = 'round';
  switch (theme.floorPattern) {
    case 'grass': {
      ctx.strokeStyle = 'rgba(140,235,110,0.42)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < 4; i++) {
        const x = 1 + n(i) * 6;
        const lean = (n(i + 9) - 0.5) * 2;
        ctx.beginPath();
        ctx.moveTo(x, 7.2);
        ctx.lineTo(x + lean, 7.2 - 1.6 - n(i + 4) * 1.4);
        ctx.stroke();
      }
      break;
    }
    case 'metal': {
      ctx.strokeStyle = 'rgba(255,205,150,0.2)';
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.lineTo(8, 0);
      ctx.moveTo(0, 4);
      ctx.lineTo(4, 0);
      ctx.moveTo(4, 8);
      ctx.lineTo(8, 4);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,215,170,0.3)';
      for (const [x, y] of [[1, 1], [7, 1], [1, 7], [7, 7]]) {
        ctx.beginPath();
        ctx.arc(x, y, 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'ice': {
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 0.6;
      const o = n(1) * 4;
      ctx.beginPath();
      ctx.moveTo(o, 8);
      ctx.lineTo(o + 4, 4);
      ctx.moveTo(o + 3, 8);
      ctx.lineTo(o + 5.5, 5.5);
      ctx.stroke();
      if (n(2) > 0.8) {
        ctx.strokeStyle = 'rgba(180,240,255,0.35)';
        ctx.lineWidth = 0.4;
        ctx.beginPath();
        ctx.moveTo(1, 2);
        ctx.lineTo(3, 4);
        ctx.lineTo(2.5, 6);
        ctx.stroke();
      }
      break;
    }
    case 'sand': {
      ctx.fillStyle = 'rgba(255,230,170,0.34)';
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(0.8 + n(i) * 6.4, 0.8 + n(i + 7) * 6.4, 0.28 + n(i + 3) * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'water': {
      ctx.strokeStyle = 'rgba(160,245,255,0.28)';
      ctx.lineWidth = 0.45;
      for (let k = 0; k < 2; k++) {
        const y = 2.4 + k * 3.4 + n(k) * 0.8;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.quadraticCurveTo(2, y - 1.1, 4, y);
        ctx.quadraticCurveTo(6, y + 1.1, 8, y);
        ctx.stroke();
      }
      break;
    }
    case 'lava': {
      ctx.fillStyle = 'rgba(40,5,0,0.35)';
      ctx.fillRect(0, 0, TILE, TILE);
      if (n(1) > 0.45) {
        ctx.strokeStyle = 'rgba(255,150,60,0.5)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(n(2) * 8, 0);
        ctx.lineTo(n(3) * 8, 3.5);
        ctx.lineTo(n(4) * 8, 8);
        ctx.stroke();
      }
      break;
    }
    case 'grid': {
      ctx.strokeStyle = 'rgba(170,150,255,0.2)';
      ctx.lineWidth = 0.35;
      ctx.strokeRect(0.2, 0.2, TILE - 0.4, TILE - 0.4);
      if (n(1) > 0.9) {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(3.6, 3.6, 0.8, 0.8);
      }
      break;
    }
    case 'stone': {
      ctx.fillStyle = `rgba(255,255,255,${(n(1) * 0.07).toFixed(3)})`;
      ctx.fillRect(0, 0, TILE, TILE);
      ctx.strokeStyle = 'rgba(10,6,24,0.5)';
      ctx.lineWidth = 0.35;
      ctx.strokeRect(0.2, 0.2, TILE - 0.4, TILE - 0.4);
      if (n(2) > 0.78) {
        ctx.beginPath();
        ctx.moveTo(2, 1);
        ctx.lineTo(4, 4);
        ctx.lineTo(3.2, 7);
        ctx.stroke();
      }
      break;
    }
    case 'glitch': {
      for (let i = 0; i < 2; i++) {
        if (n(i) < 0.55) continue;
        ctx.fillStyle = n(i + 5) > 0.5 ? 'rgba(0,255,230,0.22)' : 'rgba(255,60,240,0.22)';
        ctx.fillRect(n(i + 1) * 5, n(i + 2) * 6, 1.5 + n(i + 3) * 3, 0.8 + n(i + 4) * 1.4);
      }
      break;
    }
    case 'none':
      break;
  }
}

// ───────────────────────── Partículas ─────────────────────────

/**
 * Partículas ambientales (luciérnagas, chispas, nieve, polvo, burbujas, brasas, estrellas, fantasmas
 * de humo, glitch). Se calculan a partir del frame, sin estado: baratas y deterministas.
 */
export function drawParticles(ctx: CanvasRenderingContext2D, theme: WorldTheme, frame: number): void {
  const { kind, color, count } = theme.particles;
  if (kind === 'none') return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, MAZE_TOP, SCREEN_W, MAZE_H);
  ctx.clip();
  ctx.translate(0, MAZE_TOP);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  const t = frame;

  for (let i = 0; i < count; i++) {
    const a = noise(i, 1);
    const b = noise(i, 2);
    const c = noise(i, 3);
    switch (kind) {
      case 'fireflies': {
        const x = a * SCREEN_W + Math.sin(t / 50 + i * 3) * 14;
        const y = b * MAZE_H + Math.cos(t / 63 + i) * 12;
        const pulse = 0.35 + 0.65 * Math.max(0, Math.sin(t / 22 + i * 1.7));
        ctx.shadowColor = color;
        ctx.shadowBlur = ctx.getTransform().a * 3;
        ctx.globalAlpha = pulse * 0.9;
        ctx.beginPath();
        ctx.arc(x, y, 0.9 + c * 0.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'sparks': {
        // Chispas que saltan de vez en cuando y caen deprisa.
        const period = 90 + Math.floor(c * 90);
        const phase = (t + Math.floor(a * period)) % period;
        if (phase > 24) break;
        const x = b * SCREEN_W + phase * (c - 0.5) * 2;
        const y = noise(i, 4) * MAZE_H * 0.8 + phase * phase * 0.06;
        ctx.globalAlpha = 1 - phase / 24;
        ctx.fillRect(x, y, 1.1, 1.1);
        break;
      }
      case 'snow': {
        const speed = 0.25 + c * 0.45;
        const y = (b * MAZE_H + t * speed) % MAZE_H;
        const x = a * SCREEN_W + Math.sin(t / 45 + i) * 5;
        ctx.globalAlpha = 0.5 + c * 0.45;
        ctx.beginPath();
        ctx.arc(x, y, 0.5 + c * 0.9, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'dust': {
        // Polvo y arena arrastrados por el viento, en rachas horizontales.
        const x = (a * (SCREEN_W + 80) + t * (0.7 + c * 0.9)) % (SCREEN_W + 80) - 40;
        const y = b * MAZE_H + Math.sin(t / 30 + i) * 2;
        ctx.globalAlpha = 0.25 + c * 0.3;
        ctx.fillRect(x, y, 2.4 + c * 3, 0.5);
        break;
      }
      case 'bubbles': {
        const speed = 0.2 + c * 0.35;
        const y = MAZE_H - ((b * MAZE_H + t * speed) % MAZE_H);
        const x = a * SCREEN_W + Math.sin(t / 38 + i * 2) * 4;
        const r = 0.9 + c * 2.2;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 0.4;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = color;
        break;
      }
      case 'embers': {
        const speed = 0.3 + c * 0.55;
        const y = MAZE_H - ((b * MAZE_H + t * speed) % MAZE_H);
        const x = a * SCREEN_W + Math.sin(t / 25 + i * 1.3) * 6;
        const life = y / MAZE_H;
        ctx.shadowColor = '#ff6a20';
        ctx.shadowBlur = ctx.getTransform().a * 2;
        ctx.globalAlpha = Math.min(1, life * 1.4) * (0.5 + 0.5 * Math.sin(t / 5 + i));
        ctx.fillRect(x, y, 1, 1);
        break;
      }
      case 'stars': {
        const x = (a * SCREEN_W - t * (0.03 + c * 0.1) + SCREEN_W * 4) % SCREEN_W;
        const y = b * MAZE_H;
        ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(t / (30 + c * 40) + i));
        ctx.fillRect(x, y, c > 0.8 ? 1.4 : 0.8, c > 0.8 ? 1.4 : 0.8);
        break;
      }
      case 'wisps': {
        // Volutas de humo fantasmal que suben despacio y se desvanecen.
        const y = MAZE_H - ((b * MAZE_H + t * 0.12) % MAZE_H);
        const x = a * SCREEN_W + Math.sin(t / 70 + i) * 10;
        const r = 7 + c * 6;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(185,166,255,0.16)');
        g.addColorStop(1, 'rgba(185,166,255,0)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = color;
        break;
      }
      case 'glitch': {
        // Bloques de color que aparecen y desaparecen al azar, y a veces una línea de barrido.
        const slot = Math.floor(t / 7) + i * 13;
        if (noise(slot, i, 9) < 0.55) break;
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = noise(slot, i, 5) > 0.5 ? color : '#ff3df2';
        ctx.fillRect(noise(slot, i, 1) * SCREEN_W, noise(slot, i, 2) * MAZE_H, 4 + noise(slot, i, 3) * 22, 0.8 + noise(slot, i, 4) * 2.5);
        break;
      }
    }
  }
  ctx.restore();
}
