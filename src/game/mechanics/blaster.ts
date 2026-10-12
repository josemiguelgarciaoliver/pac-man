import { MAZE_TOP, TICK_RATE } from '../constants';
import { pickSpread, type TileXY } from '../level/placement';
import type { MechanicDef } from '../level/schema';
import type { Rng } from '../random';
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
 * Blaster: al cogerlo, Pac-Man puede disparar durante un minuto (Espacio, botón FUEGO o botón B
 * del mando). Cada disparo viaja en línea recta y convierte en ojos al primer fantasma que alcanza.
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
      env.sfx('summon');
      env.popup('DISPARA CON ESPACIO', pac.x, pac.y - 10);
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
      this.drawGun(ctx);
      ctx.restore();
    }
  }

  /** Pistola de rayos: cuerpo plateado, cañón naranja y un cristal de energía. */
  private drawGun(ctx: CanvasRenderingContext2D): void {
    ctx.shadowBlur = 0;
    // Empuñadura.
    ctx.fillStyle = '#6b4a3a';
    ctx.beginPath();
    ctx.roundRect(-3.4, -0.4, 3, 5.2, 0.9);
    ctx.fill();
    // Cuerpo.
    const g = ctx.createLinearGradient(0, -4, 0, 2);
    g.addColorStop(0, '#f2f4ff');
    g.addColorStop(1, '#8b93ad');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(-5, -3.8, 8.6, 4.4, 1.2);
    ctx.fill();
    // Cañón.
    ctx.fillStyle = '#ff7a45';
    ctx.beginPath();
    ctx.roundRect(3.2, -2.9, 3.6, 2.6, 0.8);
    ctx.fill();
    // Cristal de energía.
    ctx.fillStyle = '#8affff';
    ctx.beginPath();
    ctx.arc(-1.2, -1.6, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
}
