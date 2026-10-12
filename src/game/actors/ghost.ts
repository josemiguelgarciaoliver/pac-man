import { DIRS, Dir, TILE, opposite } from '../constants';
import type { Maze } from '../maze/maze';
import type { Rng } from '../random';
import type { GhostName, Tile } from './ai';

/**
 * house: rebotando dentro de la casa · leaving: saliendo por la puerta · active: moviéndose por el laberinto
 * eaten: ojos volviendo a casa · entering: ojos bajando por la puerta.
 */
export type GhostState = 'house' | 'leaving' | 'active' | 'eaten' | 'entering';

export const HOUSE_X = 112;
export const HOUSE_Y = 14 * TILE + 4;
export const EXIT_Y = 11 * TILE + 4;
const BOB = 4;
const BOB_SPEED = 0.5;

const START: Record<GhostName, { x: number; y: number }> = {
  blinky: { x: HOUSE_X, y: EXIT_Y },
  pinky: { x: HOUSE_X, y: HOUSE_Y },
  inky: { x: HOUSE_X - 16, y: HOUSE_Y },
  clyde: { x: HOUSE_X + 16, y: HOUSE_Y },
};

/** Cruces donde los fantasmas no pueden girar hacia arriba (salvo asustados o ojos). */
const NO_UP: Tile[] = [
  { col: 12, row: 11 },
  { col: 15, row: 11 },
  { col: 12, row: 23 },
  { col: 15, row: 23 },
];

const PRIORITY = [Dir.Up, Dir.Left, Dir.Down, Dir.Right];

export interface MoveEnv {
  maze: Maze;
  /** Casilla objetivo (ignorada si el fantasma está asustado). */
  target: Tile;
  rng: Rng;
  /** Velocidad de salida/entrada de la casa y rebote, px por tick. */
  houseSpeed: number;
}

export class Ghost {
  x = 0;
  y = 0;
  dir: Dir = Dir.Left;
  nextDir: Dir = Dir.Left;
  state: GhostState = 'house';
  frightened = false;
  /** Nivel de Cruise Elroy (solo Blinky). */
  elroy = 0;
  anim = 0;
  private reversePending = false;
  private bobDir = 1;

  constructor(readonly name: GhostName) {
    this.reset();
  }

  get col(): number {
    return Math.floor(this.x / TILE);
  }

  get row(): number {
    return Math.floor(this.y / TILE);
  }

  reset(): void {
    const s = START[this.name];
    this.x = s.x;
    this.y = s.y;
    this.frightened = false;
    this.elroy = 0;
    this.anim = 0;
    this.reversePending = false;
    this.bobDir = this.name === 'inky' ? 1 : -1;
    if (this.name === 'blinky') {
      this.state = 'active';
      this.dir = Dir.Left;
    } else {
      this.state = 'house';
      this.dir = this.name === 'pinky' ? Dir.Down : Dir.Up;
    }
  }

  /** Solicita dar la vuelta al llegar a la siguiente casilla (cambio de modo o power pellet). */
  requestReverse(): void {
    if (this.state === 'active') this.reversePending = true;
  }

  /** Primer rumbo tras salir de la casa, calculado como lo haría el arcade. */
  initNav(env: MoveEnv): void {
    this.dir = Dir.Left;
    this.nextDir = this.chooseNext(env, 13, 11, Dir.Left);
  }

  move(env: MoveEnv, speed: number): void {
    this.anim++;
    switch (this.state) {
      case 'house':
        this.bob(env.houseSpeed);
        break;
      case 'leaving':
        this.leave(env, env.houseSpeed);
        break;
      case 'entering':
        this.enter(speed);
        break;
      default:
        while (speed > 0) {
          const step = Math.min(1, speed);
          speed -= step;
          this.navStep(env, step);
          if ((this.state as GhostState) === 'entering') break;
        }
    }
  }

