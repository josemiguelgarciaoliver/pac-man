import { FAMILY } from '../../data/family';
import { drawFace } from '../faces';
import { MAZE_TOP, TICK_RATE, TILE } from '../constants';
import { pickSpread, shortestPath, type TileXY } from '../level/placement';
import type { MechanicDef } from '../level/schema';
import type { Rng } from '../random';
import { TAU, centerX, centerY, glow } from './geometry';
import type { Mechanic, MechanicEnv } from './mechanic';

type CompanionDef = Extract<MechanicDef, { type: 'companion' }>;

/**
 * Cada hijo ayuda a su manera:
 *  - Aleix (8 años) es rápido y travieso: va a por el fantasma más cercano a él.
 *  - Aina (12) es más pausada pero protectora: va a por el fantasma más cercano a Pac-Man.
 */
const PROFILE: Record<'aleix' | 'aina', { speed: number; seconds: number; target: 'self' | 'pac'; shirt: string }> = {
  aleix: { speed: 1.5, seconds: 10, target: 'self', shirt: '#ff8a1f' },
  aina: { speed: 1.2, seconds: 14, target: 'pac', shirt: '#3da4ff' },
};

/** Ticks hasta que una miniatura recogida vuelve a aparecer en el laberinto. */
const REGROW_TICKS = 28 * TICK_RATE;
/** A esta distancia (px) la miniatura alcanza a un fantasma. */
const CATCH_DISTANCE = 6.5;
/** Cada cuántos ticks se recalcula el camino hacia el objetivo. */
const REPLAN_EVERY = 6;

interface Token {
  tile: TileXY;
  regrow: number;
}

interface Helper {
  x: number;
  y: number;
  ticks: number;
  path: TileXY[];
  replan: number;
  dx: number;
  dy: number;
}

/**
 * Miniaturas con la cara de Aleix y de Aina: al coger su insignia, aparece el hijo en miniatura y
 * persigue a los fantasmas durante unos segundos; cada uno al que alcanza se convierte en ojos, y
 * se come los puntos que va pisando (Pac-Man ya no tiene que recogerlos).
 * Son invulnerables y, si no hay a quién cazar, acompañan a Pac-Man. Las caras se pueden sustituir
 * por fotos (public/assets/faces/aleix.png y aina.png).
 */
export class CompanionMechanic implements Mechanic {
  readonly kind = 'companion';
  private tokens: Token[] = [];
  private helper: Helper | null = null;
  private readonly who: 'aleix' | 'aina';
  private readonly seconds: number;

  constructor(
    def: CompanionDef,
    private readonly lines: readonly string[],
    rng: Rng,
    avoid: TileXY[] = [],
  ) {
    this.who = def.who;
    this.seconds = def.seconds ?? PROFILE[def.who].seconds;
    for (const tile of pickSpread(lines, def.count, rng, undefined, avoid)) this.tokens.push({ tile, regrow: 0 });
  }

  get count(): number {
    return this.tokens.length;
  }

  get tiles(): TileXY[] {
    return this.tokens.map((t) => t.tile);
  }

  /** La miniatura activa (para pruebas). */
  get active(): { x: number; y: number; ticks: number } | null {
    return this.helper ? { x: this.helper.x, y: this.helper.y, ticks: this.helper.ticks } : null;
  }

  update(env: MechanicEnv): void {
    const pac = env.pac;
    for (const t of this.tokens) {
      if (t.regrow > 0) {
        // Si Pac-Man sigue encima cuando toca reaparecer, espera: no se recoge algo que no se ha visto aparecer.
        if (t.regrow === 1 && t.tile.col === pac.col && t.tile.row === pac.row) continue;
        t.regrow--;
        continue;
      }
      if (t.tile.col !== pac.col || t.tile.row !== pac.row) continue;
      t.regrow = REGROW_TICKS;
      this.summon(env);
    }
    if (this.helper) this.stepHelper(env, this.helper);
  }

  private summon(env: MechanicEnv): void {
    // Aparece junto a Pac-Man; si ya había una, se renueva el tiempo.
    this.helper = { x: env.pac.x, y: env.pac.y, ticks: Math.round(this.seconds * TICK_RATE), path: [], replan: 0, dx: 1, dy: 0 };
    env.sfx(this.who);
    env.popup(`${FAMILY[this.who].name} AYUDA`, env.pac.x, env.pac.y - 10);
  }

