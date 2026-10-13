import type { Ghost } from '../actors/ghost';
import { DIRS, MAZE_TOP, TICK_RATE } from '../constants';
import { pickSpread, type TileXY } from '../level/placement';
import type { MechanicDef } from '../level/schema';
import type { Rng } from '../random';
import { TAU, centerX, centerY, glow } from './geometry';
import type { Mechanic, MechanicEnv } from './mechanic';

type RageDef = Extract<MechanicDef, { type: 'rage' }>;

/** Velocidad extra (px/tick) de un fantasma furioso: casi el doble que normal. */
const RAGE_SPEED = 0.85;
/** Ticks hasta que la trampa se vuelve a cargar. */
const REARM_TICKS = 22 * TICK_RATE;

const NAMES: Record<string, string> = { blinky: 'BLINKY', pinky: 'PINKY', inky: 'INKY', clyde: 'CLYDE' };

interface Trap {
  tile: TileXY;
  /** Ticks hasta que vuelve a estar cargada (0 = cargada). */
  rearm: number;
}

interface Furious {
  ghost: Ghost;
  ticks: number;
  trail: { x: number; y: number }[];
}

/**
 * Trampa de furia: una placa roja que, al pisarla Pac-Man, enfurece a UNO de los fantasmas
 * (elegido al azar entre los que andan sueltos) dándole supervelocidad unos segundos.
 * Un aura roja y una estela delatan quién es. Un energizer lo calma mientras dure el susto.
 */
export class RageMechanic implements Mechanic {
  readonly kind = 'rage';
  private traps: Trap[] = [];
  private furious: Furious[] = [];
  private readonly seconds: number;

  constructor(def: RageDef, lines: readonly string[], rng: Rng, avoid: TileXY[] = []) {
    this.seconds = def.seconds;
    for (const tile of pickSpread(lines, def.count, rng, undefined, avoid)) this.traps.push({ tile, rearm: 0 });
  }

  get tiles(): TileXY[] {
    return this.traps.map((t) => t.tile);
  }

  get count(): number {
    return this.traps.length;
  }

  /** Fantasmas enfurecidos ahora mismo (para pruebas). */
  get angry(): Ghost[] {
    return this.furious.map((f) => f.ghost);
  }

  update(env: MechanicEnv): void {
    for (const f of this.furious) {
      f.ticks--;
      f.trail.push({ x: f.ghost.x, y: f.ghost.y });
      if (f.trail.length > 12) f.trail.shift();
    }
    // Un fantasma comido deja de estar furioso.
    this.furious = this.furious.filter((f) => f.ticks > 0 && f.ghost.state !== 'eaten' && f.ghost.state !== 'entering');

    const pac = env.pac;
    for (const t of this.traps) {
      if (t.rearm > 0) {
        // Si Pac-Man sigue encima cuando toca reaparecer, espera: no se recoge algo que no se ha visto aparecer.
        if (t.rearm === 1 && t.tile.col === pac.col && t.tile.row === pac.row) continue;
        t.rearm--;
        continue;
      }
      if (t.tile.col !== pac.col || t.tile.row !== pac.row) continue;
      const candidates = env.ghosts.filter((g) => g.state === 'active' && !g.frightened && !this.furious.some((f) => f.ghost === g));
      if (candidates.length === 0) continue; // no hay a quién enfurecer: la trampa sigue cargada
      const ghost = candidates[env.rng.int(candidates.length)];
      this.furious.push({ ghost, ticks: Math.round(this.seconds * TICK_RATE), trail: [] });
      t.rearm = REARM_TICKS;
      env.sfx('rage');
      env.popup(`${NAMES[ghost.name]} FURIOSO`, pac.x, pac.y - 10);
    }
  }

  ghostSpeedDelta(g: Ghost): number {
    // Asustado, un fantasma ya no corre: el energizer le quita la furia mientras dura.
    return !g.frightened && g.state === 'active' && this.furious.some((f) => f.ghost === g) ? RAGE_SPEED : 0;
  }

  onRespawn(): void {
    this.furious = [];
    for (const t of this.traps) t.rearm = Math.min(t.rearm, 5 * TICK_RATE);
  }

  draw(ctx: CanvasRenderingContext2D, frame: number): void {
    for (const t of this.traps) {
      const x = centerX(t.tile.col);
      const y = MAZE_TOP + centerY(t.tile.row);
      const armed = t.rearm === 0;
      const pulse = 0.5 + 0.5 * Math.sin(frame / 6);
      ctx.save();
      ctx.translate(x, y);
      // Placa oscura con borde rojo que late cuando está cargada.
      ctx.fillStyle = armed ? `rgba(120,10,30,${0.35 + pulse * 0.25})` : 'rgba(60,60,80,0.25)';
      ctx.beginPath();
      ctx.roundRect(-3.6, -3.6, 7.2, 7.2, 1.4);
      ctx.fill();
      if (armed) {
        glow(ctx, '#ff2a4a', 2.5);
        ctx.strokeStyle = '#ff4a64';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
      // Rayo rojo en el centro.
      ctx.shadowBlur = 0;
      ctx.fillStyle = armed ? '#ff6a80' : '#666a85';
      ctx.beginPath();
      ctx.moveTo(0.9, -3);
      ctx.lineTo(-1.6, 0.4);
      ctx.lineTo(-0.1, 0.4);
      ctx.lineTo(-0.9, 3);
      ctx.lineTo(1.7, -0.6);
      ctx.lineTo(0.2, -0.6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  drawOver(ctx: CanvasRenderingContext2D, frame: number): void {
    for (const f of this.furious) {
      const g = f.ghost;
      const d = DIRS[g.dir];
      ctx.save();
      // Estela: líneas de velocidad rojas detrás del fantasma.
      ctx.lineCap = 'round';
      for (let i = 0; i < f.trail.length; i += 2) {
        const p = f.trail[i];
        ctx.strokeStyle = `rgba(255,50,70,${(i / f.trail.length) * 0.5})`;
        ctx.lineWidth = 3.4 * (i / f.trail.length) + 0.6;
        ctx.beginPath();
        ctx.moveTo(p.x, MAZE_TOP + p.y);
        ctx.lineTo(p.x - d.x * 2, MAZE_TOP + p.y - d.y * 2);
        ctx.stroke();
      }
      // Aura roja palpitante alrededor del fantasma.
      glow(ctx, '#ff2a4a', 6);
      const pulse = 8 + Math.sin(frame / 3) * 1.2;
      const aura = ctx.createRadialGradient(g.x, MAZE_TOP + g.y, 2, g.x, MAZE_TOP + g.y, pulse);
      aura.addColorStop(0, 'rgba(255,40,70,0)');
      aura.addColorStop(0.7, 'rgba(255,40,70,0.28)');
      aura.addColorStop(1, 'rgba(255,40,70,0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(g.x, MAZE_TOP + g.y, pulse, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
}
