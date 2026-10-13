import { FAMILY } from '../data/family';
import { MAZE_TOP, TICK_RATE, TILE } from './constants';
import type { TileXY } from './level/placement';

/** Duración del señuelo de Aleix. */
export const DECOY_TICKS = 8 * TICK_RATE;
const BLAST_TICKS = 28;
const TAU = Math.PI * 2;

/**
 * Las dos habilidades de los hijos de Pac-Man, una carga por nivel:
 *  - Aina (Bomba): una explosión que lanza por los aires a los fantasmas cercanos, alejándolos.
 *  - Aleix (Señuelo): deja un juguete que atrae a los fantasmas durante 8 s.
 * Aina se recarga al comer una fruta.
 */
export class FamilyHelpers {
  ainaReady = true;
  aleixReady = true;
  private blast: { x: number; y: number; ticks: number } | null = null;
  private decoyTicks = 0;
  private decoyTile: TileXY | null = null;

  reset(): void {
    this.ainaReady = true;
    this.aleixReady = true;
    this.blast = null;
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

  /** Aina lanza su bomba desde (x, y) en px del laberinto. Devuelve false si no había carga. */
  useAina(x: number, y: number): boolean {
    if (!this.ainaReady) return false;
    this.ainaReady = false;
    this.blast = { x, y, ticks: BLAST_TICKS };
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
    if (this.blast && --this.blast.ticks <= 0) this.blast = null;
    if (this.decoyTicks > 0) this.decoyTicks--;
  }

  draw(ctx: CanvasRenderingContext2D, _frame: number): void {
    if (this.blast) this.drawBlast(ctx, this.blast);
    if (this.decoyTicks > 0 && this.decoyTile) this.drawDecoy(ctx, _frame);
  }

  /** Onda expansiva celeste: un anillo que se agranda y un destello en el centro. */
  private drawBlast(ctx: CanvasRenderingContext2D, b: { x: number; y: number; ticks: number }): void {
    const t = 1 - b.ticks / BLAST_TICKS;
    const color = FAMILY.aina.color;
    const y = MAZE_TOP + b.y;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = ctx.getTransform().a * 5;
    for (let k = 0; k < 2; k++) {
      const r = Math.max(0, t * 110 - k * 14);
      ctx.strokeStyle = `rgba(190,235,255,${(1 - t) * (0.9 - k * 0.3)})`;
      ctx.lineWidth = 3 - k;
      ctx.beginPath();
      ctx.arc(b.x, y, r, 0, TAU);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - t) ** 2})`;
    ctx.beginPath();
    ctx.arc(b.x, y, 6 + t * 10, 0, TAU);
    ctx.fill();
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
