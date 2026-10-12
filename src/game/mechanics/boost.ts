import { MAZE_TOP, TICK_RATE } from '../constants';
import { pickSpread, type TileXY } from '../level/placement';
import type { MechanicDef } from '../level/schema';
import type { Rng } from '../random';
import { centerX, centerY, glow } from './geometry';
import type { Mechanic, MechanicEnv } from './mechanic';

type BoostDef = Extract<MechanicDef, { type: 'boost' }>;

/** Ticks hasta que un rayo cogido vuelve a aparecer. */
const REGROW_TICKS = 20 * TICK_RATE;

interface Bolt {
  tile: TileXY;
  /** Ticks hasta que vuelve a aparecer (0 = disponible). */
  regrow: number;
}

/**
 * Rayo de supervelocidad: al cogerlo, Pac-Man corre a toda máquina unos segundos (con estela).
 * Es el único objeto de este tipo que ayuda, así que se reparte lejos de la salida y entre peligros.
 */
export class BoostMechanic implements Mechanic {
  readonly kind = 'boost';
  private bolts: Bolt[] = [];
  private readonly seconds: number;

  constructor(def: BoostDef, lines: readonly string[], rng: Rng) {
    this.seconds = def.seconds;
    for (const tile of pickSpread(lines, def.count, rng)) this.bolts.push({ tile, regrow: 0 });
  }

  get tiles(): TileXY[] {
    return this.bolts.map((b) => b.tile);
  }

  get count(): number {
    return this.bolts.length;
  }

  update(env: MechanicEnv): void {
    const pac = env.pac;
    for (const b of this.bolts) {
      if (b.regrow > 0) {
        b.regrow--;
        continue;
      }
      if (b.tile.col !== pac.col || b.tile.row !== pac.row) continue;
      b.regrow = REGROW_TICKS;
      env.view.add('boost', this.seconds);
      env.sfx('boost');
      env.popup('SUPERVELOCIDAD', pac.x, pac.y - 10);
    }
  }

  draw(): void {
    /* el rayo se dibuja sobre los puntos */
  }

  drawOver(ctx: CanvasRenderingContext2D, frame: number): void {
    for (const b of this.bolts) {
      if (b.regrow > 0) continue;
      const x = centerX(b.tile.col);
      const y = MAZE_TOP + centerY(b.tile.row) + Math.sin(frame / 9 + b.tile.col) * 0.8;
      const pulse = 0.85 + 0.15 * Math.sin(frame / 5);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(pulse, pulse);
      glow(ctx, '#ffe94a', 4);
      // Halo.
      const halo = ctx.createRadialGradient(0, 0, 0.5, 0, 0, 6.5);
      halo.addColorStop(0, 'rgba(255,240,120,0.55)');
      halo.addColorStop(1, 'rgba(255,240,120,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
      ctx.fill();
      // Rayo.
      const g = ctx.createLinearGradient(0, -6, 0, 6);
      g.addColorStop(0, '#fffbd0');
      g.addColorStop(1, '#ffb800');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(1.6, -6);
      ctx.lineTo(-3.4, 0.8);
      ctx.lineTo(-0.4, 0.8);
      ctx.lineTo(-1.8, 6);
      ctx.lineTo(3.6, -1.4);
      ctx.lineTo(0.4, -1.4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}
