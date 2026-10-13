import { MAZE_TOP, TICK_RATE } from '../constants';
import { pickSpread, type TileXY } from '../level/placement';
import type { MechanicDef } from '../level/schema';
import type { Rng } from '../random';
import { centerX, centerY, glow } from './geometry';
import type { Mechanic, MechanicEnv } from './mechanic';

type BoostDef = Extract<MechanicDef, { type: 'boost' }>;

/** Ticks hasta que unas zapatillas cogidas vuelven a aparecer (más que lo que dura el efecto). */
const REGROW_TICKS = 75 * TICK_RATE;

interface Bolt {
  tile: TileXY;
  /** Ticks hasta que vuelve a aparecer (0 = disponible). */
  regrow: number;
}

/**
 * Zapatillas rojas de supervelocidad: al cogerlas, Pac-Man corre a toda máquina durante un minuto
 * (con estela).
 * Es el único objeto de este tipo que ayuda, así que se reparte lejos de la salida y entre peligros.
 */
export class BoostMechanic implements Mechanic {
  readonly kind = 'boost';
  private bolts: Bolt[] = [];
  private readonly seconds: number;

  constructor(def: BoostDef, lines: readonly string[], rng: Rng, avoid: TileXY[] = []) {
    this.seconds = def.seconds;
    for (const tile of pickSpread(lines, def.count, rng, undefined, avoid)) this.bolts.push({ tile, regrow: 0 });
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
        // Si Pac-Man sigue encima cuando toca reaparecer, espera: no se recoge algo que no se ha visto aparecer.
        if (b.regrow === 1 && b.tile.col === pac.col && b.tile.row === pac.row) continue;
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
      const pulse = 0.9 + 0.1 * Math.sin(frame / 5);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(pulse, pulse);
      // Halo rojo.
      glow(ctx, '#ff3b30', 4);
      const halo = ctx.createRadialGradient(0, 0, 0.5, 0, 0, 7);
      halo.addColorStop(0, 'rgba(255,90,70,0.5)');
      halo.addColorStop(1, 'rgba(255,90,70,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      this.drawShoe(ctx);
      // Rayas de velocidad detrás de la zapatilla.
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 0.7;
      ctx.lineCap = 'round';
      const wag = Math.sin(frame / 3) * 0.6;
      for (const [dy, len] of [[-2.2, 2.6], [0.4, 3.4], [2.6, 2.2]] as const) {
        ctx.beginPath();
        ctx.moveTo(-6.2, dy + wag);
        ctx.lineTo(-6.2 - len, dy + wag);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /** Zapatilla roja de perfil: puntera a la derecha, suela blanca, cordones y una raya. */
  private drawShoe(ctx: CanvasRenderingContext2D): void {
    // Cuerpo rojo con degradado.
    const g = ctx.createLinearGradient(0, -5, 0, 4);
    g.addColorStop(0, '#ff6a5c');
    g.addColorStop(0.5, '#ee1c1c');
    g.addColorStop(1, '#9c0b0b');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-5.2, 3);
    ctx.lineTo(-5.2, -2.2);
    ctx.quadraticCurveTo(-5, -4.4, -2.8, -4.2); // talón y collarín
    ctx.lineTo(-1.2, -2.6);
    ctx.quadraticCurveTo(0.6, -0.8, 3, -0.2); // empeine
    ctx.quadraticCurveTo(6.2, 0.6, 6.4, 3);
    ctx.closePath();
    ctx.fill();
    // Suela blanca.
    ctx.fillStyle = '#f6f6f8';
    ctx.beginPath();
    ctx.roundRect(-5.6, 2.6, 12.4, 2.5, 1.2);
    ctx.fill();
    ctx.fillStyle = '#c8cbd6';
    ctx.fillRect(-5.2, 4.2, 11.6, 0.8);
    // Raya blanca lateral.
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-3.6, 1.8);
    ctx.quadraticCurveTo(0, 2.2, 2.8, -0.4);
    ctx.stroke();
    // Cordones.
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.6;
    for (const k of [0, 1, 2]) {
      ctx.beginPath();
      ctx.moveTo(-0.6 + k * 1.5, -1.6 + k * 0.45);
      ctx.lineTo(0.7 + k * 1.5, -2.2 + k * 0.45);
      ctx.stroke();
    }
  }
}
