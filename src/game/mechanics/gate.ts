import { MAZE_TOP, TICK_RATE, TILE } from '../constants';
import { beltRuns, type TileXY } from '../level/placement';
import type { MechanicDef } from '../level/schema';
import type { Rng } from '../random';
import { centerX, centerY, glow } from './geometry';
import type { Mechanic, MechanicEnv } from './mechanic';

type GateDef = Extract<MechanicDef, { type: 'gate' }>;

/** Ticks de aviso antes de cerrar. */
const WARN = 50;
/** Ticks que tarda el bloque en deslizarse hasta cerrar el pasillo. */
const SLIDE = 16;
/** Un actor más cerca que esto (px) impide que la puerta cierre. */
const CLEARANCE = 26;

interface Gate {
  tile: TileXY;
  /** El pasillo es horizontal: la pieza entra desde arriba/abajo (si no, desde los lados). */
  horizontal: boolean;
  phase: 'open' | 'warn' | 'closed';
  /** Ticks que quedan en la fase actual. */
  ticks: number;
  /** Cuánto ha avanzado la pieza (0 abierto, 1 cerrado). */
  slide: number;
}

/**
 * Paredes móviles: bloques de piedra que se deslizan para cerrar un pasillo y vuelven a abrirlo.
 * Avisan parpadeando antes de cerrar y nunca lo hacen encima de nadie.
 */
export class GateMechanic implements Mechanic {
  readonly kind = 'gate';
  private gates: Gate[] = [];
  private readonly open: number;
  private readonly closed: number;

  constructor(
    def: GateDef,
    lines: readonly string[],
    rng: Rng,
  ) {
    this.open = Math.round(def.openSeconds * TICK_RATE);
    this.closed = Math.round(def.closedSeconds * TICK_RATE);
    const used: TileXY[] = [];
    for (const run of rng.shuffle(beltRuns(lines))) {
      if (this.gates.length >= def.count) break;
      const tile = run.tiles[Math.floor(run.tiles.length / 2)];
      if (used.some((u) => Math.abs(u.col - tile.col) + Math.abs(u.row - tile.row) < 5)) continue;
      used.push(tile);
      // Cada puerta empieza en un punto distinto del ciclo para que no cierren a la vez.
      const startOffset = Math.round(rng.float() * this.open * 0.6) + TICK_RATE * 2;
      this.gates.push({ tile, horizontal: run.horizontal, phase: 'open', ticks: this.open + startOffset, slide: 0 });
    }
  }

  get tiles(): TileXY[] {
    return this.gates.map((g) => g.tile);
  }

  get count(): number {
    return this.gates.length;
  }

  private occupied(g: Gate, env: MechanicEnv): boolean {
    const x = centerX(g.tile.col);
    const y = centerY(g.tile.row);
    if (Math.hypot(env.pac.x - x, env.pac.y - y) < CLEARANCE) return true;
    return env.ghosts.some((gh) => gh.state !== 'house' && Math.hypot(gh.x - x, gh.y - y) < CLEARANCE);
  }

  update(env: MechanicEnv): void {
    for (const g of this.gates) {
      if (g.phase === 'open') {
        if (--g.ticks <= WARN) {
          g.phase = 'warn';
          g.ticks = WARN;
          env.sfx('tick');
        }
      } else if (g.phase === 'warn') {
        // Si hay alguien encima se espera, con la advertencia parpadeando.
        if (this.occupied(g, env)) {
          g.ticks = WARN;
          continue;
        }
        if (--g.ticks <= 0) {
          g.phase = 'closed';
          g.ticks = this.closed;
          env.maze.setBlocked(g.tile.col, g.tile.row, true);
          env.sfx('gate');
        }
      } else if (--g.ticks <= 0) {
        g.phase = 'open';
        g.ticks = this.open;
        env.maze.setBlocked(g.tile.col, g.tile.row, false);
        env.sfx('gate');
      }
      const target = g.phase === 'closed' ? 1 : 0;
      g.slide += Math.sign(target - g.slide) * Math.min(Math.abs(target - g.slide), 1 / SLIDE);
    }
  }

  onRespawn(env: MechanicEnv): void {
    for (const g of this.gates) {
      env.maze.setBlocked(g.tile.col, g.tile.row, false);
      g.phase = 'open';
      g.ticks = this.open + TICK_RATE * 3;
      g.slide = 0;
    }
  }

  draw(ctx: CanvasRenderingContext2D, frame: number): void {
    for (const g of this.gates) {
      const x = g.tile.col * TILE;
      const y = MAZE_TOP + g.tile.row * TILE;
      const warn = g.phase === 'warn';
      const flicker = warn && Math.floor(frame / 4) % 2 === 0;
      ctx.save();
      // Raíles en las paredes a ambos lados del pasillo.
      ctx.fillStyle = 'rgba(180,190,220,0.35)';
      if (g.horizontal) {
        ctx.fillRect(x + 1, y - 1.5, TILE - 2, 1.5);
        ctx.fillRect(x + 1, y + TILE, TILE - 2, 1.5);
      } else {
        ctx.fillRect(x - 1.5, y + 1, 1.5, TILE - 2);
        ctx.fillRect(x + TILE, y + 1, 1.5, TILE - 2);
      }
      if (warn) {
        ctx.fillStyle = flicker ? 'rgba(255,200,40,0.35)' : 'rgba(255,200,40,0.1)';
        ctx.fillRect(x, y, TILE, TILE);
      }
      if (g.slide > 0.02) {
        // Bloque de piedra que entra desde los dos lados del pasillo.
        const half = (TILE / 2) * g.slide;
        glow(ctx, '#8a8fb5', 2);
        const grad = ctx.createLinearGradient(x, y, x + TILE, y + TILE);
        grad.addColorStop(0, '#9aa0c4');
        grad.addColorStop(1, '#4c5273');
        ctx.fillStyle = grad;
        if (g.horizontal) {
          ctx.fillRect(x, y, TILE, half);
          ctx.fillRect(x, y + TILE - half, TILE, half);
        } else {
          ctx.fillRect(x, y, half, TILE);
          ctx.fillRect(x + TILE - half, y, half, TILE);
        }
        ctx.shadowBlur = 0;
        if (g.slide > 0.95) {
          ctx.strokeStyle = 'rgba(20,22,40,0.7)';
          ctx.lineWidth = 0.6;
          ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
        }
      }
      ctx.restore();
    }
  }
}
