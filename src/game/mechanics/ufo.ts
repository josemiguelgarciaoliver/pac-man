import type { PacMan } from '../actors/pacman';
import { MAZE_TOP, TICK_RATE } from '../constants';
import type { MechanicDef } from '../level/schema';
import type { Rng } from '../random';
import { TAU, glow } from './geometry';
import type { Mechanic, MechanicEnv } from './mechanic';

type UfoDef = Extract<MechanicDef, { type: 'ufo' }>;

const MAZE_W = 224;
const MAZE_H = 248;
/** Velocidad del platillo (px/tick). Vuela por encima de las paredes. */
const SPEED = 0.75;
/** Velocidad del rayo (px/tick): rápido pero esquivable, y también atraviesa las paredes. */
const BOLT_SPEED = 2.1;
const BOLT_HIT = 4.2;
/** A esta distancia (px) del platillo se le alcanza con la pistola. */
const SHOT_HIT = 8;
/** Ticks de carga antes de cada disparo (el platillo se pone rojo). */
const CHARGE_TICKS = 32;
/** Respiro tras destruirlo antes de la siguiente visita (multiplica el intervalo). */
const DESTROYED_DELAY = 1.6;
/** Respiro tras perder una vida. */
const GRACE_TICKS = 4 * TICK_RATE;

interface Bolt {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

type Phase = 'away' | 'visit' | 'leaving' | 'boom';

/**
 * Platillo volante: de vez en cuando entra en el laberinto, vuela de un lado a otro por encima de
 * las paredes y dispara rayos a Pac-Man (que también las atraviesan). Pasados unos segundos se va.
 * Una bomba o un disparo de la pistola lo destruyen.
 */
export class UfoMechanic implements Mechanic {
  readonly kind = 'ufo';
  private phase: Phase = 'away';
  private ticks: number;
  private x = -20;
  private y = 60;
  private side: 1 | -1 = 1;
  private goal = { x: 112, y: 100 };
  private fire = 0;
  private charge = 0;
  private bolts: Bolt[] = [];
  private boom = 0;

  constructor(
    private readonly def: UfoDef,
    _lines: readonly string[],
    rng: Rng,
  ) {
    this.ticks = this.interval(rng) * 0.6;
  }

  private interval(rng: Rng): number {
    const base = this.def.everySeconds * TICK_RATE;
    return Math.round(base * 0.7 + rng.int(Math.round(base * 0.6) + 1));
  }

  /** ¿Está en pantalla y dispara? (para pruebas) */
  get present(): boolean {
    return this.phase === 'visit' || this.phase === 'leaving';
  }

  get position(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  get phaseName(): Phase {
    return this.phase;
  }

  get boltCount(): number {
    return this.bolts.length;
  }

  /** Obliga a que llegue ya (para pruebas). */
  summon(env: MechanicEnv): void {
    this.arrive(env);
  }

  update(env: MechanicEnv): void {
    this.updateBolts(env.pac);
    switch (this.phase) {
      case 'away':
        if (--this.ticks <= 0) this.arrive(env);
        break;
      case 'visit': {
        if (--this.ticks <= 0) {
          this.phase = 'leaving';
          this.goal = { x: this.side > 0 ? MAZE_W + 30 : -30, y: this.y };
          break;
        }
        this.flyTo(this.goal, () => (this.goal = { x: 16 + env.rng.int(MAZE_W - 32), y: 20 + env.rng.int(MAZE_H - 50) }));
        this.shoot(env);
        break;
      }
      case 'leaving':
        if (this.flyTo(this.goal)) this.depart(env.rng);
        break;
      case 'boom':
        if (--this.boom <= 0) this.depart(env.rng, DESTROYED_DELAY);
        break;
    }
  }

  private arrive(env: MechanicEnv): void {
    this.side = env.rng.chance(0.5) ? 1 : -1;
    this.x = this.side > 0 ? -20 : MAZE_W + 20;
    this.y = 30 + env.rng.int(MAZE_H - 90);
    this.goal = { x: 30 + env.rng.int(MAZE_W - 60), y: 30 + env.rng.int(MAZE_H - 90) };
    this.phase = 'visit';
    this.ticks = Math.round(this.def.staySeconds * TICK_RATE);
    this.fire = Math.round(1.5 * TICK_RATE);
    this.charge = 0;
    env.sfx('summon');
    env.popup('¡OVNI!', Math.min(MAZE_W - 24, Math.max(24, this.x)), 40);
  }

  private depart(rng: Rng, factor = 1): void {
    this.phase = 'away';
    this.ticks = Math.round(this.interval(rng) * factor);
    this.charge = 0;
  }

  /** Avanza hacia `to`; devuelve true al llegar (y entonces llama a `arrived`). */
  private flyTo(to: { x: number; y: number }, arrived?: () => void): boolean {
    const dx = to.x - this.x;
    const dy = to.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d <= SPEED) {
      this.x = to.x;
      this.y = to.y;
      arrived?.();
      return true;
    }
    this.x += (dx / d) * SPEED;
    this.y += (dy / d) * SPEED;
    return false;
  }

