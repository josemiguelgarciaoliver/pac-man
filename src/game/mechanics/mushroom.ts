import { MAZE_TOP, TICK_RATE } from '../constants';
import { pickSpread, type TileXY } from '../level/placement';
import type { MechanicDef } from '../level/schema';
import type { Rng } from '../random';
import { EFFECT_INFO, type EffectKind } from '../viewEffects';
import { TAU, centerX, centerY, glow } from './geometry';
import type { Mechanic, MechanicEnv } from './mechanic';

type MushroomDef = Extract<MechanicDef, { type: 'mushroom' }>;

/** Segundos hasta que una seta comida vuelve a crecer. */
const REGROW_TICKS = 25 * TICK_RATE;

interface Shroom {
  tile: TileXY;
  /** Ticks hasta que vuelve a crecer (0 = disponible). */
  regrow: number;
}

/**
 * Setas tóxicas: al comerlas se aplica un efecto al azar de los que admite el nivel (visión
 * distorsionada, mando al revés o girado, laberinto girado, espejo, oscuridad… o un turbo).
 */
export class MushroomMechanic implements Mechanic {
  readonly kind = 'mushroom';
  private shrooms: Shroom[] = [];
  private readonly effects: EffectKind[];
  private readonly seconds: number;

  constructor(def: MushroomDef, lines: readonly string[], rng: Rng) {
    this.effects = def.effects as EffectKind[];
    this.seconds = def.effectSeconds;
    for (const tile of pickSpread(lines, def.count, rng)) this.shrooms.push({ tile, regrow: 0 });
  }

  get tiles(): TileXY[] {
    return this.shrooms.map((s) => s.tile);
  }

  get count(): number {
    return this.shrooms.length;
  }

  update(env: MechanicEnv): void {
    const pac = env.pac;
    for (const s of this.shrooms) {
      if (s.regrow > 0) {
        s.regrow--;
        continue;
      }
      if (s.tile.col !== pac.col || s.tile.row !== pac.row) continue;
      s.regrow = REGROW_TICKS;
      const effect = this.effects[env.rng.int(this.effects.length)];
      env.view.add(effect, this.seconds);
      env.sfx('poison');
      env.popup(EFFECT_INFO[effect].label, pac.x, pac.y - 10);
    }
  }

  drawOver(ctx: CanvasRenderingContext2D, frame: number): void {
    for (const s of this.shrooms) {
      if (s.regrow > 0) continue;
      const x = centerX(s.tile.col);
      const y = MAZE_TOP + centerY(s.tile.row) + Math.sin(frame / 12 + s.tile.col) * 0.6;
      ctx.save();
      ctx.translate(x, y);
      glow(ctx, '#b36bff', 3);
      // Tallo.
      ctx.fillStyle = '#efe6d2';
      ctx.beginPath();
      ctx.roundRect(-1.7, 0, 3.4, 4.6, 1.2);
      ctx.fill();
      // Sombrero degradado con lunares: morado venenoso.
      const g = ctx.createRadialGradient(-1.6, -3, 0.5, 0, -1, 6);
      g.addColorStop(0, '#e0b8ff');
      g.addColorStop(0.55, '#a24dff');
      g.addColorStop(1, '#5a1fb0');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, -0.8, 5.4, 4.2, 0, Math.PI, TAU);
      ctx.lineTo(5.2, 0.4);
      ctx.quadraticCurveTo(0, 1.8, -5.2, 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#d6ffd0';
      for (const [dx, dy, r] of [[-2.4, -2.2, 0.9], [1.6, -3, 0.8], [3, -1.1, 0.7], [-0.4, -1, 0.6]]) {
        ctx.beginPath();
        ctx.arc(dx, dy, r, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  draw(): void {
    /* las setas se dibujan sobre los puntos */
  }
}