  private bob(speed: number): void {
    this.y += this.bobDir * Math.min(speed, BOB_SPEED);
    if (this.y > HOUSE_Y + BOB) {
      this.y = HOUSE_Y + BOB;
      this.bobDir = -1;
    } else if (this.y < HOUSE_Y - BOB) {
      this.y = HOUSE_Y - BOB;
      this.bobDir = 1;
    }
    this.dir = this.bobDir < 0 ? Dir.Up : Dir.Down;
  }

  private leave(env: MoveEnv, speed: number): void {
    if (this.x !== HOUSE_X) {
      this.x += Math.sign(HOUSE_X - this.x) * Math.min(speed, Math.abs(HOUSE_X - this.x));
      this.dir = this.x < HOUSE_X ? Dir.Right : Dir.Left;
      return;
    }
    this.dir = Dir.Up;
    this.y -= speed;
    if (this.y <= EXIT_Y) {
      this.y = EXIT_Y;
      this.state = 'active';
      this.initNav(env);
    }
  }

  private enter(speed: number): void {
    if (this.x !== HOUSE_X) {
      this.x += Math.sign(HOUSE_X - this.x) * Math.min(speed, Math.abs(HOUSE_X - this.x));
      return;
    }
    this.dir = Dir.Down;
    this.y += speed;
    if (this.y >= HOUSE_Y) {
      this.y = HOUSE_Y;
      this.state = 'leaving';
      this.frightened = false;
    }
  }

  private navStep(env: MoveEnv, step: number): void {
    const d = DIRS[this.dir];
    const horizontal = d.x !== 0;
    const sign = d.x + d.y;
    const cx = this.col * TILE + TILE / 2;
    const cy = this.row * TILE + TILE / 2;
    const o = (horizontal ? this.x - cx : this.y - cy) * sign;

    if (o < 0 && o + step >= 0) {
      // Llega al centro de la casilla: decide el rumbo y gasta el resto del paso en él.
      const rest = step + o;
      this.x = cx;
      this.y = cy;
      this.arrive(env);
      if (this.state === 'entering') return;
      this.translate(rest, env.maze);
      return;
    }
    this.translate(step, env.maze);
  }

  private translate(dist: number, maze: Maze): void {
    const d = DIRS[this.dir];
    this.x += d.x * dist;
    this.y += d.y * dist;
    const maxX = maze.cols * TILE + TILE / 2;
    if (this.x < -TILE / 2) this.x = maxX;
    else if (this.x > maxX) this.x = -TILE / 2;
  }

  private arrive(env: MoveEnv): void {
    const col = this.col;
    const row = this.row;
    if (this.state === 'eaten' && row === 11 && (col === 13 || col === 14)) {
      this.state = 'entering';
      return;
    }
    if (this.reversePending) {
      this.dir = opposite(this.dir);
      this.reversePending = false;
    } else {
      this.dir = this.nextDir;
    }
    const d = DIRS[this.dir];
    this.nextDir = this.chooseNext(env, col + d.x, row + d.y, this.dir);
  }

  /** Elige la salida de la casilla (col,row): la que deja más cerca del objetivo, sin dar la vuelta. */
  private chooseNext(env: MoveEnv, col: number, row: number, arrivalDir: Dir): Dir {
    const options: Dir[] = [];
    const free = this.frightened || this.state === 'eaten';
    for (const dir of PRIORITY) {
      if (dir === opposite(arrivalDir)) continue;
      const d = DIRS[dir];
      if (!env.maze.isWalkable(col + d.x, row + d.y)) continue;
      if (dir === Dir.Up && !free && NO_UP.some((t) => t.col === col && t.row === row)) continue;
      options.push(dir);
    }
    if (options.length === 0) return opposite(arrivalDir);
    if (this.frightened && this.state === 'active') return options[env.rng.int(options.length)];

    let best = options[0];
    let bestDist = Infinity;
    for (const dir of options) {
      const d = DIRS[dir];
      const dx = col + d.x - env.target.col;
      const dy = row + d.y - env.target.row;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = dir;
      }
    }
    return best;
  }
}
