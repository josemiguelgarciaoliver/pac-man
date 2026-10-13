import { MAZE_TOP, TICK_RATE } from '../constants';
import { PAC_SPAWN_TILE } from '../maze/generator';
import { beltRuns, dotTiles, type TileXY } from '../level/placement';
import type { MechanicDef } from '../level/schema';
import type { PacMan } from '../actors/pacman';
import type { Rng } from '../random';
import { TAU, centerX, centerY, glow } from './geometry';
import type { Mechanic, MechanicEnv } from './mechanic';

type JellyDef = Extract<MechanicDef, { type: 'jellyfish' }>;

/** Velocidad de la medusa (px/tick): flota despacio. */
const DRIFT = 0.3;
/** Distancia (px) a la que su descarga alcanza a Pac-Man. */
const REACH = 6;
/** Ticks de parálisis y de inmunidad posterior, para no encadenar descargas. */
const STUN_TICKS = Math.round(1.2 * TICK_RATE);
const IMMUNE_TICKS = Math.round(2.5 * TICK_RATE);
/** Velocidad de Pac-Man mientras está paralizado (casi quieto). */
const STUN_FACTOR = 0.04;

interface Jelly {
  /** Casillas del tramo por el que va y viene. */
  path: TileXY[];
  /** Posición a lo largo del tramo, en px (0 = primera casilla). */
  s: number;
  dir: 1 | -1;
  x: number;
  y: number;
}

/**
 * Medusas: flotan despacio de un lado a otro de un pasillo. No matan: si rozan a Pac-Man lo
 * paralizan con una descarga unos instantes (y luego tiene un respiro). Con fantasmas cerca, duele.
 */
export class JellyfishMechanic implements Mechanic {
  readonly kind = 'jellyfish';
  private jellies: Jelly[] = [];
  private stun = 0;
  private immune = 0;

  constructor(def: JellyDef, lines: readonly string[], rng: Rng) {
    const far = (t: TileXY) => Math.abs(t.col - PAC_SPAWN_TILE.col) + Math.abs(t.row - PAC_SPAWN_TILE.row) >= 9;
    const runs = rng.shuffle(beltRuns(lines)).filter((r) => r.tiles.every(far));
    for (const run of runs) {
      if (this.jellies.length >= def.count) break;
      // Un solo tramo por medusa y sin pisarse con otra.
      if (this.jellies.some((j) => j.path.some((p) => run.tiles.some((q) => Math.abs(p.col - q.col) + Math.abs(p.row - q.row) < 4)))) continue;
      this.jellies.push(this.make(run.tiles));
    }
    // Laberintos sin tramos rectos: la medusa se queda flotando sobre una casilla.
    for (const t of rng.shuffle(dotTiles(lines).filter(far))) {
      if (this.jellies.length >= def.count) break;
      this.jellies.push(this.make([t]));
    }
  }

  private make(path: TileXY[]): Jelly {
    return { path, s: 0, dir: 1, x: centerX(path[0].col), y: centerY(path[0].row) };
  }

  get count(): number {
    return this.jellies.length;
  }

  /** Casillas por las que patrullan (para pruebas). */
  get paths(): TileXY[][] {
    return this.jellies.map((j) => j.path);
  }

  get stunned(): boolean {
    return this.stun > 0;
  }

  update(env: MechanicEnv): void {
    if (this.stun > 0) this.stun--;
    else if (this.immune > 0) this.immune--;
    for (const j of this.jellies) {
      const len = (j.path.length - 1) * 8;
      if (len > 0) {
        j.s += DRIFT * j.dir;
        if (j.s >= len) (j.s = len), (j.dir = -1);
        else if (j.s <= 0) (j.s = 0), (j.dir = 1);
      }
      const i = Math.min(j.path.length - 1, Math.floor(j.s / 8));
      const a = j.path[i];
      const b = j.path[Math.min(j.path.length - 1, i + 1)];
      const f = (j.s - i * 8) / 8;
      j.x = centerX(a.col) + (centerX(b.col) - centerX(a.col)) * f;
      j.y = centerY(a.row) + (centerY(b.row) - centerY(a.row)) * f;
      if (this.stun === 0 && this.immune === 0 && Math.hypot(env.pac.x - j.x, env.pac.y - j.y) < REACH) {
        this.stun = STUN_TICKS;
        this.immune = IMMUNE_TICKS;
        env.sfx('zap');
        env.popup('¡MEDUSA!', env.pac.x, env.pac.y - 10);
      }
    }
  }

  pacSpeedFactor(_pac: PacMan): number {
    return this.stun > 0 ? STUN_FACTOR : 1;
  }

  onRespawn(): void {
    this.stun = 0;
    this.immune = IMMUNE_TICKS;
  }

  draw(): void {
    /* se dibujan sobre los puntos */
  }

  drawOver(ctx: CanvasRenderingContext2D, frame: number): void {
    for (const j of this.jellies) {
      const bob = Math.sin(frame / 9 + j.x) * 0.8;
      const pulse = 0.5 + 0.5 * Math.sin(frame / 7 + j.y);
      ctx.save();
      ctx.translate(j.x, MAZE_TOP + j.y + bob);
      glow(ctx, '#ff7de0', 4);
      // Tentáculos ondulantes.
      ctx.strokeStyle = 'rgba(255,150,230,0.75)';
      ctx.lineWidth = 0.8;
      ctx.lineCap = 'round';
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath();
        ctx.moveTo(k * 1.5, 1);
        ctx.quadraticCurveTo(k * 1.5 + Math.sin(frame / 6 + k) * 1.6, 3.6, k * 1.5 + Math.sin(frame / 6 + k + 1) * 1.2, 6.4);
        ctx.stroke();
      }
      // Campana translúcida que late.
      const g = ctx.createRadialGradient(-1, -2, 0.5, 0, 0, 6);
      g.addColorStop(0, 'rgba(255,225,250,0.95)');
      g.addColorStop(1, 'rgba(210,90,200,0.55)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, -0.5, 5 + pulse * 0.6, 4.2 - pulse * 0.5, 0, Math.PI, TAU);
      ctx.quadraticCurveTo(0, 2.4, -5 - pulse * 0.6, -0.5);
      ctx.fill();
      ctx.restore();
    }
  }
}
