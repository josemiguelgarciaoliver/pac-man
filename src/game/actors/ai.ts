import { DIRS, Dir } from '../constants';

export type GhostName = 'blinky' | 'pinky' | 'inky' | 'clyde';
export interface Tile {
  col: number;
  row: number;
}

/** Esquinas de dispersión (fuera del laberinto, como en el original). */
export const SCATTER_TARGETS: Record<GhostName, Tile> = {
  blinky: { col: 25, row: -3 },
  pinky: { col: 2, row: -3 },
  inky: { col: 27, row: 31 },
  clyde: { col: 0, row: 31 },
};

/** Casilla de entrada a la casa que buscan los ojos. */
export const HOUSE_DOOR_TILE: Tile = { col: 13, row: 11 };

/**
 * Casilla objetivo en modo persecución. Replica los *bugs* del arcade:
 * con Pac-Man mirando arriba, el objetivo de Pinky e Inky también se desplaza a la izquierda.
 */
export function chaseTarget(name: GhostName, ghost: Tile, pac: Tile & { dir: Dir }, blinky: Tile): Tile {
  const d = DIRS[pac.dir];
  const ahead = (n: number): Tile => ({
    col: pac.col + d.x * n - (pac.dir === Dir.Up ? n : 0),
    row: pac.row + d.y * n,
  });
  switch (name) {
    case 'blinky':
      return { col: pac.col, row: pac.row };
    case 'pinky':
      return ahead(4);
    case 'inky': {
      const ref = ahead(2);
      return { col: ref.col * 2 - blinky.col, row: ref.row * 2 - blinky.row };
    }
    case 'clyde': {
      const dx = ghost.col - pac.col;
      const dy = ghost.row - pac.row;
      return dx * dx + dy * dy > 64 ? { col: pac.col, row: pac.row } : SCATTER_TARGETS.clyde;
    }
  }
}
