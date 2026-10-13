import { HOUSE_X, HOUSE_Y, REVIVE_TICKS } from '../actors/ghost';
import { MAZE_TOP, SCREEN_W, TICK_RATE } from '../constants';
import { pickSpread, type TileXY } from '../level/placement';
import type { MechanicDef } from '../level/schema';
import type { Rng } from '../random';
import { TAU, centerX, centerY, glow } from './geometry';
import type { Mechanic, MechanicEnv } from './mechanic';

type AnkhDef = Extract<MechanicDef, { type: 'ankh' }>;

/** Ticks hasta que un Anj cogido vuelve a aparecer. */
const REGROW_TICKS = 60 * TICK_RATE;
/** Duración de la onda dorada (ticks). */
const WAVE_TICKS = 60;

interface Item {
  tile: TileXY;
  regrow: number;
}

/**
 * Anj (☥), el símbolo egipcio de la vida: al cogerlo, una onda dorada **destruye a todos los
 * fantasmas**. Los que andan por el laberinto se convierten en ojos y vuelven a casa; los que aún
 * estaban en la casa o saliendo de ella se quedan allí regenerándose.
 */
export class AnkhMechanic implements Mechanic {
  readonly kind = 'ankh';
  private items: Item[] = [];
  private wave: { x: number; y: number; ticks: number } | null = null;

  constructor(def: AnkhDef, lines: readonly string[], rng: Rng) {
    for (const tile of pickSpread(lines, def.count, rng)) this.items.push({ tile, regrow: 0 });
  }

  get tiles(): TileXY[] {
    return this.items.map((i) => i.tile);
  }

  get count(): number {
    return this.items.length;
  }

  update(env: MechanicEnv): void {
    if (this.wave && --this.wave.ticks <= 0) this.wave = null;
    const pac = env.pac;
    for (const it of this.items) {
      if (it.regrow > 0) {
        it.regrow--;
        continue;
      }
      if (it.tile.col !== pac.col || it.tile.row !== pac.row) continue;
      it.regrow = REGROW_TICKS;
      this.destroyAll(env);
      this.wave = { x: pac.x, y: pac.y, ticks: WAVE_TICKS };
      env.sfx('ankh');
      env.popup('ANJ: FANTASMAS DESTRUIDOS', pac.x, pac.y - 10);
    }
  }

  private destroyAll(env: MechanicEnv): void {
    for (const g of env.ghosts) {
      if (g.state === 'active') {
        env.killGhost(g);
      } else if (g.state === 'house' || g.state === 'leaving') {
        // Dentro de la casa se "regeneran" un rato en lugar de salir por su cuenta.
        g.state = 'house';
        g.x = HOUSE_X;
        g.y = HOUSE_Y;
        g.frightened = false;
        g.reviveTicks = REVIVE_TICKS;
      }
    }
  }

  draw(): void {
    /* se dibuja sobre los puntos */
  }

  drawOver(ctx: CanvasRenderingContext2D, frame: number): void {
    for (const it of this.items) {
      if (it.regrow > 0) continue;
      this.drawAnkh(ctx, centerX(it.tile.col), MAZE_TOP + centerY(it.tile.row) + Math.sin(frame / 10 + it.tile.col) * 0.7, frame);
    }
    if (this.wave) this.drawWave(ctx, this.wave);
  }

  /** El Anj: lazo oval arriba y cruz abajo, dorado y con un halo de rayos de sol. */
  private drawAnkh(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number): void {
    ctx.save();
    ctx.translate(x, y);
    glow(ctx, '#ffd24a', 4);
    // Rayos de sol girando despacio.
    ctx.strokeStyle = 'rgba(255,225,120,0.5)';
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + frame / 60;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 6.2, Math.sin(a) * 6.2);
      ctx.lineTo(Math.cos(a) * 8, Math.sin(a) * 8);
      ctx.stroke();
    }
    const g = ctx.createLinearGradient(0, -7, 0, 7);
    g.addColorStop(0, '#fff2a8');
    g.addColorStop(1, '#e0a010');
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(0, -3.4, 2.5, 3.2, 0, 0, TAU); // lazo
    ctx.moveTo(0, -0.2);
    ctx.lineTo(0, 6.6); // tallo
    ctx.moveTo(-3.6, 1.8);
    ctx.lineTo(3.6, 1.8); // brazos
    ctx.stroke();
    ctx.restore();
  }

  /** Onda dorada que se expande desde donde se cogió y un destello que cubre la pantalla. */
  private drawWave(ctx: CanvasRenderingContext2D, w: { x: number; y: number; ticks: number }): void {
    const t = 1 - w.ticks / WAVE_TICKS;
    const y = MAZE_TOP + w.y;
    ctx.save();
    ctx.fillStyle = `rgba(255,236,170,${0.35 * (1 - t) ** 2})`;
    ctx.fillRect(0, MAZE_TOP, SCREEN_W, 31 * 8);
    glow(ctx, '#ffd24a', 6);
    for (let k = 0; k < 3; k++) {
      const r = Math.max(0, t * 260 - k * 22);
      ctx.strokeStyle = `rgba(255,214,90,${(1 - t) * (0.9 - k * 0.25)})`;
      ctx.lineWidth = 3 - k * 0.8;
      ctx.beginPath();
      ctx.arc(w.x, y, r, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}
