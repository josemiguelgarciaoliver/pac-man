import { TICK_RATE, TILE } from '../constants';
import { bombSites, pickSpread, type BombSite, type TileXY } from '../level/placement';
import type { MechanicDef } from '../level/schema';
import type { PacMan } from '../actors/pacman';
import type { Rng } from '../random';
import { TAU, centerX, centerY, glow, screenY } from './geometry';
import type { Mechanic, MechanicEnv } from './mechanic';

type BombDef = Extract<MechanicDef, { type: 'bomb' }>;

/** Distancia (en casillas, Manhattan) a la que Pac-Man arma una bomba. */
const ARM_DISTANCE = 6;
const BOOM_TICKS = 34;
/** La onda expansiva alcanza esto (en casillas) más allá del radio de las paredes derribadas. */
const SHOCKWAVE_EXTRA = 1.6;

interface Bomb {
  site: BombSite;
  phase: 'idle' | 'fuse' | 'boom' | 'done';
  ticks: number;
}

const manhattan = (aCol: number, aRow: number, bCol: number, bRow: number) => Math.abs(aCol - bCol) + Math.abs(aRow - bRow);

/**
 * Bombas: están inertes hasta que Pac-Man se acerca; entonces arden unos segundos mostrando la zona
 * de peligro y estallan. La explosión derriba las paredes del radio (abriendo un atajo), mata a Pac-Man
 * si sigue dentro y convierte en ojos a los fantasmas que pille.
 */
export class BombMechanic implements Mechanic {
  readonly kind = 'bomb';
  private bombs: Bomb[] = [];
  private hit = false;

  constructor(
    private readonly def: BombDef,
    lines: readonly string[],
    rng: Rng,
    avoid: TileXY[] = [],
  ) {
    const sites = bombSites(lines).filter((t) => def.area !== 'bottom' || t.row >= 15);
    const picked = pickSpread(lines, Math.min(def.count, sites.length), rng, sites, avoid);
    for (const t of picked) {
      const site = sites.find((s) => s.col === t.col && s.row === t.row)!;
      this.bombs.push({ site, phase: 'idle', ticks: 0 });
    }
  }

  /** Emplazamientos elegidos (para pruebas). */
  get sites(): BombSite[] {
    return this.bombs.map((b) => b.site);
  }

  get count(): number {
    return this.bombs.length;
  }

  /** Radio letal en px: quien esté más cerca que esto del centro cuando estalla, muere (aunque haya paredes). */
  get lethalRadius(): number {
    return (this.def.radius + SHOCKWAVE_EXTRA) * TILE;
  }

  /** Casillas dentro del radio de la explosión. */
  private blastTiles(b: Bomb): { col: number; row: number }[] {
    const out: { col: number; row: number }[] = [];
    const R = this.def.radius;
    for (let dr = -R; dr <= R; dr++) for (let dc = -R; dc <= R; dc++) if (Math.abs(dc) + Math.abs(dr) <= R) out.push({ col: b.site.col + dc, row: b.site.row + dr });
    return out;
  }

  update(env: MechanicEnv): void {
    const pac = env.pac;
    for (const b of this.bombs) {
      if (b.phase === 'idle') {
        if (manhattan(pac.col, pac.row, b.site.col, b.site.row) <= ARM_DISTANCE) {
          b.phase = 'fuse';
          b.ticks = Math.round(this.def.fuseSeconds * TICK_RATE);
          env.sfx('tick');
        }
      } else if (b.phase === 'fuse') {
        b.ticks--;
        if (b.ticks > 0 && b.ticks % TICK_RATE === 0) env.sfx('tick');
        if (b.ticks <= 0) this.explode(b, env);
      } else if (b.phase === 'boom') {
        if (--b.ticks <= 0) b.phase = 'done';
      }
    }
  }

  private explode(b: Bomb, env: MechanicEnv): void {
    const blast = this.blastTiles(b);
    for (const t of blast) env.maze.destroyWall(t.col, t.row);
    const cx = centerX(b.site.col);
    const cy = centerY(b.site.row);
    const lethal = (x: number, y: number) => Math.hypot(x - cx, y - cy) <= this.lethalRadius;
    if (lethal(env.pac.x, env.pac.y)) this.hit = true;
    for (const g of env.ghosts) if (g.state === 'active' && lethal(g.x, g.y)) env.killGhost(g);
    b.phase = 'boom';
    b.ticks = BOOM_TICKS;
    env.sfx('explosion');
  }

  hitsPac(_pac: PacMan): boolean {
    const h = this.hit;
    this.hit = false;
    return h;
  }

  onRespawn(): void {
    // Las bombas armadas vuelven a dormir; las ya estalladas siguen abiertas.
    for (const b of this.bombs) if (b.phase === 'fuse') b.phase = 'idle';
    this.hit = false;
  }

