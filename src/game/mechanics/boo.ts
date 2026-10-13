import type { PacMan } from '../actors/pacman';
import { DIRS, MAZE_TOP, TICK_RATE, TILE } from '../constants';
import type { MechanicDef } from '../level/schema';
import type { Rng } from '../random';
import { TAU, glow } from './geometry';
import type { Mechanic, MechanicEnv } from './mechanic';

type BooDef = Extract<MechanicDef, { type: 'boo' }>;

/** Velocidad del fantasma gigante (px/tick): bastante menos que Pac-Man (≈1), pero no se rinde. */
const CHASE_SPEED = 0.62;
/** Ticks de aparición y de desaparición (transparente e inofensivo). */
const FADE_TICKS = Math.round(1.2 * TICK_RATE);
/** Distancia (px) a la que su toque mata. */
const TOUCH = 8;
/** Aparece al menos a esta distancia (px) de Pac-Man. */
const SPAWN_DISTANCE = 12 * TILE;
/** Cono de visión: si el fantasma queda dentro de ±60° de la dirección de Pac-Man, se paraliza. */
const SEEN_COS = 0.5;
/** Respiro tras perder una vida. */
const GRACE_TICKS = 5 * TICK_RATE;

type Phase = 'away' | 'in' | 'chase' | 'out';

/**
 * Fantasma gigante de los castillos: aparece de vez en cuando, atraviesa paredes y persigue a Pac-Man;
 * si lo toca, muere. Es tímido: si Pac-Man lo mira de frente se queda paralizado, así que solo puede
 * alcanzarlo por la espalda. Pasado un rato se desvanece y se va.
 */
export class BooMechanic implements Mechanic {
  readonly kind = 'boo';
  private phase: Phase = 'away';
  private ticks: number;
  private x = 0;
  private y = 0;
  private frozen = false;
  /** Hacia dónde mira (para dibujarlo): -1 izquierda, 1 derecha. */
  private face: 1 | -1 = 1;

  constructor(
    private readonly def: BooDef,
    _lines: readonly string[],
    rng: Rng,
  ) {
    this.ticks = Math.round(this.interval(rng) * 0.6);
  }

  private interval(rng: Rng): number {
    const base = this.def.everySeconds * TICK_RATE;
    return Math.round(base * 0.7 + rng.int(Math.round(base * 0.6) + 1));
  }

  get present(): boolean {
    return this.phase !== 'away';
  }

  get isFrozen(): boolean {
    return this.frozen;
  }

  get position(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  get phaseName(): Phase {
    return this.phase;
  }

  /** Lo hace aparecer ya (para pruebas). */
  summon(env: MechanicEnv): void {
    this.appear(env);
  }

  /** ¿Está el fantasma dentro del cono de visión de Pac-Man? */
  seenBy(pac: { x: number; y: number; dir: number }): boolean {
    const dx = this.x - pac.x;
    const dy = this.y - pac.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.001) return true;
    const f = DIRS[pac.dir];
    return (dx / d) * f.x + (dy / d) * f.y > SEEN_COS;
  }

  update(env: MechanicEnv): void {
    switch (this.phase) {
      case 'away':
        if (--this.ticks <= 0) this.appear(env);
        break;
      case 'in':
        if (--this.ticks <= 0) {
          this.phase = 'chase';
          this.ticks = Math.round(this.def.staySeconds * TICK_RATE);
        }
        break;
      case 'chase': {
        if (--this.ticks <= 0) {
          this.phase = 'out';
          this.ticks = FADE_TICKS;
          this.frozen = false;
          break;
        }
        const pac = env.pac;
        this.frozen = this.seenBy(pac);
        if (!this.frozen) {
          const dx = pac.x - this.x;
          const dy = pac.y - this.y;
          const d = Math.hypot(dx, dy) || 1;
          this.x += (dx / d) * CHASE_SPEED;
          this.y += (dy / d) * CHASE_SPEED;
          this.face = dx >= 0 ? 1 : -1;
        }
        break;
      }
      case 'out':
        if (--this.ticks <= 0) {
          this.phase = 'away';
          this.ticks = this.interval(env.rng);
        }
        break;
    }
  }

