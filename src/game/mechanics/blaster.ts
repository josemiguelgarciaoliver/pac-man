import { MAZE_TOP, TICK_RATE } from '../constants';
import { pickSpread, type TileXY } from '../level/placement';
import type { MechanicDef } from '../level/schema';
import type { Rng } from '../random';
import { Dir } from '../constants';
import { drawPistol } from '../sprites';
import { centerX, centerY, glow } from './geometry';
import type { Mechanic, MechanicEnv } from './mechanic';

type BlasterDef = Extract<MechanicDef, { type: 'blaster' }>;

/** Ticks hasta que un blaster cogido vuelve a aparecer (más que lo que dura el efecto). */
const REGROW_TICKS = 80 * TICK_RATE;

interface Pickup {
  tile: TileXY;
  regrow: number;
}

/**
 * Pistola: al cogerla, Pac-Man la lleva en la mano y puede disparar durante un minuto (Espacio, botón
 * FUEGO o botón B del mando). Cada disparo viaja en línea recta y convierte en ojos al primer fantasma que alcanza.
 */
export class BlasterMechanic implements Mechanic {
  readonly kind = 'blaster';
  private pickups: Pickup[] = [];
  private readonly seconds: number;

  constructor(def: BlasterDef, lines: readonly string[], rng: Rng) {
    this.seconds = def.seconds;
    for (const tile of pickSpread(lines, def.count, rng)) this.pickups.push({ tile, regrow: 0 });
  }

  get tiles(): TileXY[] {
    return this.pickups.map((p) => p.tile);
  }

  get count(): number {
    return this.pickups.length;
  }

  update(env: MechanicEnv): void {
    const pac = env.pac;
    for (const p of this.pickups) {
      if (p.regrow > 0) {
        p.regrow--;
        continue;
      }
      if (p.tile.col !== pac.col || p.tile.row !== pac.row) continue;
      p.regrow = REGROW_TICKS;
      env.view.add('gun', this.seconds);
      env.sfx('gun');
      env.popup('PISTOLA: DISPARA CON ESPACIO', pac.x, pac.y - 10);
    }
  }

  draw(): void {
    /* se dibuja sobre los puntos */
  }

  drawOver(ctx: CanvasRenderingContext2D, frame: number): void {
    for (const p of this.pickups) {
      if (p.regrow > 0) continue;
      const x = centerX(p.tile.col);
      const y = MAZE_TOP + centerY(p.tile.row) + Math.sin(frame / 9 + p.tile.col) * 0.8;
      ctx.save();
      ctx.translate(x, y);
      glow(ctx, '#ff7a45', 4);
      const halo = ctx.createRadialGradient(0, 0, 0.5, 0, 0, 7);
      halo.addColorStop(0, 'rgba(255,140,70,0.45)');
      halo.addColorStop(1, 'rgba(255,140,70,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.scale(1.15, 1.15);
      drawPistol(ctx, -0.8, 0.4, Dir.Right);
      ctx.restore();
    }
  }
}
