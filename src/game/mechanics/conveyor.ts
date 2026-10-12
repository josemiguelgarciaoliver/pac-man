import type { Ghost } from '../actors/ghost';
import { DIRS, Dir, MAZE_TOP, TICK_RATE, TILE, opposite } from '../constants';
import { beltRuns, type BeltRun, type TileXY } from '../level/placement';
import type { MechanicDef } from '../level/schema';
import type { Rng } from '../random';
import { drift } from './drift';
import type { Mechanic, MechanicEnv } from './mechanic';

type ConveyorDef = Extract<MechanicDef, { type: 'conveyor' }>;

/** Ticks antes de invertirse en los que las flechas parpadean. */
const WARNING_TICKS = TICK_RATE;

interface Belt {
  tiles: TileXY[];
  dir: Dir;
}

export class ConveyorMechanic implements Mechanic {
  readonly kind = 'conveyor';
  private belts: Belt[] = [];
  private byTile = new Map<number, Belt>();
  private ticks = 0;

  constructor(
    private readonly def: ConveyorDef,
    lines: readonly string[],
    rng: Rng,
  ) {
    const runs = rng.shuffle(beltRuns(lines));
    const chosen: BeltRun[] = [];
    for (const run of runs) {
      if (chosen.length >= def.segments) break;
      // Tramos separados: ninguna casilla de uno pegada a otro.
      const clash = chosen.some((o) => o.tiles.some((a) => run.tiles.some((b) => Math.abs(a.col - b.col) + Math.abs(a.row - b.row) < 2)));
      if (!clash) chosen.push(run);
    }
    // En "cadena" los sentidos alternan siguiendo el orden de arriba abajo.
    const ordered = def.chain ? [...chosen].sort((a, b) => a.tiles[0].row - b.tiles[0].row || a.tiles[0].col - b.tiles[0].col) : chosen;
    ordered.forEach((run, i) => {
      const forward = def.chain ? i % 2 === 0 : rng.chance(0.5);
      const dir = run.horizontal ? (forward ? Dir.Right : Dir.Left) : forward ? Dir.Down : Dir.Up;
      const belt = { tiles: run.tiles, dir };
      this.belts.push(belt);
      for (const t of run.tiles) this.byTile.set(t.row * 100 + t.col, belt);
    });
  }

  get count(): number {
    return this.belts.length;
  }

  private beltAt(x: number, y: number): Belt | undefined {
    return this.byTile.get(Math.floor(y / TILE) * 100 + Math.floor(x / TILE));
  }

  update(env: MechanicEnv): void {
    this.ticks++;
    const every = this.def.reverseEvery;
    if (every && this.ticks % (every * TICK_RATE) === 0) for (const b of this.belts) b.dir = opposite(b.dir);

    const pacBelt = this.beltAt(env.pac.x, env.pac.y);
    if (pacBelt) drift(env.pac, env.maze, pacBelt.dir, this.def.speed);
  }

  ghostSpeedDelta(g: Ghost): number {
    if (!this.def.ghosts || g.state !== 'active') return 0;
    const belt = this.beltAt(g.x, g.y);
    if (!belt) return 0;
    if (belt.dir === g.dir) return this.def.speed;
    return belt.dir === opposite(g.dir) ? -this.def.speed : 0;
  }

  /** ¿Está a punto de invertirse el sentido? */
  private warning(): boolean {
    const every = this.def.reverseEvery;
    if (!every) return false;
    const period = every * TICK_RATE;
    return period - (this.ticks % period) <= WARNING_TICKS;
  }

  draw(ctx: CanvasRenderingContext2D, frame: number): void {
    const blink = this.warning() && Math.floor(frame / 6) % 2 === 0;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const belt of this.belts) {
      const d = DIRS[belt.dir];
      for (const t of belt.tiles) {
        const x = t.col * TILE;
        const y = MAZE_TOP + t.row * TILE;
        ctx.fillStyle = blink ? 'rgba(255,80,60,0.28)' : 'rgba(255,154,61,0.16)';
        ctx.fillRect(x, y, TILE, TILE);
        // Dos chevrones por casilla que avanzan con el sentido de la cinta.
        ctx.strokeStyle = blink ? '#ff5a3c' : '#ff9a3d';
        ctx.lineWidth = 0.9;
        for (let k = 0; k < 2; k++) {
          const p = ((frame * this.def.speed * 0.5 + k * 4) % TILE) - TILE / 2;
          const cx = x + TILE / 2 + d.x * p;
          const cy = y + TILE / 2 + d.y * p;
          ctx.beginPath();
          ctx.moveTo(cx - d.x * 1.6 + d.y * 2.4, cy - d.y * 1.6 + d.x * 2.4);
          ctx.lineTo(cx + d.x * 1.6, cy + d.y * 1.6);
          ctx.lineTo(cx - d.x * 1.6 - d.y * 2.4, cy - d.y * 1.6 - d.x * 2.4);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }
}
