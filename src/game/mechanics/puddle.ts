import type { Ghost } from '../actors/ghost';
import type { PacMan } from '../actors/pacman';
import { MAZE_TOP, TILE } from '../constants';
import { beltRuns, type TileXY } from '../level/placement';
import type { MechanicDef } from '../level/schema';
import type { Rng } from '../random';
import { TAU, centerX, centerY } from './geometry';
import type { Mechanic, MechanicEnv } from './mechanic';

type PuddleDef = Extract<MechanicDef, { type: 'puddle' }>;

/** Cuánto frena el barro a Pac-Man (multiplicador) y a los fantasmas (px/tick). */
const PAC_FACTOR = 0.38;
const GHOST_DELTA = -0.48;

/** Charcos de barro (arenas movedizas, resina, baba…): frenan a todos los que los cruzan. */
export class PuddleMechanic implements Mechanic {
  readonly kind = 'puddle';
  private tiles = new Set<number>();
  private patches: TileXY[][] = [];

  constructor(def: PuddleDef, lines: readonly string[], rng: Rng) {
    for (const run of rng.shuffle(beltRuns(lines))) {
      if (this.patches.length >= def.count) break;
      const mid = Math.floor(run.tiles.length / 2);
      const patch = run.tiles.slice(Math.max(0, mid - 1), mid + 2);
      if (patch.some((t) => this.tiles.has(t.row * 100 + t.col))) continue;
      this.patches.push(patch);
      for (const t of patch) this.tiles.add(t.row * 100 + t.col);
    }
  }

  get tileList(): TileXY[] {
    return this.patches.flat();
  }

  get count(): number {
    return this.patches.length;
  }

  private inside(x: number, y: number): boolean {
    return this.tiles.has(Math.floor(y / TILE) * 100 + Math.floor(x / TILE));
  }

  update(_env: MechanicEnv): void {
    /* pasivo */
  }

  pacSpeedFactor(pac: PacMan): number {
    return this.inside(pac.x, pac.y) ? PAC_FACTOR : 1;
  }

  ghostSpeedDelta(g: Ghost): number {
    return g.state === 'active' && this.inside(g.x, g.y) ? GHOST_DELTA : 0;
  }

  draw(ctx: CanvasRenderingContext2D, frame: number): void {
    for (const patch of this.patches) {
      for (const t of patch) {
        const x = centerX(t.col);
        const y = MAZE_TOP + centerY(t.row);
        const g = ctx.createRadialGradient(x, y, 0.5, x, y, TILE * 0.75);
        g.addColorStop(0, 'rgba(120,200,90,0.75)');
        g.addColorStop(1, 'rgba(60,120,50,0.15)');
        ctx.fillStyle = g;
        ctx.fillRect(t.col * TILE, MAZE_TOP + t.row * TILE, TILE, TILE);
        // Burbujas que suben y estallan.
        ctx.fillStyle = 'rgba(220,255,200,0.7)';
        for (let i = 0; i < 2; i++) {
          const p = ((frame * 0.03 + i * 0.5 + t.col * 0.17) % 1);
          ctx.beginPath();
          ctx.arc(x + (i === 0 ? -1.8 : 1.8), y + 2.4 - p * 4.8, 0.9 * (1 - p * 0.5), 0, TAU);
          ctx.fill();
        }
      }
    }
  }
}
