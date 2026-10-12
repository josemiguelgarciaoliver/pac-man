import { MAZE_TOP, TILE } from '../constants';

/** Centro de una casilla en coordenadas del laberinto (px). */
export const centerX = (col: number): number => col * TILE + TILE / 2;
export const centerY = (row: number): number => row * TILE + TILE / 2;

/** Centro de una casilla en coordenadas de pantalla (con el HUD de arriba). */
export const screenY = (row: number): number => MAZE_TOP + centerY(row);

export const TAU = Math.PI * 2;

/** Brillo de neón: usa la transformación actual para que el desenfoque se vea igual a cualquier resolución. */
export function glow(ctx: CanvasRenderingContext2D, color: string, amount = 3): void {
  ctx.shadowColor = color;
  ctx.shadowBlur = ctx.getTransform().a * amount;
}
