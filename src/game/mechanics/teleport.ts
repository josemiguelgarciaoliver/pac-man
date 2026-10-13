import { MAZE_TOP, TICK_RATE } from '../constants';
import { pickSpread, type TileXY } from '../level/placement';
import type { MechanicDef } from '../level/schema';
import type { Rng } from '../random';
import { TAU, centerX, centerY, glow } from './geometry';
import type { Mechanic, MechanicEnv } from './mechanic';

type TeleportDef = Extract<MechanicDef, { type: 'teleport' }>;

const COLORS = ['#27e8ff', '#ff5fa8', '#9dff4a'];
/** Ticks sin poder volver a usar un portal tras teletransportarse. */
const COOLDOWN = Math.round(0.9 * TICK_RATE);

interface Pair {
  a: TileXY;
  b: TileXY;
  color: string;
}

/** Portales por parejas (setas mágicas, agujeros de gusano…): entras por uno y sales por el otro. */
export class TeleportMechanic implements Mechanic {
  readonly kind = 'teleport';
  private pairs: Pair[] = [];
  private cooldown = 0;
  /** Último portal usado, para dibujarle una onda. */
  private flash: { tile: TileXY; ticks: number }[] = [];

  constructor(def: TeleportDef, lines: readonly string[], rng: Rng, avoid: TileXY[] = []) {
    // Los portales se reparten lo más lejos posible entre sí; se emparejan los que quedan opuestos.
    const spots = pickSpread(lines, def.pairs * 2, rng, undefined, avoid);
    for (let i = 0; i < def.pairs; i++) this.pairs.push({ a: spots[i], b: spots[spots.length - 1 - i], color: COLORS[i % COLORS.length] });
  }

  get portals(): TileXY[] {
    return this.pairs.flatMap((p) => [p.a, p.b]);
  }

  get count(): number {
    return this.pairs.length;
  }

  /** Dónde está el portal de salida de otro dado (para pruebas). */
  partner(tile: TileXY): TileXY | null {
    for (const p of this.pairs) {
      if (p.a.col === tile.col && p.a.row === tile.row) return p.b;
      if (p.b.col === tile.col && p.b.row === tile.row) return p.a;
    }
    return null;
  }

  update(env: MechanicEnv): void {
    for (const f of this.flash) f.ticks--;
    this.flash = this.flash.filter((f) => f.ticks > 0);
    if (this.cooldown > 0) {
      this.cooldown--;
      return;
    }
    const pac = env.pac;
    // Solo se activa cuando Pac-Man está casi en el centro del portal.
    if (Math.abs(pac.x - centerX(pac.col)) > 3 || Math.abs(pac.y - centerY(pac.row)) > 3) return;
    const dest = this.partner({ col: pac.col, row: pac.row });
    if (!dest) return;
    this.flash.push({ tile: { col: pac.col, row: pac.row }, ticks: 20 }, { tile: dest, ticks: 20 });
    pac.x = centerX(dest.col);
    pac.y = centerY(dest.row);
    this.cooldown = COOLDOWN;
    env.sfx('teleport');
  }

  onRespawn(): void {
    this.cooldown = 0;
  }

  draw(ctx: CanvasRenderingContext2D, frame: number): void {
    for (const p of this.pairs) {
      for (const t of [p.a, p.b]) {
        const x = centerX(t.col);
        const y = MAZE_TOP + centerY(t.row);
        ctx.save();
        ctx.translate(x, y);
        glow(ctx, p.color, 3);
        // Remolino: tres arcos que giran con distinta velocidad.
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1;
        ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          const r = 2.2 + i * 1.6;
          const a = frame * (0.12 + i * 0.05) * (i % 2 === 0 ? 1 : -1);
          ctx.beginPath();
          ctx.arc(0, 0, r, a, a + Math.PI * 1.25);
          ctx.stroke();
        }
        const fl = this.flash.find((f) => f.tile.col === t.col && f.tile.row === t.row);
        if (fl) {
          ctx.strokeStyle = `rgba(255,255,255,${fl.ticks / 20})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(0, 0, 4 + (20 - fl.ticks) * 0.5, 0, TAU);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }
}
