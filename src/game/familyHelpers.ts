import { FAMILY } from '../data/family';
import { MAZE_TOP, TICK_RATE, TILE } from './constants';
import { shortestPath, type TileXY } from './level/placement';

const HINT_TICKS = 3 * TICK_RATE;
const DECOY_TICKS = 4 * TICK_RATE;
const TAU = Math.PI * 2;

/**
 * Las dos habilidades de los hijos de Pac-Man, una carga por nivel:
 *  - Aina (Pista): marca durante 3 s el camino más corto hasta el objetivo.
 *  - Aleix (Señuelo): deja un juguete que atrae a los fantasmas durante 4 s.
 * Aina se recarga al comer una fruta.
 */
export class FamilyHelpers {
  ainaReady = true;
  aleixReady = true;
  private hintTicks = 0;
  private hintPath: TileXY[] = [];
  private decoyTicks = 0;
  private decoyTile: TileXY | null = null;

  reset(): void {
    this.ainaReady = true;
    this.aleixReady = true;
    this.hintTicks = 0;
    this.hintPath = [];
    this.decoyTicks = 0;
    this.decoyTile = null;
  }

  /** El señuelo activo, si lo hay: los fantasmas lo persiguen en lugar de a Pac-Man. */
  get decoy(): TileXY | null {
    return this.decoyTicks > 0 ? this.decoyTile : null;
  }

  rechargeAina(): void {
    this.ainaReady = true;
  }

  /** Pista hacia `target` desde `from`. Devuelve false si no había carga u objetivo. */
  useAina(lines: readonly string[], from: TileXY, target: TileXY | null): boolean {
    if (!this.ainaReady || !target) return false;
    const path = shortestPath(lines, from, target);
    if (!path) return false;
    this.ainaReady = false;
    this.hintPath = path;
    this.hintTicks = HINT_TICKS;
    return true;
  }

  useAleix(at: TileXY): boolean {
    if (!this.aleixReady) return false;
    this.aleixReady = false;
    this.decoyTile = { ...at };
    this.decoyTicks = DECOY_TICKS;
    return true;
  }

  update(): void {
    if (this.hintTicks > 0) this.hintTicks--;
    if (this.decoyTicks > 0) this.decoyTicks--;
  }

  draw(ctx: CanvasRenderingContext2D, frame: number): void {
    if (this.hintTicks > 0 && this.hintPath.length > 1) this.drawHint(ctx, frame);
    if (this.decoyTicks > 0 && this.decoyTile) this.drawDecoy(ctx, frame);
  }

  private drawHint(ctx: CanvasRenderingContext2D, frame: number): void {
    const fade = Math.min(1, this.hintTicks / 30);
    const color = FAMILY.aina.color;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = ctx.getTransform().a * 3;
    ctx.fillStyle = color;
    this.hintPath.forEach((t, i) => {
      // Una "ola" de brillo recorre el camino.
      const wave = 0.45 + 0.55 * Math.max(0, Math.sin(i * 0.7 - frame / 4));
      ctx.globalAlpha = fade * wave;
      ctx.beginPath();
      ctx.arc(t.col * TILE + TILE / 2, MAZE_TOP + t.row * TILE + TILE / 2, i === this.hintPath.length - 1 ? 3.4 : 1.9, 0, TAU);
      ctx.fill();
    });
    ctx.restore();
  }

  private drawDecoy(ctx: CanvasRenderingContext2D, frame: number): void {
    const t = this.decoyTile!;
    const x = t.col * TILE + TILE / 2;
    const y = MAZE_TOP + t.row * TILE + TILE / 2;
    const color = FAMILY.aleix.color;
    const left = this.decoyTicks / DECOY_TICKS;
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = color;
    ctx.shadowBlur = ctx.getTransform().a * 3;
    // Juguete: una pelota que rebota, con un anillo que marca el tiempo que queda.
    const bounce = Math.abs(Math.sin(frame / 7)) * 2.4;
    const g = ctx.createRadialGradient(-1.2, -1.2 - bounce, 0.3, 0, -bounce, 4);
    g.addColorStop(0, '#fff3d6');
    g.addColorStop(1, color);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, -bounce, 3.6, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(0, 0, 6.4, -Math.PI / 2, -Math.PI / 2 + TAU * left);
    ctx.stroke();
    ctx.restore();
  }
}
