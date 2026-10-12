import { TICK_RATE } from '../constants';
import type { MechanicDef } from '../level/schema';
import { EFFECT_INFO, type EffectKind } from '../viewEffects';
import type { Mechanic, MechanicEnv } from './mechanic';

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
}
