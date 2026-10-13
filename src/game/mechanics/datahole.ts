import { MAZE_TOP, TICK_RATE } from '../constants';
import { dotTiles, pickSpread, type TileXY } from '../level/placement';
import type { MechanicDef } from '../level/schema';
import type { Rng } from '../random';
import { TAU, centerX, centerY, glow } from './geometry';
import type { Mechanic, MechanicEnv } from './mechanic';

type HoleDef = Extract<MechanicDef, { type: 'hole' }>;

/** Tras usarse, el agujero se "repara" durante este tiempo. */
const REPAIR_TICKS = 10 * TICK_RATE;
/** El destino cae al menos a esta distancia (casillas, Manhattan) del agujero. */
const MIN_JUMP = 9;

interface Hole {
  tile: TileXY;
  /** Ticks hasta que vuelve a estar abierto (0 = abierto). */
  repair: number;
}

/**
 * Agujeros de datos: una grieta en el suelo que, al pisarla, te escupe a una casilla cualquiera
 * del laberinto (al azar y sin avisar). Tras usarse se cierra unos segundos.
 */
export class DataHoleMechanic implements Mechanic {
  readonly kind = 'hole';
  private holes: Hole[] = [];
  private readonly spots: TileXY[];
  /** Último salto, para dibujarle una onda de interferencia. */
  private flash: { from: TileXY; to: TileXY; ticks: number } | null = null;

  constructor(def: HoleDef, lines: readonly string[], rng: Rng, avoid: TileXY[] = []) {
    this.spots = dotTiles(lines);
    for (const tile of pickSpread(lines, def.count, rng, undefined, avoid)) this.holes.push({ tile, repair: 0 });
  }

  get tiles(): TileXY[] {
    return this.holes.map((h) => h.tile);
  }

  get count(): number {
    return this.holes.length;
  }

  update(env: MechanicEnv): void {
    if (this.flash && --this.flash.ticks <= 0) this.flash = null;
    const pac = env.pac;
    for (const h of this.holes) {
      if (h.repair > 0) {
        // Si Pac-Man sigue encima al reabrirse, espera a que se aparte (no salta sin haberlo visto).
        if (h.repair === 1 && h.tile.col === pac.col && h.tile.row === pac.row) continue;
        h.repair--;
        continue;
      }
      if (h.tile.col !== pac.col || h.tile.row !== pac.row) continue;
      // Solo salta cuando Pac-Man está casi en el centro de la casilla.
      if (Math.abs(pac.x - centerX(h.tile.col)) > 3 || Math.abs(pac.y - centerY(h.tile.row)) > 3) continue;
      const far = this.spots.filter((t) => Math.abs(t.col - h.tile.col) + Math.abs(t.row - h.tile.row) >= MIN_JUMP && !this.holes.some((o) => o.tile.col === t.col && o.tile.row === t.row));
      if (far.length === 0) continue;
      const to = far[env.rng.int(far.length)];
      this.flash = { from: h.tile, to, ticks: 24 };
      pac.x = centerX(to.col);
      pac.y = centerY(to.row);
      h.repair = REPAIR_TICKS;
      env.sfx('teleport');
      env.popup('¡SALTO DE DATOS!', pac.x, pac.y - 10);
      return;
    }
  }

  onRespawn(): void {
    this.flash = null;
    for (const h of this.holes) h.repair = Math.min(h.repair, 2 * TICK_RATE);
  }

  draw(ctx: CanvasRenderingContext2D, frame: number): void {
    for (const h of this.holes) {
      const x = centerX(h.tile.col);
      const y = MAZE_TOP + centerY(h.tile.row);
      const open = h.repair === 0;
      ctx.save();
      ctx.translate(x, y);
      if (open) glow(ctx, '#ff3fd2', 3);
      // Cuadraditos de color que bailan: "píxeles rotos".
      for (let i = 0; i < 9; i++) {
        const cx = (i % 3) - 1;
        const cy = Math.floor(i / 3) - 1;
        const on = open ? Math.floor(frame / 4 + i * 3) % 3 !== 0 : i % 2 === 0;
        ctx.fillStyle = open ? (on ? (i % 2 ? '#ff3fd2' : '#3ff0ff') : '#14061f') : 'rgba(120,120,150,0.3)';
        ctx.fillRect(cx * 2.4 - 1.1, cy * 2.4 - 1.1, 2.2, 2.2);
      }
      if (open) {
        ctx.strokeStyle = `rgba(63,240,255,${0.5 + 0.4 * Math.sin(frame / 5)})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.arc(0, 0, 5 + Math.sin(frame / 6), 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawOver(ctx: CanvasRenderingContext2D, frame: number): void {
    if (!this.flash) return;
    const t = this.flash.ticks / 24;
    ctx.save();
    for (const tile of [this.flash.from, this.flash.to]) {
      const x = centerX(tile.col);
      const y = MAZE_TOP + centerY(tile.row);
      glow(ctx, '#3ff0ff', 4);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + frame / 6;
        const r = (1 - t) * 11;
        ctx.fillStyle = i % 2 ? `rgba(255,63,210,${t})` : `rgba(63,240,255,${t})`;
        ctx.fillRect(x + Math.cos(a) * r - 1, y + Math.sin(a) * r - 1, 2, 2);
      }
    }
    ctx.restore();
  }
}
