import { COLORS, TILE } from '../constants';
import type { Maze } from './maze';

/** Radio (px) del margen entre el suelo y la línea de la pared; da las esquinas redondeadas. */
const MARGIN = 3;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Dibuja las paredes de forma procedural: se encoge cada bloque de pared MARGIN px respecto al
 * suelo (distancia euclídea → esquinas redondeadas) y se traza el contorno de 1 px del resultado.
 * Funciona para cualquier laberinto, por lo que los 100 niveles comparten el estilo arcade.
 */
export function renderWalls(maze: Maze, color: string = COLORS.wall): HTMLCanvasElement {
  const w = maze.cols * TILE;
  const h = maze.rows * TILE;
  const solid = new Uint8Array(w * h).fill(1);

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const tc = Math.floor(px / TILE);
      const tr = Math.floor(py / TILE);
      if (maze.isOpen(tc, tr)) {
        solid[py * w + px] = 0;
        continue;
      }
      // Distancia del centro del píxel al suelo más cercano entre las casillas vecinas.
      const fx = px + 0.5;
      const fy = py + 0.5;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!maze.isOpen(tc + dc, tr + dr)) continue;
          const x0 = (tc + dc) * TILE;
          const y0 = (tr + dr) * TILE;
          const dx = Math.max(x0 - fx, 0, fx - (x0 + TILE));
          const dy = Math.max(y0 - fy, 0, fy - (y0 + TILE));
          if (dx * dx + dy * dy <= MARGIN * MARGIN) solid[py * w + px] = 0;
        }
      }
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const [r, g, b] = hexToRgb(color);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 1 : solid[y * w + x]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!solid[y * w + x]) continue;
      if (at(x - 1, y) && at(x + 1, y) && at(x, y - 1) && at(x, y + 1)) continue;
      const i = (y * w + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  ctx.fillStyle = COLORS.door;
  for (const d of maze.doors()) ctx.fillRect(d.c * TILE, d.r * TILE + TILE / 2 - 1, TILE, 2);
  return canvas;
}
