import type { PacMan } from '../actors/pacman';
import { MAZE_TOP, TICK_RATE, TILE } from '../constants';
import { beltRuns, type TileXY } from '../level/placement';
import type { MechanicDef } from '../level/schema';
import type { Rng } from '../random';
import { centerX, centerY } from './geometry';
import type { Mechanic, MechanicEnv } from './mechanic';

type SpikesDef = Extract<MechanicDef, { type: 'spikes' }>;

/** Ticks de aviso (placa parpadeando) y ticks con los pinchos fuera. */
const WARN = 48;
const UP = 66;
/** Pac-Man muere si está así de cerca (px) del centro de la casilla con los pinchos fuera. */
const HIT_DISTANCE = 5.4;

interface Trap {
  tile: TileXY;
  /** Posición en el ciclo (0 .. period). */
  t: number;
  startT: number;
}

/** Pinchos que salen del suelo con ritmo: la placa avisa y, tras un instante, saltan. */
export class SpikesMechanic implements Mechanic {
  readonly kind = 'spikes';
  private traps: Trap[] = [];
  private readonly period: number;

  constructor(def: SpikesDef, lines: readonly string[], rng: Rng) {
    this.period = Math.round(def.periodSeconds * TICK_RATE);
    const used: TileXY[] = [];
    // Casillas sueltas de tramos rectos: se evita amontonarlas y la zona de salida de Pac-Man.
    const candidates = rng.shuffle(beltRuns(lines).flatMap((r) => r.tiles));
    for (const tile of candidates) {
      if (this.traps.length >= def.count) break;
      if (used.some((u) => Math.abs(u.col - tile.col) + Math.abs(u.row - tile.row) < 4)) continue;
      used.push(tile);
      const startT = Math.round((this.traps.length / def.count) * this.period * 0.9);
      this.traps.push({ tile, t: startT, startT });
    }
  }

  get tiles(): TileXY[] {
    return this.traps.map((t) => t.tile);
  }

  get count(): number {
    return this.traps.length;
  }

  /** 'safe' | 'warn' | 'up' según el punto del ciclo. */
  private phase(t: Trap): 'safe' | 'warn' | 'up' {
    const safe = this.period - WARN - UP;
    if (t.t < safe) return 'safe';
    return t.t < safe + WARN ? 'warn' : 'up';
  }

  update(env: MechanicEnv): void {
    for (const t of this.traps) {
      const before = this.phase(t);
      t.t = (t.t + 1) % this.period;
      const after = this.phase(t);
      if (before !== after && after === 'up') env.sfx('spike');
    }
  }

  hitsPac(pac: PacMan): boolean {
    return this.traps.some((t) => this.phase(t) === 'up' && Math.hypot(centerX(t.tile.col) - pac.x, centerY(t.tile.row) - pac.y) < HIT_DISTANCE);
  }

  onRespawn(): void {
    for (const t of this.traps) t.t = Math.min(t.startT, this.period - WARN - UP - TICK_RATE);
  }

  draw(ctx: CanvasRenderingContext2D, frame: number): void {
    for (const t of this.traps) {
      const phase = this.phase(t);
      const x = t.tile.col * TILE;
      const y = MAZE_TOP + t.tile.row * TILE;
      ctx.save();
      // Placa con agujeros.
      const warn = phase === 'warn' && Math.floor(frame / 4) % 2 === 0;
      ctx.fillStyle = warn ? 'rgba(255,200,40,0.55)' : 'rgba(150,158,190,0.28)';
      ctx.beginPath();
      ctx.roundRect(x + 0.8, y + 0.8, TILE - 1.6, TILE - 1.6, 1.2);
      ctx.fill();
      ctx.fillStyle = 'rgba(10,12,30,0.8)';
      for (const [dx, dy] of [[2.3, 2.3], [5.7, 2.3], [2.3, 5.7], [5.7, 5.7]]) {
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
      if (phase === 'up') {
        // Pinchos: cuatro puntas metálicas que suben de golpe.
        const rise = Math.min(1, (t.t - (this.period - UP)) / 6);
        ctx.fillStyle = '#e8ecff';
        for (const [dx, dy] of [[2.3, 2.3], [5.7, 2.3], [2.3, 5.7], [5.7, 5.7]]) {
          const h = 3.6 * rise;
          ctx.beginPath();
          ctx.moveTo(x + dx - 1, y + dy + 1);
          ctx.lineTo(x + dx, y + dy + 1 - h - 1);
          ctx.lineTo(x + dx + 1, y + dy + 1);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }
}
