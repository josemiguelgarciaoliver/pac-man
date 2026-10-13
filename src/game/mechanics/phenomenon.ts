import { drawTextCentered } from '../../engine/font';
import { MAZE_TOP, SCREEN_W, TICK_RATE } from '../constants';
import type { MechanicDef } from '../level/schema';
import { EFFECT_INFO, type EffectKind } from '../viewEffects';
import type { Mechanic, MechanicEnv } from './mechanic';

/** Ticks de aviso antes de que empiece el fenómeno. */
const WARN_TICKS = 3 * TICK_RATE;

type PhenomenonDef = Extract<MechanicDef, { type: 'phenomenon' }>;

/**
 * Fenómenos del propio nivel: cada cierto tiempo el laberinto "hace algo" (gira, se refleja en un
 * espejo, se queda a oscuras, se vuelve borroso o confunde el mando) durante unos segundos.
 * Un aviso parpadea poco antes para que el jugador se prepare.
 */
export class PhenomenonMechanic implements Mechanic {
  readonly kind = 'phenomenon';
  private ticks: number;
  private readonly every: number;

  constructor(private readonly def: PhenomenonDef) {
    this.every = Math.round(def.everySeconds * TICK_RATE);
    this.ticks = Math.round(this.every * 0.6);
  }

  /** Segundos que faltan para el próximo (para pruebas y aviso en pantalla). */
  get secondsToNext(): number {
    return Math.ceil(this.ticks / TICK_RATE);
  }

  update(env: MechanicEnv): void {
    if (--this.ticks > 0) return;
    this.ticks = this.every + Math.round(this.def.durationSeconds * TICK_RATE);
    const effect = this.def.effect as EffectKind;
    env.view.add(effect, this.def.durationSeconds);
    env.sfx('poison');
    env.popup(EFFECT_INFO[effect].label, env.pac.x, env.pac.y - 10);
  }

  onRespawn(): void {
    // Tras perder una vida hay un respiro antes del siguiente fenómeno.
    this.ticks = Math.max(this.ticks, Math.round(this.every * 0.5));
  }

  draw(): void {
    /* sin dibujo propio: el efecto lo aplica la vista */
  }

  /** Aviso parpadeante en los últimos segundos: el fenómeno no viene de ningún objeto, así que se anuncia. */
  drawOver(ctx: CanvasRenderingContext2D, frame: number): void {
    if (this.ticks > WARN_TICKS || this.ticks > this.every) return;
    const label = EFFECT_INFO[this.def.effect as EffectKind].label;
    const y = MAZE_TOP + 4;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, y - 2, SCREEN_W, 12);
    if (Math.floor(frame / 8) % 2 === 0) drawTextCentered(ctx, `${label} EN ${this.secondsToNext}`, SCREEN_W / 2, y, '#ffd24a');
    ctx.restore();
  }
}
