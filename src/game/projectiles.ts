import type { Ghost } from './actors/ghost';
import { DIRS, Dir, MAZE_TOP, TILE } from './constants';
import type { Maze } from './maze/maze';

/** Velocidad del disparo (px/tick, en pasos de 1 px para no atravesar paredes ni fantasmas). */
const SPEED = 4;
/** Pausa entre disparos (ticks): unos 3 por segundo. */
const COOLDOWN = 18;
/** Distancia (px) a la que un disparo alcanza a un fantasma. */
const HIT_DISTANCE = 6;
const TAU = Math.PI * 2;

interface Bullet {
  x: number;
  y: number;
  dir: Dir;
  /** Ticks de vida (por si algo raro lo dejara volando). */
  life: number;
}

/**
 * Los disparos de Pac-Man con el blaster: salen en la dirección en que mira, chocan con las
 * paredes y convierten en ojos al primer fantasma que alcanzan.
 */
export class Projectiles {
  private bullets: Bullet[] = [];
  private cooldown = 0;
  /** Destello de la boca del cañón. */
  private flash: { x: number; y: number; dir: Dir; ticks: number } | null = null;

  get count(): number {
    return this.bullets.length;
  }

  /** Posiciones de los disparos en vuelo (para pruebas). */
  get positions(): { x: number; y: number }[] {
    return this.bullets.map((b) => ({ x: b.x, y: b.y }));
  }

  clear(): void {
    this.bullets = [];
    this.cooldown = 0;
    this.flash = null;
  }

  /** Dispara desde (x, y) hacia `dir`. Devuelve false si el cañón aún se está enfriando. */
  tryFire(x: number, y: number, dir: Dir): boolean {
    if (this.cooldown > 0) return false;
    const d = DIRS[dir];
    this.bullets.push({ x: x + d.x * 6, y: y + d.y * 6, dir, life: 240 });
    this.flash = { x: x + d.x * 7, y: y + d.y * 7, dir, ticks: 5 };
    this.cooldown = COOLDOWN;
    return true;
  }

  update(maze: Maze, ghosts: readonly Ghost[], kill: (g: Ghost) => void): void {
    if (this.cooldown > 0) this.cooldown--;
    if (this.flash && --this.flash.ticks <= 0) this.flash = null;
    for (const b of this.bullets) {
      const d = DIRS[b.dir];
      b.life--;
      for (let i = 0; i < SPEED && b.life > 0; i++) {
        b.x += d.x;
        b.y += d.y;
        const outside = b.x < -TILE || b.x > maze.cols * TILE + TILE;
        if (outside || !maze.isWalkable(Math.floor(b.x / TILE), Math.floor(b.y / TILE))) {
          b.life = 0;
          break;
        }
        const target = ghosts.find((g) => g.state === 'active' && Math.hypot(g.x - b.x, g.y - b.y) < HIT_DISTANCE);
        if (target) {
          kill(target);
          b.life = 0;
        }
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.shadowColor = '#ff9a45';
    ctx.shadowBlur = ctx.getTransform().a * 4;
    for (const b of this.bullets) {
      const d = DIRS[b.dir];
      const y = MAZE_TOP + b.y;
      // Estela alargada hacia atrás con la cabeza brillante.
      const g = ctx.createLinearGradient(b.x - d.x * 9, y - d.y * 9, b.x, y);
      g.addColorStop(0, 'rgba(255,140,60,0)');
      g.addColorStop(1, 'rgba(255,240,190,1)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(b.x - d.x * 9, y - d.y * 9);
      ctx.lineTo(b.x, y);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x, y, 1.6, 0, TAU);
      ctx.fill();
    }
    if (this.flash) {
      const f = this.flash;
      ctx.fillStyle = `rgba(255,220,140,${f.ticks / 5})`;
      ctx.beginPath();
      ctx.arc(f.x, MAZE_TOP + f.y, 2.4 + (5 - f.ticks) * 0.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}
