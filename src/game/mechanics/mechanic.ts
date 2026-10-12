import type { Ghost } from '../actors/ghost';
import type { PacMan } from '../actors/pacman';
import type { Maze } from '../maze/maze';

export interface MechanicEnv {
  maze: Maze;
  pac: PacMan;
  ghosts: Ghost[];
}

/**
 * Una mecánica de nivel (cintas, trampas, corrientes…). Se aísla como plugin: el juego solo
 * conoce esta interfaz, así que cada mecánica nueva es un fichero más sin tocar el motor.
 */
export interface Mechanic {
  readonly kind: string;
  /** Se llama una vez por tick mientras se juega. */
  update(env: MechanicEnv): void;
  /**
   * Variación de velocidad (px/tick, con signo) que la mecánica impone a un fantasma activo.
   * Se suma a su velocidad en lugar de desplazarlo, para que nunca se salte el centro de una casilla.
   */
  ghostSpeedDelta?(ghost: Ghost): number;
  /** Se dibuja sobre las paredes y bajo los puntos. `frame` crece 1 por tick. */
  draw(ctx: CanvasRenderingContext2D, frame: number): void;
}
