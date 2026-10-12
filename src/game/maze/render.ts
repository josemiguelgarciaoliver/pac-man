import { COLORS, TILE } from '../constants';
import type { WallStyle } from '../theme/worldThemes';
import type { Maze } from './maze';

/** Resolución del lienzo de paredes: píxeles por unidad lógica. */
const RES = 6;
/** Distancia (unidades lógicas) entre el suelo y la línea de la pared; da las esquinas redondeadas. */
const LINE_FROM = 3.0;
const LINE_TO = 4.3;
/** El resplandor interior se desvanece hasta esta distancia. */
const GLOW_TO = 8;

export interface WallLook {
  style?: WallStyle;
  /** Relleno de las paredes (estilos sólidos); null/undefined = interior vacío con resplandor. */
  fill?: string | null;
  /** Tamaño del ladrillo (unidades lógicas) en estilo 'brick'. */
  brick?: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Ruido determinista por casilla (0–1). */
function hash2(a: number, b: number): number {
  let h = Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Opacidad de una banda de línea centrada en el rango [from, to] de distancias, con borde suave. */
function band(d: number, from: number, to: number, aa: number): number {
  if (d < from - 0.2 || d > to + 0.2) return 0;
  return Math.min(1, (d - (from - 0.2)) * aa, (to + 0.2 - d) * aa);
}

/**
 * Dibuja las paredes de un laberinto. A partir de un campo de distancias (de cada punto de pared
 * al suelo más cercano, calculado a alta resolución) salen las líneas con esquinas redondeadas,
 * así que cualquier laberinto comparte el estilo; cada mundo lo viste distinto (neón, setos,
 * acero, cristal, ladrillo, olas, grietas, guiones, glitch). Si una explosión derriba una pared,
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

  /** Paredes con el estilo y el color del mundo. */
  render(color: string = COLORS.wall, look: WallLook = {}): HTMLCanvasElement {
    const { w, h, dist, maze } = this;
    const style = look.style ?? 'neon';
    const line = document.createElement('canvas');
    line.width = w;
    line.height = h;
    const lctx = line.getContext('2d')!;
    const img = lctx.createImageData(w, h);
    const [r, g, b] = hexToRgb(color);
    const fill = look.fill ? hexToRgb(look.fill) : null;
    const bw = RES * (look.brick || 4) * 2;
    const bh = RES * (look.brick || 4);
    const aa = RES * 0.9;
    const data = img.data;

    for (let i = 0; i < dist.length; i++) {
      let d = dist[i];
      if (d === Infinity) continue;
      const x = i % w;
      const y = (i - x) / w;
      let cr = r;
      let cg = g;
      let cb = b;

      // Deformaciones del trazo según el estilo.
      if (style === 'wavy') {
        d += 0.4 * Math.sin(x / (RES * 2.3) + y / (RES * 3.4));
      } else if (style === 'jagged') {
        d += (hash2(Math.floor(x / (RES * 1.05)), Math.floor(y / (RES * 1.05))) - 0.5) * 1.0;
      } else if (style === 'glitch') {
        const slice = Math.floor(y / (RES * 1.7));
        if (hash2(slice, 7) > 0.82) {
          const shifted = x + Math.round((hash2(slice, 11) - 0.5) * RES * 7);
          const sx = Math.min(w - 1, Math.max(0, shifted));
          d = dist[y * w + sx];
          if (d === Infinity) continue;
        }
      }

      let a = band(d, LINE_FROM, LINE_TO, aa);
      if (style === 'dashed') {
        if (Math.floor((x + y) / (RES * 1.9)) % 2 === 1) a *= 0.08;
      } else if (style === 'crystal') {
        a = Math.max(a, band(d, 5.5, 6.3, aa) * 0.75);
      } else if (style === 'glitch') {
        // Aberración cromática: una segunda copia cian desplazada a un lado.
        const sx = Math.max(0, x - Math.round(RES * 1.2));
        const a2 = band(dist[y * w + sx], LINE_FROM, LINE_TO, aa);
        if (a2 > a) {
          a = a2;
          cr = 0;
          cg = 255;
          cb = 230;
        }
      }

      let alpha = a;
      if (fill && d > LINE_TO) {
        // Relleno con bisel: más tintado por el color de la pared cerca del borde.
        const f = Math.min(1, (d - LINE_TO) / 3.6);
        const fadeOut = d < 8.6 ? 1 : Math.max(0, 1 - (d - 8.6) / 2.2);
        let shade = 1;
        if (style === 'brick') {
          const row = Math.floor(y / bh);
          const mortar = y % bh < RES * 0.5 || (x + (row & 1) * (bw / 2)) % bw < RES * 0.5;
          shade = mortar ? 0.55 : 0.92 + hash2(Math.floor((x + (row & 1) * (bw / 2)) / bw), row) * 0.2;
        } else if (style === 'solid') {
          shade = 0.9 + hash2(Math.floor(x / (RES * 2)), Math.floor(y / (RES * 2))) * 0.18;
        }
        const tint = 0.3 * (1 - f);
        const fa = 0.96 * fadeOut;
        if (fa > a) {
          cr = Math.min(255, (fill[0] + (r - fill[0]) * tint) * shade);
          cg = Math.min(255, (fill[1] + (g - fill[1]) * tint) * shade);
          cb = Math.min(255, (fill[2] + (b - fill[2]) * tint) * shade);
          alpha = fa;
        }
      } else if (!fill && d > LINE_TO && d < GLOW_TO) {
        alpha = Math.max(alpha, 0.32 * (1 - (d - LINE_TO) / (GLOW_TO - LINE_TO)) ** 2);
      }
      if (alpha <= 0) continue;
      const o = i * 4;
      data[o] = cr;
      data[o + 1] = cg;
      data[o + 2] = cb;
      data[o + 3] = Math.round(alpha * 255);
    }
    lctx.putImageData(img, 0, 0);

    // Resplandor exterior: la capa se pinta una vez con sombra y otra encima, nítida.
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d')!;
    ctx.shadowColor = color;
    ctx.shadowBlur = RES * (style === 'solid' || style === 'brick' ? 1.6 : 2.4);
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
export function renderWalls(maze: Maze, color: string = COLORS.wall, look: WallLook = {}): HTMLCanvasElement {
  return new WallRenderer(maze).render(color, look);
}
