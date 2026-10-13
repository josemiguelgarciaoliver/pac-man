import { MAZE_TOP, TICK_RATE } from '../constants';
import { pickSpread, type TileXY } from '../level/placement';
import type { MechanicDef } from '../level/schema';
import type { Rng } from '../random';
import { TAU, centerX, centerY, glow } from './geometry';
import type { Mechanic, MechanicEnv } from './mechanic';

type CloakDef = Extract<MechanicDef, { type: 'cloak' }>;

/** Ticks hasta que un manto cogido vuelve a aparecer (bastante más que lo que dura). */
const REGROW_TICKS = 60 * TICK_RATE;

interface Cloak {
  tile: TileXY;
  regrow: number;
}

/**
 * Manto glitch: al cogerlo, Pac-Man se vuelve invisible unos segundos. Los fantasmas lo pierden de
 * vista y se van a sus esquinas en vez de perseguirlo (aunque si lo tocan, lo matan).
 */
export class CloakMechanic implements Mechanic {
  readonly kind = 'cloak';
  private cloaks: Cloak[] = [];
  private readonly seconds: number;

  constructor(def: CloakDef, lines: readonly string[], rng: Rng, avoid: TileXY[] = []) {
    this.seconds = def.seconds;
    for (const tile of pickSpread(lines, def.count, rng, undefined, avoid)) this.cloaks.push({ tile, regrow: 0 });
  }

  get tiles(): TileXY[] {
    return this.cloaks.map((c) => c.tile);
  }

  get count(): number {
    return this.cloaks.length;
  }

  update(env: MechanicEnv): void {
    const pac = env.pac;
    for (const c of this.cloaks) {
      if (c.regrow > 0) {
        // Si Pac-Man sigue encima cuando toca reaparecer, espera: no se recoge algo que no se ha visto aparecer.
        if (c.regrow === 1 && c.tile.col === pac.col && c.tile.row === pac.row) continue;
        c.regrow--;
        continue;
      }
      if (c.tile.col !== pac.col || c.tile.row !== pac.row) continue;
      c.regrow = REGROW_TICKS;
      env.view.add('invisible', this.seconds);
      env.sfx('collect');
      env.popup('INVISIBLE', pac.x, pac.y - 10);
    }
  }

  draw(): void {
    /* se dibuja sobre los puntos */
  }

  drawOver(ctx: CanvasRenderingContext2D, frame: number): void {
    for (const c of this.cloaks) {
      if (c.regrow > 0) continue;
      const x = centerX(c.tile.col);
      const y = MAZE_TOP + centerY(c.tile.row) + Math.sin(frame / 9 + c.tile.col) * 0.8;
      // Parpadeo "corrupto": a ratos se desplaza o desaparece una franja.
      const glitch = Math.floor(frame / 7) % 5 === 0;
      ctx.save();
      ctx.translate(x + (glitch ? 1.2 : 0), y);
      glow(ctx, '#b8f0ff', 4);
      // Capa/fantasma translúcido con el borde inferior en picos.
      ctx.fillStyle = 'rgba(184,240,255,0.55)';
      ctx.beginPath();
      ctx.arc(0, -1, 4.4, Math.PI, 0);
      ctx.lineTo(4.4, 4.2);
      for (let i = 0; i < 4; i++) ctx.lineTo(3.3 - i * 2.2, i % 2 === 0 ? 2.4 : 4.4);
      ctx.lineTo(-4.4, 4.2);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      // Ojos de pixel.
      ctx.fillStyle = '#0d1b2a';
      ctx.fillRect(-2.4, -2, 1.5, 1.5);
      ctx.fillRect(1, -2, 1.5, 1.5);
      // Franjas de interferencia.
      ctx.fillStyle = 'rgba(255,60,200,0.55)';
      ctx.fillRect(-5.5, ((frame / 3) % 9) - 4, 11, 0.9);
      ctx.strokeStyle = 'rgba(184,240,255,0.5)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, 7 + Math.sin(frame / 8), 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }
}
