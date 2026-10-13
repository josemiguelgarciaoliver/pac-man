import type { PacMan } from '../actors/pacman';
import { MAZE_TOP, TICK_RATE, TILE } from '../constants';
import { dotTiles, type TileXY } from '../level/placement';
import type { MechanicDef } from '../level/schema';
import type { Rng } from '../random';
import { TAU, centerX, centerY, glow } from './geometry';
import type { Mechanic, MechanicEnv } from './mechanic';

type LavaDef = Extract<MechanicDef, { type: 'lava' }>;

/** Ticks de aviso (la lava burbujea y se oye el retumbo) y de erupción (la salpicadura mata). */
const WARN_TICKS = Math.round(1.7 * TICK_RATE);
const ERUPT_TICKS = Math.round(0.8 * TICK_RATE);
/** Una erupción nunca se anuncia a menos de estas casillas de Pac-Man: da tiempo a apartarse. */
const SAFE_DISTANCE = 5;
/** Respiro tras perder una vida antes de la siguiente erupción. */
const GRACE_TICKS = 3 * TICK_RATE;

interface Vent {
  tile: TileXY;
  phase: 'warn' | 'erupt';
  ticks: number;
  /** Chorros de lava de la fuente (ángulo y alcance, fijados al empezar). */
  spray: { a: number; r: number }[];
}

/**
 * Erupciones de lava: en momentos y sitios al azar, el suelo burbujea (aviso) y estalla en una
 * fuente cuya salpicadura mata a Pac-Man si lo alcanza. El aviso muestra el área peligrosa.
 */
export class LavaMechanic implements Mechanic {
  readonly kind = 'lava';
  private vents: Vent[] = [];
  private readonly spots: TileXY[];
  private next: number;

  constructor(
    private readonly def: LavaDef,
    lines: readonly string[],
    rng: Rng,
  ) {
    this.spots = dotTiles(lines);
    this.next = this.interval(rng) + TICK_RATE * 2;
  }

  /** Radio mortal de la salpicadura (px). */
  get splashRadius(): number {
    return (this.def.splash + 0.6) * TILE;
  }

  /** Erupciones en curso (para pruebas). */
  get active(): { tile: TileXY; phase: 'warn' | 'erupt' }[] {
    return this.vents.map((v) => ({ tile: v.tile, phase: v.phase }));
  }

  private interval(rng: Rng): number {
    const base = this.def.everySeconds * TICK_RATE;
    return Math.round(base * 0.6 + rng.int(Math.round(base * 0.8) + 1));
  }

  update(env: MechanicEnv): void {
    const pac = env.pac;
    for (const v of this.vents) {
      if (--v.ticks > 0) continue;
      if (v.phase === 'warn') {
        v.phase = 'erupt';
        v.ticks = ERUPT_TICKS;
        env.sfx('explosion');
      }
    }
    this.vents = this.vents.filter((v) => v.ticks > 0);

    if (--this.next > 0) return;
    this.next = this.interval(env.rng) + WARN_TICKS + ERUPT_TICKS;
    const far = this.spots.filter((t) => Math.abs(t.col - pac.col) + Math.abs(t.row - pac.row) >= SAFE_DISTANCE && !this.vents.some((v) => v.tile.col === t.col && v.tile.row === t.row));
    for (let i = 0; i < this.def.count && far.length > 0; i++) {
      const tile = far.splice(env.rng.int(far.length), 1)[0];
      const spray = Array.from({ length: 9 }, (_, k) => ({ a: (k / 9) * TAU + env.rng.int(100) / 100, r: 0.55 + env.rng.int(45) / 100 }));
      this.vents.push({ tile, phase: 'warn', ticks: WARN_TICKS, spray });
    }
    if (this.vents.length > 0) env.sfx('tick');
  }

  hitsPac(pac: PacMan): boolean {
    return this.vents.some((v) => v.phase === 'erupt' && Math.hypot(pac.x - centerX(v.tile.col), pac.y - centerY(v.tile.row)) <= this.splashRadius);
  }

  onRespawn(): void {
    this.vents = [];
    this.next = Math.max(this.next, GRACE_TICKS);
  }

  draw(ctx: CanvasRenderingContext2D, frame: number): void {
    // Aviso: charco de lava que burbujea y círculo del área peligrosa.
    for (const v of this.vents) {
      if (v.phase !== 'warn') continue;
      const x = centerX(v.tile.col);
      const y = MAZE_TOP + centerY(v.tile.row);
      const urgency = 1 - v.ticks / WARN_TICKS;
      const R = this.splashRadius;
      ctx.save();
      const g = ctx.createRadialGradient(x, y, 1, x, y, R);
      g.addColorStop(0, `rgba(255,120,30,${0.35 + urgency * 0.4})`);
      g.addColorStop(1, 'rgba(255,40,10,0.05)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, R, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,170,70,${0.4 + 0.4 * Math.sin(frame / 3)})`;
      ctx.lineWidth = 0.8;
      ctx.setLineDash([2.5, 2.5]);
      ctx.stroke();
      ctx.setLineDash([]);
      // Burbujas de lava en el centro.
      glow(ctx, '#ff7a1c', 3);
      ctx.fillStyle = '#ffb13a';
      for (let i = 0; i < 4; i++) {
        const p = (frame * 0.05 + i * 0.25) % 1;
        ctx.beginPath();
        ctx.arc(x + Math.sin(i * 2.4 + frame / 9) * 2.6, y - p * 3.4, 0.7 + (1 - p) * (1 + urgency * 1.4), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawOver(ctx: CanvasRenderingContext2D, frame: number): void {
    for (const v of this.vents) {
      if (v.phase !== 'erupt') continue;
      const x = centerX(v.tile.col);
      const y = MAZE_TOP + centerY(v.tile.row);
      const t = 1 - v.ticks / ERUPT_TICKS;
      const R = this.splashRadius;
      ctx.save();
      // Destello de la erupción.
      const g = ctx.createRadialGradient(x, y, 1, x, y, R);
      g.addColorStop(0, `rgba(255,240,170,${0.9 * (1 - t * 0.5)})`);
      g.addColorStop(0.5, `rgba(255,120,30,${0.6 * (1 - t * 0.4)})`);
      g.addColorStop(1, 'rgba(255,40,10,0.15)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, R, 0, TAU);
      ctx.fill();
      // Chorros de lava que salen disparados y caen.
      glow(ctx, '#ff6a14', 4);
      for (const s of v.spray) {
        const d = Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.5) * s.r * R;
        const lift = Math.sin(t * Math.PI) * 5 * s.r;
        ctx.fillStyle = Math.floor(frame / 3 + s.a * 4) % 2 === 0 ? '#ffd24a' : '#ff7a1c';
        ctx.beginPath();
        ctx.arc(x + Math.cos(s.a) * d, y + Math.sin(s.a) * d - lift, 1.3 * (1 - t * 0.4), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}
