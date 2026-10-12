import type { PacMan } from '../actors/pacman';
import { MAZE_TOP, TICK_RATE, TILE } from '../constants';
import { openRuns, type OpenRun } from '../level/placement';
import type { MechanicDef } from '../level/schema';
import type { Rng } from '../random';
import { TAU, centerX, centerY, glow } from './geometry';
import type { Mechanic, MechanicEnv } from './mechanic';

type TurretDef = Extract<MechanicDef, { type: 'turret' }>;

/** Ticks de aviso antes de disparar (la línea parpadea en rojo). */
const TELEGRAPH = 55;
/** Velocidad del proyectil (px/tick). */
const BOLT_SPEED = 5.5;
const HIT_DISTANCE = 5.2;

interface Turret {
  /** Pared de la que sale el disparo y dirección hacia el otro extremo (dc, dr). */
  wall: { x: number; y: number };
  dc: number;
  dr: number;
  /** Longitud del pasillo en px, desde la pared hasta la pared contraria. */
  length: number;
  /** Ticks dentro del ciclo (de 0 a period). */
  t: number;
  /** Posición del proyectil a lo largo del pasillo (px); null si no hay disparo. */
  bolt: number | null;
}

/**
 * Torretas empotradas en la pared que disparan de pared a pared a lo largo de un pasillo recto.
 * Antes de cada disparo la línea de tiro parpadea en rojo; el proyectil es rápido y mata a Pac-Man.
 */
export class TurretMechanic implements Mechanic {
  readonly kind = 'turret';
  private turrets: Turret[] = [];
  private readonly period: number;

  constructor(
    def: TurretDef,
    lines: readonly string[],
    rng: Rng,
  ) {
    this.period = Math.round(def.periodSeconds * TICK_RATE);
    const used = new Set<string>();
    const runs: OpenRun[] = rng.shuffle(openRuns(lines));
    for (const run of runs) {
      if (this.turrets.length >= def.count) break;
      if (run.tiles.some((t) => used.has(`${t.col},${t.row}`))) continue;
      // Se descartan pistas cruzadas con otras ya ocupadas para que las torretas no se solapen.
      const flip = rng.chance(0.5);
      const from = flip ? run.endWall : run.startWall;
      const to = flip ? run.startWall : run.endWall;
      const dc = Math.sign(to.col - from.col);
      const dr = Math.sign(to.row - from.row);
      const index = this.turrets.length;
      this.turrets.push({
        wall: { x: centerX(from.col), y: centerY(from.row) },
        dc,
        dr,
        length: (run.tiles.length + 1) * TILE,
        // Desfasadas entre sí; la primera dispara pasados unos segundos, no al arrancar.
        t: Math.round(this.period * (0.45 + (index * 0.37) % 0.5)),
        bolt: null,
      });
      for (const t of run.tiles) used.add(`${t.col},${t.row}`);
    }
  }

  /** Pasillos de tiro: pared de salida, dirección y longitud (para pruebas). */
  get lanes(): { wall: { x: number; y: number }; dc: number; dr: number; length: number }[] {
    return this.turrets.map((t) => ({ wall: t.wall, dc: t.dc, dr: t.dr, length: t.length }));
  }

  get count(): number {
    return this.turrets.length;
  }

  private boltPos(t: Turret): { x: number; y: number } | null {
    if (t.bolt === null) return null;
    return { x: t.wall.x + t.dc * t.bolt, y: t.wall.y + t.dr * t.bolt };
  }

  update(env: MechanicEnv): void {
    for (const t of this.turrets) {
      t.t = (t.t + 1) % this.period;
      if (t.t === this.period - TELEGRAPH) env.sfx('tick');
      if (t.t === 0) {
        t.bolt = 0;
        env.sfx('zap');
      }
      if (t.bolt !== null) {
        t.bolt += BOLT_SPEED;
        if (t.bolt > t.length) t.bolt = null;
      }
    }
  }

  hitsPac(pac: PacMan): boolean {
    return this.turrets.some((t) => {
      const p = this.boltPos(t);
      return p !== null && Math.hypot(p.x - pac.x, p.y - pac.y) < HIT_DISTANCE;
    });
  }

  onRespawn(): void {
    for (const t of this.turrets) {
      t.bolt = null;
      // Tras perder una vida nadie dispara en el primer segundo.
      t.t = Math.min(t.t, this.period - TELEGRAPH - TICK_RATE);
    }
  }

  draw(ctx: CanvasRenderingContext2D, frame: number): void {
    // Línea de tiro parpadeando justo antes del disparo.
    for (const t of this.turrets) {
      const remaining = this.period - t.t;
      if (remaining > TELEGRAPH || t.bolt !== null) continue;
      const on = Math.floor(frame / 4) % 2 === 0;
      ctx.save();
      ctx.strokeStyle = on ? 'rgba(255,60,40,0.85)' : 'rgba(255,60,40,0.3)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([2.5, 2.5]);
      ctx.beginPath();
      ctx.moveTo(t.wall.x, MAZE_TOP + t.wall.y);
      ctx.lineTo(t.wall.x + t.dc * t.length, MAZE_TOP + t.wall.y + t.dr * t.length);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawOver(ctx: CanvasRenderingContext2D, frame: number): void {
    for (const t of this.turrets) {
      const charging = this.period - t.t <= TELEGRAPH;
      this.drawTurret(ctx, t, charging, frame);
      const p = this.boltPos(t);
      if (p) this.drawBolt(ctx, t, p);
    }
  }

  private drawTurret(ctx: CanvasRenderingContext2D, t: Turret, charging: boolean, frame: number): void {
    ctx.save();
    ctx.translate(t.wall.x, MAZE_TOP + t.wall.y);
    ctx.rotate(Math.atan2(t.dr, t.dc));
    // Base metálica empotrada en la pared y cañón hacia el pasillo.
    ctx.fillStyle = '#4b5068';
    ctx.beginPath();
    ctx.roundRect(-4.4, -4.4, 8.8, 8.8, 1.6);
    ctx.fill();
    ctx.fillStyle = '#2a2d40';
    ctx.fillRect(1.2, -1.6, 5, 3.2);
    if (charging && Math.floor(frame / 4) % 2 === 0) glow(ctx, '#ff3c28', 3);
    ctx.fillStyle = charging ? '#ff4a34' : '#7a2a20';
    ctx.beginPath();
    ctx.arc(-1, 0, 1.7, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  private drawBolt(ctx: CanvasRenderingContext2D, t: Turret, p: { x: number; y: number }): void {
    ctx.save();
    glow(ctx, '#ffd24a', 4);
    // Estela del proyectil: más intensa en la cabeza.
    const tail = 16;
    const g = ctx.createLinearGradient(p.x - t.dc * tail, MAZE_TOP + p.y - t.dr * tail, p.x, MAZE_TOP + p.y);
    g.addColorStop(0, 'rgba(255,210,74,0)');
    g.addColorStop(1, 'rgba(255,250,200,1)');
    ctx.strokeStyle = g;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x - t.dc * tail, MAZE_TOP + p.y - t.dr * tail);
    ctx.lineTo(p.x, MAZE_TOP + p.y);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(p.x, MAZE_TOP + p.y, 2.2, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}