  private appear(env: MechanicEnv): void {
    const pac = env.pac;
    // Un sitio cualquiera del laberinto a buena distancia de Pac-Man (puede ser dentro de una pared).
    for (let i = 0; i < 30; i++) {
      this.x = 16 + env.rng.int(224 - 32);
      this.y = 16 + env.rng.int(248 - 40);
      if (Math.hypot(this.x - pac.x, this.y - pac.y) >= SPAWN_DISTANCE) break;
    }
    this.phase = 'in';
    this.ticks = FADE_TICKS;
    this.frozen = false;
    env.sfx('summon');
    env.popup('¡BOO!', Math.min(200, Math.max(24, this.x)), Math.max(14, this.y - 12));
  }

  /** Solo mata cuando ya es sólido: mientras aparece o se va, es inofensivo. */
  hitsPac(pac: PacMan): boolean {
    return this.phase === 'chase' && Math.hypot(pac.x - this.x, pac.y - this.y) < TOUCH;
  }

  onRespawn(): void {
    this.phase = 'away';
    this.frozen = false;
    this.ticks = Math.max(this.ticks, GRACE_TICKS);
  }

  draw(): void {
    /* se dibuja por encima de todo */
  }

  drawOver(ctx: CanvasRenderingContext2D, frame: number): void {
    if (this.phase === 'away') return;
    const alpha = this.phase === 'in' ? 1 - this.ticks / FADE_TICKS : this.phase === 'out' ? this.ticks / FADE_TICKS : 1;
    const bob = Math.sin(frame / 10) * 1.4;
    const R = 9.5;
    ctx.save();
    ctx.translate(this.x, MAZE_TOP + this.y + bob);
    ctx.globalAlpha = Math.max(0, alpha) * (this.frozen ? 0.78 : 0.95);
    glow(ctx, this.frozen ? '#9fd0ff' : '#ff9ad8', 6);
    // Cuerpo: bola blanca con borde ondulado por abajo.
    const g = ctx.createRadialGradient(-2.5, -3.5, 1, 0, 0, R * 1.2);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, this.frozen ? '#9fb7e0' : '#dcd2f2');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, -1, R, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Bracitos: cubren la cara si está paralizado, hacia delante si persigue.
    ctx.fillStyle = '#f4efff';
    if (this.frozen) {
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(sx * 3.4, -2.6, 3.4, 2.6, sx * 0.5, 0, TAU);
        ctx.fill();
      }
    } else {
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(this.face * 8.5 + sx * 0.4 * this.face, 1.2 + sx * 2.4, 3, 2.2, this.face * 0.6, 0, TAU);
        ctx.fill();
      }
      // Ojos feroces y boca abierta con lengua.
      ctx.fillStyle = '#1a1a2a';
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(sx * 3 + this.face, -3.6, 1.5, 2.2, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#1a1a2a';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(sx * 3 + this.face - sx * 2.4, -7);
        ctx.lineTo(sx * 3 + this.face + sx * 1.6, -5.4);
        ctx.stroke();
      }
      ctx.fillStyle = '#6a1030';
      ctx.beginPath();
      ctx.ellipse(this.face * 0.8, 2.6, 4.2, 3, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ff6a8c';
      ctx.beginPath();
      ctx.ellipse(this.face * 0.8, 4.4, 2.2, 1.6, 0, 0, TAU);
      ctx.fill();
    }
    if (this.frozen) {
      // Ojitos asomando entre los dedos y escalofrío.
      ctx.fillStyle = '#1a1a2a';
      ctx.fillRect(-3.8, -3, 1.2, 0.9);
      ctx.fillRect(2.6, -3, 1.2, 0.9);
    }
    ctx.restore();
  }
}
