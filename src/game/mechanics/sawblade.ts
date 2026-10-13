import type { PacMan } from '../actors/pacman';
import { MAZE_TOP, TILE } from '../constants';
import { beltRuns, openRuns, type TileXY } from '../level/placement';
import type { MechanicDef } from '../level/schema';
import type { Rng } from '../random';
import { TAU, centerX, centerY, glow } from './geometry';
import type { Mechanic, MechanicEnv } from './mechanic';

type SawDef = Extract<MechanicDef, { type: 'sawblade' }>;

const RADIUS = 5.2;
/** Longitud mínima (casillas) de la línea que recorre una sierra: cuanto más larga, más fácil pasar. */
const MIN_TRACK = 10;
/** Distancia mínima (Manhattan, casillas) entre la pista y la salida de Pac-Man. */
const SPAWN_CLEARANCE = 6;
const SPAWNS: TileXY[] = [
  { col: 13, row: 23 },
  { col: 14, row: 23 },
];
/** Distancia a la que la sierra alcanza a Pac-Man (px entre centros). */
const HIT_DISTANCE = 6.2;

interface Saw {
  from: TileXY;
  to: TileXY;
  /** Posición a lo largo de la pista, 0..length (px). */
  s: number;
  dir: 1 | -1;
  length: number;
  startS: number;
}

/** Sierras circulares que patrullan un pasillo recto de punta a punta. Matan al tocar a Pac-Man. */
export class SawbladeMechanic implements Mechanic {
  readonly kind = 'sawblade';
  private saws: Saw[] = [];

  constructor(
    private readonly def: SawDef,
    lines: readonly string[],
    rng: Rng,
  ) {
    const used: TileXY[] = [];
    // Primero las líneas más largas de pared a pared (tienen margen para esquivar); si no bastan, tramos rectos.
    const awayFromSpawn = (tiles: TileXY[]) => tiles.every((t) => SPAWNS.every((s) => Math.abs(t.col - s.col) + Math.abs(t.row - s.row) >= SPAWN_CLEARANCE));
    const long = rng
      .shuffle(openRuns(lines, MIN_TRACK))
      .filter((r) => awayFromSpawn(r.tiles))
      .sort((a, b) => b.tiles.length - a.tiles.length);
    const short = rng.shuffle(beltRuns(lines)).filter((r) => awayFromSpawn(r.tiles));
    for (const run of [...long, ...short]) {
      if (this.saws.length >= def.count) break;
      if (run.tiles.some((t) => used.some((u) => Math.abs(u.col - t.col) + Math.abs(u.row - t.row) < 3))) continue;
      const from = run.tiles[0];
      const to = run.tiles[run.tiles.length - 1];
      const length = (run.tiles.length - 1) * TILE;
      const startS = rng.float() * length;
      this.saws.push({ from, to, s: startS, dir: rng.chance(0.5) ? 1 : -1, length, startS });
      used.push(...run.tiles);
    }
  }

  get tracks(): { from: TileXY; to: TileXY }[] {
    return this.saws.map((s) => ({ from: s.from, to: s.to }));
  }

  get count(): number {
    return this.saws.length;
  }

  private position(saw: Saw): { x: number; y: number } {
    const t = saw.length === 0 ? 0 : saw.s / saw.length;
    return {
      x: centerX(saw.from.col) + (centerX(saw.to.col) - centerX(saw.from.col)) * t,
      y: centerY(saw.from.row) + (centerY(saw.to.row) - centerY(saw.from.row)) * t,
    };
  }

  update(_env: MechanicEnv): void {
    for (const saw of this.saws) {
      saw.s += saw.dir * this.def.speed;
      if (saw.s >= saw.length) {
        saw.s = saw.length;
        saw.dir = -1;
      } else if (saw.s <= 0) {
        saw.s = 0;
        saw.dir = 1;
      }
    }
  }

  hitsPac(pac: PacMan): boolean {
    return this.saws.some((saw) => {
      const p = this.position(saw);
      return Math.hypot(p.x - pac.x, p.y - pac.y) < HIT_DISTANCE;
    });
  }

  onRespawn(): void {
    // Vuelven a su posición inicial, a cierta distancia de la salida de Pac-Man.
    for (const saw of this.saws) {
      saw.s = saw.startS;
      saw.dir = 1;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    // Carril por el que circula cada sierra.
    ctx.save();
    ctx.strokeStyle = 'rgba(200,210,240,0.28)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([1.5, 2]);
    for (const saw of this.saws) {
      ctx.beginPath();
      ctx.moveTo(centerX(saw.from.col), MAZE_TOP + centerY(saw.from.row));
      ctx.lineTo(centerX(saw.to.col), MAZE_TOP + centerY(saw.to.row));
      ctx.stroke();
    }
    ctx.restore();
  }

  drawOver(ctx: CanvasRenderingContext2D, frame: number): void {
    for (const saw of this.saws) {
      const p = this.position(saw);
      ctx.save();
      ctx.translate(p.x, MAZE_TOP + p.y);
      ctx.rotate(frame * 0.5 * saw.dir);
      glow(ctx, '#ff5a3c', 2.5);
      // Disco con dientes.
      const g = ctx.createRadialGradient(-1.5, -1.5, 0.5, 0, 0, RADIUS);
      g.addColorStop(0, '#f4f6ff');
      g.addColorStop(1, '#8b93ad');
      ctx.fillStyle = g;
      ctx.beginPath();
      const teeth = 10;
      for (let i = 0; i < teeth * 2; i++) {
        const a = (i / (teeth * 2)) * TAU;
        const r = i % 2 === 0 ? RADIUS : RADIUS - 1.6;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#3a3f58';
      ctx.beginPath();
      ctx.arc(0, 0, 1.6, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
}
