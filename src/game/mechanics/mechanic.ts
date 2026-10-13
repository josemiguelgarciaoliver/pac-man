import type { Ghost } from '../actors/ghost';
import type { PacMan } from '../actors/pacman';
import type { Maze } from '../maze/maze';
import type { Rng } from '../random';
import type { ViewEffects } from '../viewEffects';

import type { SfxKind } from '../../audio/audio';

export type { SfxKind };

export interface MechanicEnv {
  maze: Maze;
  pac: PacMan;
  ghosts: Ghost[];
  /** Efectos de vista y de mando (setas, fenómenos). */
  view: ViewEffects;
  /** Azar sin semilla fija (efectos de seta, etc.). */
  rng: Rng;
  /** Convierte a un fantasma en ojos (y suma puntos). */
  killGhost(ghost: Ghost): void;
  /** Un ayudante se come el punto de esa casilla (solo puntos normales). Devuelve si había uno. */
  eatDot(col: number, row: number): boolean;
  /** Una explosión (bomba…): las mecánicas que pueden romperse con ella se enteran por `onBlast`. */
  blast(x: number, y: number, radius: number): void;
  sfx(kind: SfxKind): void;
  /** Texto flotante sobre el laberinto (coordenadas del laberinto en px). */
  popup(text: string, x: number, y: number): void;
}

/**
 * Una mecánica de nivel (cintas, bombas, torretas…). Se aísla como plugin: el juego solo conoce
 * esta interfaz, así que cada mecánica nueva es un fichero más sin tocar el motor.
 */
export interface Mechanic {
  readonly kind: string;
  /** Disparo de la pistola de Pac-Man en (x, y): true si lo para (derriba algo suyo). */
  shotAt?(x: number, y: number, env: MechanicEnv): boolean;
  /** Explosión de radio `radius` (px) centrada en (x, y). */
  onBlast?(x: number, y: number, radius: number, env: MechanicEnv): void;
  /** Se llama una vez por tick mientras se juega. */
  update(env: MechanicEnv): void;
  /** ¿Mata a Pac-Man en este momento? (sierras, disparos, pinchos, explosiones) */
  hitsPac?(pac: PacMan): boolean;
  /**
   * Variación de velocidad (px/tick, con signo) que la mecánica impone a un fantasma activo.
   * Se suma a su velocidad en lugar de desplazarlo, para que nunca se salte el centro de una casilla.
   */
  ghostSpeedDelta?(ghost: Ghost): number;
  /** Multiplicador de la velocidad de Pac-Man en su posición actual (barro, etc.). */
  pacSpeedFactor?(pac: PacMan): number;
  /** Se llama al recolocar a todos tras perder una vida: devuelve los peligros a un estado justo. */
  onRespawn?(env: MechanicEnv): void;
  /** Se dibuja sobre las paredes y bajo los puntos. `frame` crece 1 por tick. */
  draw(ctx: CanvasRenderingContext2D, frame: number): void;
  /** Se dibuja sobre los puntos y bajo los personajes (sierras, disparos, bombas…). */
  drawOver?(ctx: CanvasRenderingContext2D, frame: number): void;
}
