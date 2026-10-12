import { COLORS, TILE } from '../constants';
import type { Maze } from './maze';

/** Resolución del lienzo de paredes: píxeles por unidad lógica. */
const RES = 6;
/** Distancia (unidades lógicas) entre el suelo y la línea de la pared; da las esquinas redondeadas. */
const LINE_FROM = 3.0;
const LINE_TO = 4.3;
/** El resplandor interior se desvanece hasta esta distancia. */
const GLOW_TO = 8;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Dibuja las paredes de un laberinto. A partir de un campo de distancias (de cada punto de pared
 * al suelo más cercano, calculado a alta resolución) salen las líneas con esquinas redondeadas,
 * así que cualquier laberinto comparte el estilo arcade. Si una explosión derriba una pared,
 * `refresh` recalcula solo las casillas afectadas y `render` vuelve a componer el dibujo.
 */
export class WallRenderer {
  private readonly w: number;
  private readonly h: number;
  private readonly dist: Float32Array;

  constructor(private readonly maze: Maze) {
    this.w = maze.cols * TILE * RES;
    this.h = maze.rows * TILE * RES;
    this.dist = new Float32Array(this.w * this.h);
    for (let tr = 0; tr < maze.rows; tr++) for (let tc = 0; tc < maze.cols; tc++) this.computeTile(tc, tr);
  }

  private computeTile(tc: number, tr: number): void {
    const { maze, w, dist } = this;
    const x0 = tc * TILE * RES;
    const y0 = tr * TILE * RES;
    const open: [number, number][] = [];
    if (!maze.isOpen(tc, tr)) {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (maze.isOpen(tc + dc, tr + dr)) open.push([(tc + dc) * TILE, (tr + dr) * TILE]);
    }
    for (let py = y0; py < y0 + TILE * RES; py++) {
      const fy = (py + 0.5) / RES;
      for (let px = x0; px < x0 + TILE * RES; px++) {
        if (open.length === 0) {
          dist[py * w + px] = Infinity;
          continue;
        }
        const fx = (px + 0.5) / RES;
        let best = Infinity;
        for (const [ox, oy] of open) {
          const dx = Math.max(ox - fx, 0, fx - (ox + TILE));
          const dy = Math.max(oy - fy, 0, fy - (oy + TILE));
          const d2 = dx * dx + dy * dy;
          if (d2 < best) best = d2;
        }
        dist[py * w + px] = Math.sqrt(best);
      }
    }
  }

  /** Recalcula las casillas vecinas a las paredes que cambiaron. */
  refresh(changed: readonly { col: number; row: number }[]): void {
    const done = new Set<number>();
    for (const t of changed) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const c = t.col + dc;
          const r = t.row + dr;
          if (c < 0 || r < 0 || c >= this.maze.cols || r >= this.maze.rows || done.has(r * 100 + c)) continue;
          done.add(r * 100 + c);
          this.computeTile(c, r);
        }
      }
    }
  }

  /** Paredes con trazo luminoso, esquinas redondeadas y un suave brillo interior. */
  render(color: string = COLORS.wall): HTMLCanvasElement {
    const { w, h, dist, maze } = this;
    const line = document.createElement('canvas');
    line.width = w;
    line.height = h;
    const lctx = line.getContext('2d')!;
    const img = lctx.createImageData(w, h);
    const [r, g, b] = hexToRgb(color);
    const aa = RES * 0.9;
    for (let i = 0; i < dist.length; i++) {
      const d = dist[i];
      let a = 0;
      if (d >= LINE_FROM - 0.2 && d <= LINE_TO + 0.2) {
        a = Math.min(1, (d - (LINE_FROM - 0.2)) * aa, (LINE_TO + 0.2 - d) * aa);
      } else if (d > LINE_TO && d < GLOW_TO) {
        a = 0.32 * (1 - (d - LINE_TO) / (GLOW_TO - LINE_TO)) ** 2;
      }
      if (a <= 0) continue;
      const o = i * 4;
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] = Math.round(a * 255);
    }
    lctx.putImageData(img, 0, 0);

    // Resplandor exterior: la capa se pinta una vez con sombra y otra encima, nítida.
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d')!;
    ctx.shadowColor = color;
    ctx.shadowBlur = RES * 2.4;
    ctx.drawImage(line, 0, 0);
    ctx.shadowBlur = 0;
    ctx.drawImage(line, 0, 0);

    // Puerta de la casa de fantasmas.
    ctx.shadowColor = COLORS.door;
    ctx.shadowBlur = RES * 1.5;
    ctx.fillStyle = COLORS.door;
    for (const d of maze.doors()) {
      const x = d.c * TILE * RES;
      const y = (d.r * TILE + TILE / 2 - 1) * RES;
      ctx.beginPath();
      ctx.roundRect(x, y, TILE * RES, 2 * RES, RES);
      ctx.fill();
    }
    return out;
  }
}

/** Atajo para un único dibujo (el juego usa `WallRenderer` para poder actualizarlo). */
export function renderWalls(maze: Maze, color: string = COLORS.wall): HTMLCanvasElement {
  return new WallRenderer(maze).render(color);
}