  private stepHelper(env: MechanicEnv, h: Helper): void {
    if (--h.ticks <= 0) {
      this.helper = null;
      return;
    }
    // Se come los puntos por los que pasa.
    env.eatDot(Math.floor(h.x / TILE), Math.floor(h.y / TILE));
    // Cacería: toca al fantasma que esté al alcance.
    for (const g of env.ghosts) {
      if (g.state !== 'active') continue;
      if (Math.hypot(g.x - h.x, g.y - h.y) < CATCH_DISTANCE) env.killGhost(g);
    }

    const from = { col: Math.floor(h.x / TILE), row: Math.floor(h.y / TILE) };
    if (--h.replan <= 0 || h.path.length === 0) {
      h.replan = REPLAN_EVERY;
      h.path = this.plan(env, h, from);
    }
    // Avanza por el camino hacia el centro de la siguiente casilla.
    let budget = PROFILE[this.who].speed;
    while (budget > 0 && h.path.length > 1) {
      const next = h.path[1];
      if (!env.maze.isWalkable(next.col, next.row)) break; // puerta cerrada: espera
      const tx = centerX(next.col);
      const ty = centerY(next.row);
      // Salto por el túnel: si la casilla destino está al otro lado, se coloca allí.
      if (Math.abs(next.col - from.col) > 1) {
        h.x = tx;
        h.y = ty;
        h.path.shift();
        break;
      }
      const dist = Math.hypot(tx - h.x, ty - h.y);
      if (dist < 0.01) {
        h.path.shift();
        continue;
      }
      const step = Math.min(budget, dist);
      h.dx = (tx - h.x) / dist;
      h.dy = (ty - h.y) / dist;
      h.x += h.dx * step;
      h.y += h.dy * step;
      budget -= step;
      if (step === dist) h.path.shift();
    }
  }

  /** Camino hacia el fantasma elegido según el perfil, o hacia Pac-Man si no hay a quién cazar. */
  private plan(env: MechanicEnv, h: Helper, from: TileXY): TileXY[] {
    const ghosts = env.ghosts.filter((g) => g.state === 'active');
    const ref = PROFILE[this.who].target === 'pac' ? { x: env.pac.x, y: env.pac.y } : { x: h.x, y: h.y };
    ghosts.sort((a, b) => Math.hypot(a.x - ref.x, a.y - ref.y) - Math.hypot(b.x - ref.x, b.y - ref.y));
    const target = ghosts[0] ? { col: Math.min(27, Math.max(0, ghosts[0].col)), row: ghosts[0].row } : { col: env.pac.col, row: env.pac.row };
    if (from.col === target.col && from.row === target.row) return [from];
    return shortestPath(this.lines, from, target) ?? [];
  }

  onRespawn(): void {
    this.helper = null;
  }

  draw(): void {
    /* se dibuja sobre los puntos */
  }

  drawOver(ctx: CanvasRenderingContext2D, frame: number): void {
    const color = FAMILY[this.who].color;
    for (const t of this.tokens) {
      if (t.regrow > 0) continue;
      this.drawToken(ctx, centerX(t.tile.col), MAZE_TOP + centerY(t.tile.row) + Math.sin(frame / 10 + t.tile.col) * 0.8, color, frame);
    }
    if (this.helper) this.drawHelper(ctx, this.helper, color, frame);
  }

  /** Insignia: la cara de quien ayuda dentro de un aro de su color. */
  private drawToken(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, frame: number): void {
    ctx.save();
    ctx.translate(x, y);
    glow(ctx, color, 4);
    ctx.fillStyle = 'rgba(8,10,40,0.85)';
    ctx.beginPath();
    ctx.arc(0, 0, 5.6, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.shadowBlur = 0;
    drawFace(ctx, this.who, 4.2);
    // Destello giratorio para que destaque entre los puntos.
    ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.4 * Math.sin(frame / 6)})`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.arc(0, 0, 7.4, frame / 14, frame / 14 + 1.1);
    ctx.stroke();
    ctx.restore();
  }

  /** Miniatura corriendo: cabeza con su cara, camiseta y piernas que se mueven. */
  private drawHelper(ctx: CanvasRenderingContext2D, h: Helper, color: string, frame: number): void {
    const x = h.x;
    const y = MAZE_TOP + h.y;
    const stride = Math.sin(frame * 0.6) * 1.6;
    const fading = h.ticks < 2 * TICK_RATE && Math.floor(frame / 4) % 2 === 0;
    ctx.save();
    ctx.globalAlpha = fading ? 0.45 : 1;
    ctx.translate(x, y);
    // Halo y estela de chispas.
    glow(ctx, color, 5);
    ctx.fillStyle = color;
    for (let i = 1; i <= 3; i++) {
      ctx.globalAlpha = (fading ? 0.45 : 1) * (0.5 - i * 0.12);
      ctx.beginPath();
      ctx.arc(-h.dx * i * 2.6, -h.dy * i * 2.6 + 1, 1.4 - i * 0.25, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = fading ? 0.45 : 1;
    ctx.shadowBlur = 0;
    // Sombra, piernas y camiseta.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 5.2, 3.6, 1.2, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#2d3358';
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-1, 2.4);
    ctx.lineTo(-1 + stride, 5);
    ctx.moveTo(1, 2.4);
    ctx.lineTo(1 - stride, 5);
    ctx.stroke();
    ctx.fillStyle = PROFILE[this.who].shirt;
    ctx.beginPath();
    ctx.roundRect(-2.6, -0.6, 5.2, 3.6, 1.2);
    ctx.fill();
    // Cabeza con la cara.
    ctx.translate(0, -3.4);
    drawFace(ctx, this.who, 4.4);
    ctx.restore();
  }
}
