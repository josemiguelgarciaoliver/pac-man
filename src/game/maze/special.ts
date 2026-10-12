import { ORIGINAL_MAZE } from '../../data/mazes/original';
import { MAZE_COLS, MAZE_ROWS } from '../constants';
import { createRng, type Rng } from '../random';
import { REQUIRED_OPEN, reachableTiles } from './generator';

/**
 * Laberintos "raros": distribuciones que rompen el estilo de pasillos de una casilla del arcade.
 * Conservan la banda central del original (casa de fantasmas y túnel) y los bordes, pero el
 * resto cambia por completo: una arena sin paredes interiores, un anillo, bosques de postes…
 */
export type SpecialKind = 'arena' | 'ring' | 'pillars' | 'hall' | 'throne' | 'grid' | 'lake' | 'crater' | 'asteroids';

const MID = 13;
const CENTER_BAND = ORIGINAL_MAZE.slice(9, 20);
/** Zonas libres a rellenar: arriba (filas 1–8) y abajo (filas 20–29). */
const REGIONS = [
  { first: 1, last: 8 },
  { first: 20, last: 29 },
];

type Grid = boolean[][]; // true = pared

function blank(): Grid {
  return Array.from({ length: MAZE_ROWS }, (_, r) => Array.from({ length: MAZE_COLS }, (_, c) => r === 0 || r === MAZE_ROWS - 1 || c === 0 || c === MAZE_COLS - 1));
}

const inRegion = (r: number) => REGIONS.some((g) => r >= g.first && r <= g.last);

/** Pone una pared (y su espejo) si cae en una zona libre y no bloquea una casilla obligatoria. */
function wall(grid: Grid, c: number, r: number): void {
  if (!inRegion(r) || c < 1 || c > MAZE_COLS - 2) return;
  if (REQUIRED_OPEN.some(([rc, rr]) => (rc === c || rc === MAZE_COLS - 1 - c) && rr === r)) return;
  grid[r][c] = true;
  grid[r][MAZE_COLS - 1 - c] = true;
}

function block(grid: Grid, c0: number, r0: number, w: number, h: number): void {
  for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) wall(grid, c, r);
}

function carve(grid: Grid, kind: SpecialKind, rng: Rng): void {
  switch (kind) {
    case 'arena':
      break; // sin paredes interiores
    case 'pillars':
      // Postes de 2×2 repartidos como árboles en un claro.
      for (const c of [3, 7, 11]) {
        block(grid, c, 3, 2, 2);
        block(grid, c, 21, 2, 2);
        block(grid, c, 26, 2, 2);
      }
      break;
    case 'hall':
      // Sala hipóstila: columnas sueltas de 1×1 cada tres casillas.
      for (const c of [3, 6, 9, 12]) for (const r of [3, 6, 22, 25, 28]) wall(grid, c, r);
      break;
    case 'throne':
      // Salón del trono: dos hileras de columnas con un gran pasillo central libre.
      for (const c of [4, 8, 11]) for (const r of [3, 6, 21, 24, 27]) block(grid, c, r, 1, 2);
      break;
    case 'crater':
      // Cráter: un bloque grande de roca en cada zona y grietas más pequeñas alrededor.
      block(grid, 5, 3, 8, 3);
      block(grid, 5, 22, 8, 2);
      block(grid, 5, 26, 8, 2);
      block(grid, 2, 7, 2, 1);
      block(grid, 2, 28, 2, 1);
      break;
    case 'grid':
      // Rejilla de postes: un pasillo de una casilla en cada dirección.
      for (const c of [3, 5, 7, 9, 11]) for (const r of [3, 5, 7, 22, 24, 26, 28]) wall(grid, c, r);
      break;
    case 'ring':
      // Un gran bloque central rodeado por un pasillo ancho.
      block(grid, 4, 3, 10, 4);
      block(grid, 4, 22, 6, 6);
      break;
    case 'lake':
      // Grandes bloques (lagos de hielo, cráteres…) en un campo abierto.
      block(grid, 3, 2, 5, 3);
      block(grid, 9, 5, 4, 2);
      block(grid, 3, 21, 5, 3);
      block(grid, 3, 26, 4, 3);
      block(grid, 9, 25, 3, 2);
      break;
    case 'asteroids': {
      // Rocas sueltas de una o dos casillas, repartidas con semilla.
      for (let i = 0; i < 22; i++) {
        const region = REGIONS[rng.int(2)];
        const c = 2 + rng.int(MID - 2);
        const r = region.first + 1 + rng.int(region.last - region.first - 1);
        wall(grid, c, r);
        if (rng.chance(0.4)) wall(grid, c + 1, r);
      }
      break;
    }
  }
}

/** Construye el laberinto raro `kind` (determinista para la semilla dada). */
export function buildSpecialMaze(kind: SpecialKind, seed = 1): string[] {
  const rng = createRng(seed * 8191 + 17);
  const grid = blank();
  carve(grid, kind, rng);
  const lines: string[] = [];
  for (let r = 0; r < MAZE_ROWS; r++) {
    if (r >= 9 && r <= 19) {
      lines.push(CENTER_BAND[r - 9]);
      continue;
    }
    let row = '';
    for (let c = 0; c < MAZE_COLS; c++) {
      if (grid[r][c]) row += '#';
      // Puntos en damero (simétrico respecto al eje central): el doble de espacio para correr.
      else row += (Math.min(c, MAZE_COLS - 1 - c) + r) % 2 === 0 ? '.' : ' ';
    }
    lines.push(row);
  }
  // Energizers en las esquinas y salida de Pac-Man sin puntos, como el original.
  for (const [c, r] of [[1, 3], [26, 3], [1, 23], [26, 23]] as const) lines[r] = lines[r].slice(0, c) + 'o' + lines[r].slice(c + 1);
  for (const c of [13, 14]) lines[23] = lines[23].slice(0, c) + ' ' + lines[23].slice(c + 1);
  return lines;
}

/** Validación de un laberinto raro: lo esencial (la regla de "sin zonas 2×2" no aplica). */
export function validateSpecialMaze(lines: readonly string[]): string[] {
  const errors: string[] = [];
  if (lines.length !== MAZE_ROWS || lines.some((l) => l.length !== MAZE_COLS)) return ['dimensiones incorrectas'];
  for (const [r, l] of lines.entries()) if (l !== [...l].reverse().join('')) errors.push(`fila ${r} no es simétrica`);
  if (/[^#]/.test(lines[0]) || /[^#]/.test(lines[MAZE_ROWS - 1])) errors.push('las filas de borde deben ser pared');
  for (let r = 9; r <= 19; r++) if (lines[r] !== CENTER_BAND[r - 9]) errors.push(`la banda central cambió en la fila ${r}`);
  const reach = reachableTiles(lines);
  let dots = 0;
  let energizers = 0;
  for (let r = 0; r < MAZE_ROWS; r++) {
    for (let c = 0; c < MAZE_COLS; c++) {
      const ch = lines[r][c];
      if (ch === '.') dots++;
      if (ch === 'o') energizers++;
      if ((ch === '.' || ch === 'o') && !reach.has(r * MAZE_COLS + c)) errors.push(`punto inalcanzable en (${c},${r})`);
    }
  }
  if (energizers !== 4) errors.push(`energizers: ${energizers} (deben ser 4)`);
  if (dots + energizers < 150 || dots + energizers > 330) errors.push(`puntos: ${dots + energizers} (rango 150–330)`);
  for (const [c, r] of REQUIRED_OPEN) if (!reach.has(r * MAZE_COLS + c)) errors.push(`casilla obligatoria cerrada en (${c},${r})`);
  return errors;
}
