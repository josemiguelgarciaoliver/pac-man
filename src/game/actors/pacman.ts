import { DIRS, Dir, TILE, opposite } from '../constants';
import type { Maze } from '../maze/maze';

/** Con este margen (px) antes/después del centro de la casilla se permite girar (cornering). */
const CORNER_WINDOW = 3;

/** Tolerancia (px) al comparar con el centro de una casilla (el redondeo no debe dejar pasar a Pac-Man). */
const EPS = 1e-6;

const approach = (v: number, target: number, step: number): number =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target);

export class PacMan {
  x: number;
  y: number;
  dir: Dir = Dir.Left;
  moving = true;
  /** Dirección pedida por el jugador (se conserva hasta poder girar). */
  want: Dir | null = null;
  /** Contador de animación: avanza solo cuando Pac-Man se mueve. */
  anim = 0;

  constructor(
    private readonly startX: number,
    private readonly startY: number,
  ) {
    this.x = startX;
    this.y = startY;
  }

  reset(): void {
    this.x = this.startX;
    this.y = this.startY;
    this.dir = Dir.Left;
    this.moving = true;
    this.want = null;
    this.anim = 0;
  }

  get col(): number {
    return Math.floor(this.x / TILE);
  }

  get row(): number {
    return Math.floor(this.y / TILE);
  }

  /** Avanza `dist` píxeles en pasos de 1 px para no saltarse el centro de las casillas. */
  move(maze: Maze, dist: number): void {
    while (dist > 0) {
      const step = Math.min(1, dist);
      dist -= step;
      this.step(maze, step);
    }
    if (this.moving) this.anim++;
  }

  private canEnter(maze: Maze, dir: Dir): boolean {
    const d = DIRS[dir];
    return maze.isWalkable(this.col + d.x, this.row + d.y);
  }

  private step(maze: Maze, step: number): void {
    const cx = this.col * TILE + TILE / 2;
    const cy = this.row * TILE + TILE / 2;

    if (this.want !== null && this.want !== this.dir) {
      if (this.want === opposite(this.dir)) {
        this.dir = this.want;
        this.moving = true;
      } else if (this.canEnter(maze, this.want)) {
        const horizontal = this.dir === Dir.Left || this.dir === Dir.Right;
        const off = horizontal ? this.x - cx : this.y - cy;
        if (!this.moving || Math.abs(off) <= CORNER_WINDOW) {
          this.dir = this.want;
          this.moving = true;
        }
      }
    }

    if (!this.moving) {
      if (!this.canEnter(maze, this.dir)) return;
      this.moving = true;
    }

    const d = DIRS[this.dir];
    const horizontal = d.x !== 0;
    const sign = d.x + d.y;
    // Distancia al centro de la casilla medida en el sentido de la marcha (>0: ya pasado).
    const o = (horizontal ? this.x - cx : this.y - cy) * sign;

    if (o + step > EPS && o <= EPS && !this.canEnter(maze, this.dir)) {
      if (horizontal) this.x = cx;
      else this.y = cy;
      this.moving = false;
      return;
    }

    if (horizontal) {
      this.x += d.x * step;
      this.y = approach(this.y, cy, step);
    } else {
      this.y += d.y * step;
      this.x = approach(this.x, cx, step);
    }

    // Túnel: aparece por el lado opuesto.
    const maxX = maze.cols * TILE + TILE / 2;
    if (this.x < -TILE / 2) this.x = maxX;
    else if (this.x > maxX) this.x = -TILE / 2;
  }
}