  private shoot(env: MechanicEnv): void {
    if (this.charge > 0) {
      if (--this.charge === 0) {
        const dx = env.pac.x - this.x;
        const dy = env.pac.y - this.y;
        const d = Math.hypot(dx, dy) || 1;
        this.bolts.push({ x: this.x, y: this.y + 3, vx: (dx / d) * BOLT_SPEED, vy: (dy / d) * BOLT_SPEED });
        env.sfx('zap');
        this.fire = Math.round(this.def.fireSeconds * TICK_RATE);
      }
      return;
    }
    if (--this.fire <= 0) this.charge = CHARGE_TICKS;
  }

  private updateBolts(_pac: PacMan): void {
    for (const b of this.bolts) {
      b.x += b.vx;
      b.y += b.vy;
    }
    this.bolts = this.bolts.filter((b) => b.x > -20 && b.x < MAZE_W + 20 && b.y > -20 && b.y < MAZE_H + 20);
  }

  hitsPac(pac: PacMan): boolean {
    return this.bolts.some((b) => Math.hypot(pac.x - b.x, pac.y - b.y) < BOLT_HIT);
  }

  /** Disparo de la pistola de Pac-Man en (x, y): true si derriba al platillo. */
  shotAt(x: number, y: number, env: MechanicEnv): boolean {
    if (!this.present || Math.hypot(x - this.x, y - this.y) > SHOT_HIT) return false;
    this.destroy(env);
    return true;
  }

  /** Una explosión de radio `radius` en (x, y). */
  onBlast(x: number, y: number, radius: number, env: MechanicEnv): void {
    if (this.present && Math.hypot(x - this.x, y - this.y) <= radius) this.destroy(env);
  }

  private destroy(env: MechanicEnv): void {
    this.phase = 'boom';
    this.boom = 28;
    this.charge = 0;
    env.sfx('explosion');
    env.popup('OVNI DESTRUIDO', Math.min(MAZE_W - 40, Math.max(40, this.x)), Math.max(14, this.y - 8));
  }

  onRespawn(): void {
    this.bolts = [];
    this.charge = 0;
    this.phase = 'away';
    this.ticks = Math.max(this.ticks, GRACE_TICKS);
  }

  draw(): void {
    /* se dibuja por encima de todo */
  }

  drawOver(ctx: CanvasRenderingContext2D, frame: number): void {
    // Rayos: bolas verdes con estela.
    ctx.save();
    ctx.lineCap = 'round';
    glow(ctx, '#7dff9a', 4);
    for (const b of this.bolts) {
      const y = MAZE_TOP + b.y;
      const m = Math.hypot(b.vx, b.vy) || 1;
      ctx.strokeStyle = 'rgba(140,255,170,0.55)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(b.x - (b.vx / m) * 8, y - (b.vy / m) * 8);
      ctx.lineTo(b.x, y);
      ctx.stroke();
      ctx.fillStyle = '#eaffef';
      ctx.beginPath();
      ctx.arc(b.x, y, 2.2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    if (this.phase === 'boom') {
      const t = 1 - this.boom / 28;
      ctx.save();
      glow(ctx, '#ffb04a', 6);
      ctx.fillStyle = `rgba(255,200,90,${1 - t})`;
      ctx.beginPath();
      ctx.arc(this.x, MAZE_TOP + this.y, 4 + t * 16, 0, TAU);
      ctx.fill();
      ctx.restore();
      return;
    }
    if (!this.present) return;
    const y = MAZE_TOP + this.y + Math.sin(frame / 8) * 1;
    const charging = this.charge > 0;
    ctx.save();
    ctx.translate(this.x, y);
    // Sombra del platillo sobre el suelo.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 11, 8, 2, 0, 0, TAU);
    ctx.fill();
    glow(ctx, charging ? '#ff4a3a' : '#7dffd0', 5);
    // Cúpula de cristal.
    ctx.fillStyle = 'rgba(190,240,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(0, -2.4, 3.6, 3.4, 0, Math.PI, TAU);
    ctx.fill();
    // Casco metálico.
    const g = ctx.createLinearGradient(0, -2, 0, 4);
    g.addColorStop(0, charging ? '#ff9a8a' : '#e6ecf5');
    g.addColorStop(1, charging ? '#a02418' : '#6c7890');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0.6, 8.6, 3.4, 0, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Luces que corren por el borde.
    for (let i = 0; i < 5; i++) {
      const lit = Math.floor(frame / 5) % 5 === i;
      ctx.fillStyle = lit ? '#ffe680' : '#47506a';
      ctx.beginPath();
      ctx.arc(-5.6 + i * 2.8, 1.1 + (i === 0 || i === 4 ? -0.6 : 0), 0.9, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}