  draw(ctx: CanvasRenderingContext2D, frame: number): void {
    // Zona de peligro mientras arde la mecha: todo lo que cae dentro del círculo morirá.
    for (const b of this.bombs) {
      if (b.phase !== 'fuse') continue;
      const urgency = 1 - b.ticks / (this.def.fuseSeconds * TICK_RATE);
      const pulse = 0.2 + 0.22 * Math.abs(Math.sin(frame / (10 - urgency * 6)));
      const x = centerX(b.site.col);
      const y = screenY(b.site.row);
      const r = this.lethalRadius;
      ctx.save();
      const g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r);
      g.addColorStop(0, `rgba(255, 70, 40, ${pulse + urgency * 0.2})`);
      g.addColorStop(1, `rgba(255, 40, 30, ${(pulse + urgency * 0.2) * 0.55})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 120, 90, ${0.5 + 0.4 * Math.sin(frame / 4)})`;
      ctx.lineWidth = 0.9;
      ctx.setLineDash([2.5, 2.5]);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawOver(ctx: CanvasRenderingContext2D, frame: number): void {
    for (const b of this.bombs) {
      if (b.phase === 'done') continue;
      const x = centerX(b.site.col);
      const y = screenY(b.site.row);
      if (b.phase === 'boom') {
        this.drawExplosion(ctx, b, x, y);
        continue;
      }
      // Grietas en la pared que la explosión va a abrir.
      if (b.phase === 'idle') {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,200,120,0.75)';
        ctx.lineWidth = 0.7;
        const { dc, dr } = b.site;
        for (let k = 1; k <= 2; k++) {
          const wx = x + dc * k * TILE;
          const wy = y + dr * k * TILE;
          ctx.beginPath();
          ctx.moveTo(wx - 2.5, wy - 1);
          ctx.lineTo(wx - 0.5, wy + 0.5);
          ctx.lineTo(wx + 0.5, wy - 1.5);
          ctx.lineTo(wx + 2.5, wy + 1);
          ctx.stroke();
        }
        ctx.restore();
      }
      this.drawBomb(ctx, b, x, y, frame);
    }
  }

  private drawBomb(ctx: CanvasRenderingContext2D, b: Bomb, x: number, y: number, frame: number): void {
    const fuse = b.phase === 'fuse';
    const secondsLeft = fuse ? b.ticks / TICK_RATE : this.def.fuseSeconds;
    const blink = fuse && Math.floor(frame / Math.max(2, secondsLeft * 3)) % 2 === 0;
    ctx.save();
    ctx.translate(x, y + 0.5);
    if (fuse) glow(ctx, '#ff3c28', 3);
    const g = ctx.createRadialGradient(-1.6, -1.8, 0.5, 0, 0, 5);
    g.addColorStop(0, blink ? '#ff9a80' : '#6a6f86');
    g.addColorStop(1, blink ? '#c4220f' : '#1c1e2e');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0.6, 4.4, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Mecha con chispa.
    ctx.strokeStyle = '#d9b36a';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(1.6, -3);
    ctx.quadraticCurveTo(3.4, -5, 2.4, -6.4);
    ctx.stroke();
    ctx.fillStyle = Math.floor(frame / 3) % 2 === 0 ? '#ffe680' : '#ff8a30';
    ctx.beginPath();
    ctx.arc(2.4, -6.6, 1.2, 0, TAU);
    ctx.fill();
    ctx.restore();
    if (fuse) {
      // Cuenta atrás sobre la bomba.
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.font = "800 6.5px 'Trebuchet MS', Arial, sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText(String(Math.ceil(secondsLeft)), x, y - 9);
      ctx.restore();
    }
  }

  private drawExplosion(ctx: CanvasRenderingContext2D, b: Bomb, x: number, y: number): void {
    const t = 1 - b.ticks / BOOM_TICKS;
    const R = (this.def.radius + 0.7) * TILE;
    ctx.save();
    glow(ctx, '#ff9a30', 6);
    const g = ctx.createRadialGradient(x, y, 0, x, y, R * (0.4 + t * 0.9));
    g.addColorStop(0, `rgba(255,255,230,${0.95 * (1 - t)})`);
    g.addColorStop(0.4, `rgba(255,170,40,${0.8 * (1 - t)})`);
    g.addColorStop(1, 'rgba(255,60,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, R * (0.4 + t * 0.9), 0, TAU);
    ctx.fill();
    // Chispas que salen despedidas.
    ctx.fillStyle = `rgba(255,220,120,${1 - t})`;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + i;
      const d = R * (0.3 + t * 1.3) * (0.7 + 0.3 * ((i * 7) % 5) / 5);
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.2 * (1 - t) + 0.3, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

// `centerY` se reexporta para las pruebas de colocación.
export { centerY };
