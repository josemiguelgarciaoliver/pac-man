export const TILE = 8;
export const MAZE_COLS = 28;
export const MAZE_ROWS = 31;
/** Resolución lógica del arcade original (224×288). */
export const SCREEN_W = MAZE_COLS * TILE;
export const SCREEN_H = 36 * TILE;
/** Altura del HUD sobre el laberinto (3 filas de tiles). */
export const MAZE_TOP = 3 * TILE;
export const TICK_RATE = 60;

/** 100 % de velocidad en px/s según The Pac-Man Dossier. */
export const BASE_SPEED = 75.75;

export const COLORS = {
  wall: '#2121de',
  wallFlash: '#ffffff',
  dot: '#ffb8ae',
  door: '#ffb8de',
  pac: '#ffff00',
  text: '#ffffff',
  ready: '#ffff00',
} as const;

export enum Dir {
  Up = 0,
  Left = 1,
  Down = 2,
  Right = 3,
}

export const DIRS = [
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 0 },
] as const;

export const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir;
