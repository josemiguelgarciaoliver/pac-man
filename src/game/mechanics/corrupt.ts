import { MAZE_TOP, TILE } from '../constants';
import { beltRuns, dotTiles, type TileXY } from '../level/placement';
import type { MechanicDef } from '../level/schema';
import type { Rng } from '../random';
import type { Mechanic, MechanicEnv } from './mechanic';

type CorruptDef = Extract<MechanicDef, { type: 'corrupt' }>;

/** El mando sigue "corrupto" este rato después de salir de la zona. */
const LINGER_SECONDS = 0.8;

/**
 * Zonas corruptas: tramos de suelo con datos dañados. Mientras Pac-Man está encima (y un instante
 * después) el mando se gira: lo que pulsas va a otro lado. Los fantasmas no les hacen caso.
 */
export class CorruptMechanic implements Mechanic {
  readonly kind = 'corrupt';
  private tiles = new Set<number>();
  private patches: TileXY[][] = [];
  private inside = false;

  constructor(def: CorruptDef, lines: readonly string[], rng: Rng) {
    for (const run of rng.shuffle(beltRuns(lines))) {
      if (this.patches.length >= def.count) break;
      const mid = Math.floor(run.tiles.length / 2);
      const patch = run.tiles.slice(Math.max(0, mid - 1), mid + 2);
      if (patch.some((t) => this.tiles.has(t.row * 100 + t.col))) continue;
      this.patches.push(patch);
      for (const t of patch) this.tiles.add(t.row * 100 + t.col);
    }
    // Laberintos sin tramos rectos: casillas sueltas.
    for (const t of rng.shuffle(dotTiles(lines))) {
      if (this.patches.length >= def.count) break;
      if (!this.tiles.has(t.row * 100 + t.col)) {
        this.patches.push([t]);
        this.tiles.add(t.row * 100 + t.col);
      }
    }
  }

  get tileList(): TileXY[] {
    return this.patches.flat();
  }

  get count(): number {
    return this.patches.length;
  }

  update(env: MechanicEnv): void {
    const on = this.tiles.has(env.pac.row * 100 + env.pac.col);
    if (on) {
      if (!this.inside) {
        env.sfx('poison');
        env.popup('DATOS CORRUPTOS', env.pac.x, env.pac.y - 10);
      }
      env.view.add('scramble', LINGER_SECONDS);
    }
    this.inside = on;
  }

  draw(ctx: CanvasRenderingContext2D, frame: number): void {
    for (const patch of this.patches) {
      for (const t of patch) {
        const x = t.col * TILE;
        const y = MAZE_TOP + t.row * TILE;
        // Bloques de color que parpadean sin orden, como una imagen corrupta.
        for (let i = 0; i < 4; i++) {
          const seed = Math.floor(frame / 5) * 7 + i * 13 + t.col * 3 + t.row;
          if (seed % 3 === 0) continue;
          ctx.fillStyle = seed % 2 ? 'rgba(255,63,210,0.55)' : 'rgba(63,240,255,0.55)';
          ctx.fillRect(x + (i % 2) * 4, y + Math.floor(i / 2) * 4, 4 - (seed % 2), 4 - ((seed >> 1) % 2));
        }
        if (Math.floor(frame / 9) % 4 === (t.col + t.row) % 4) {
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.fillRect(x, y + ((frame >> 1) % TILE), TILE, 1);
        }
      }
    }
  }
}
