import { ORIGINAL_MAZE } from '../../data/mazes/original';
import { MAZE_COLS, MAZE_ROWS } from '../constants';
import { createRng, type Rng } from '../random';

/**
 * Generador y validador de laberintos al estilo arcade.
 *
 * Todos comparten la banda central del original (casa de fantasmas, túnel y entradas), que es lo
 * que fija la jugabilidad de las IAs; las zonas de arriba (filas 1–8) y abajo (filas 20–29) se
 * generan: un esqueleto de pasillos de 1 casilla, con tramos eliminados al azar y sin callejones.
 * Simétricos en horizontal, con paredes de al menos 2 casillas de grosor.
 */

const TOP = { first: 1, last: 8 };
const BOTTOM = { first: 20, last: 29 };
const MID = 13; // última columna de la mitad izquierda
const CENTER_BAND = ORIGINAL_MAZE.slice(9, 20);

/** Casillas que deben quedar abiertas para enlazar con la banda central y con la salida de Pac-Man. */
const REQUIRED_OPEN: [number, number][] = [
  [6, 8], [12, 8], [15, 8], [21, 8],
  [6, 20], [9, 20], [18, 20], [21, 20],
  [12, 23], [13, 23], [14, 23], [15, 23],
  [1, 3], [26, 3], [1, 23], [26, 23],
];

type Region = { first: number; last: number; hRequired: number[]; hOptional: number[]; hProtected: number[] };

const TOP_REGION: Region = { ...TOP, hRequired: [1, 8], hOptional: [4, 5], hProtected: [1, 8] };
const BOTTOM_REGION: Region = { ...BOTTOM, hRequired: [20, 23, 29], hOptional: [26], hProtected: [20, 29] };

/** Tramo vertical: de una línea horizontal a otra (así nunca queda un extremo suelto). */
interface VLine {
  col: number;
  from: number;
  to: number;
}

function pickColumns(rng: Rng): number[] {
  const cols = [1];
  const target = 3 + rng.int(3); // 3–5 líneas verticales además del borde
  for (const c of rng.shuffle([3, 4, 5, 6, 7, 8, 9, 10, 11, 12])) {
    if (cols.length - 1 >= target) break;
    if (cols.every((x) => Math.abs(x - c) >= 3)) cols.push(c);
  }
  return cols.sort((a, b) => a - b);
}

/** Dibuja una región como esqueleto de líneas y corta tramos al azar. */
function carveRegion(open: boolean[][], region: Region, rng: Rng, removeProb: number): void {
  const hRows = [...region.hRequired];
  for (const r of region.hOptional) {
    const tooClose = hRows.some((x) => Math.abs(x - r) < 3);
    if (!tooClose && rng.chance(0.7)) hRows.push(r);
  }
  hRows.sort((a, b) => a - b);

  const spans: [number, number][] = [];
  for (let i = 0; i < hRows.length; i++) for (let j = i + 1; j < hRows.length; j++) spans.push([hRows[i], hRows[j]]);
  const vLines: VLine[] = pickColumns(rng).map((col) => {
    if (col === 1) return { col, from: region.first, to: region.last };
    const [from, to] = spans[rng.int(spans.length)];
    return { col, from, to };
  });

  for (const r of hRows) for (let c = 1; c <= MID; c++) open[r][c] = true;
  for (const v of vLines) for (let r = v.from; r <= v.to; r++) open[r][v.col] = true;

  const cut = (horizontal: boolean, at: number, a: number, b: number) => {
    for (let k = a + 1; k < b; k++) {
      if (horizontal) open[at][k] = false;
      else open[k][at] = false;
    }
  };
  const splitAt = (points: number[]) => [...new Set(points)].sort((x, y) => x - y);

  for (const v of vLines) {
    if (v.col === 1) continue;
    const pts = splitAt([v.from, v.to, ...hRows.filter((r) => r > v.from && r < v.to)]);
    for (let i = 0; i + 1 < pts.length; i++) if (pts[i + 1] - pts[i] >= 2 && rng.chance(removeProb)) cut(false, v.col, pts[i], pts[i + 1]);
  }
  for (const r of hRows) {
    if (region.hProtected.includes(r) || r === 1 || r === 29) continue;
    const pts = splitAt([...vLines.filter((v) => r >= v.from && r <= v.to).map((v) => v.col), MID]);
    for (let i = 0; i + 1 < pts.length; i++) {
      if (pts[i + 1] - pts[i] < 2) continue;
      // El último tramo de la fila de Pac-Man (hacia el centro) nunca se corta.
      if (r === 23 && pts[i + 1] === MID) continue;
      if (rng.chance(removeProb)) cut(true, r, pts[i], pts[i + 1]);
    }
  }
}

const isOpenTemplate = (r: number, c: number): boolean => {
  const ch = CENTER_BAND[r - 9]?.[c];
  return ch !== undefined && ch !== '#' && ch !== '-';
};

/** Elimina los callejones sin salida de las zonas generadas, de forma iterativa. */
function pruneDeadEnds(open: boolean[][]): void {
  const isOpen = (r: number, c: number) => {
    if (r < 0 || r >= MAZE_ROWS || c < 0 || c >= MAZE_COLS) return false;
    if (r >= 9 && r <= 19) return isOpenTemplate(r, c);
    return open[r][c];
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 1; r < MAZE_ROWS - 1; r++) {
      if (r >= 9 && r <= 19) continue;
      for (let c = 1; c < MAZE_COLS - 1; c++) {
        if (!open[r][c]) continue;
        const n = +isOpen(r - 1, c) + +isOpen(r + 1, c) + +isOpen(r, c - 1) + +isOpen(r, c + 1);
        if (n < 2) {
          open[r][c] = false;
          changed = true;
        }
      }
    }
  }
}

function tryGenerate(rng: Rng): string[] | null {
  const open = Array.from({ length: MAZE_ROWS }, () => new Array<boolean>(MAZE_COLS).fill(false));
  const removeProb = 0.25 + rng.float() * 0.25;
  carveRegion(open, TOP_REGION, rng, removeProb);
  carveRegion(open, BOTTOM_REGION, rng, removeProb);
  // Espolón central arriba, como el original (el cruce del centro se cierra en las filas 1 y 29).
  if (rng.chance(0.5)) open[1][MID] = false;
  if (rng.chance(0.3)) open[29][MID] = false;
  // Espejo horizontal.
  for (let r = 0; r < MAZE_ROWS; r++) for (let c = 0; c <= MID; c++) open[r][MAZE_COLS - 1 - c] = open[r][c];
  pruneDeadEnds(open);
  for (const [c, r] of REQUIRED_OPEN) if (!open[r][c] && !(r >= 9 && r <= 19)) return null;

  const lines: string[] = [];
  for (let r = 0; r < MAZE_ROWS; r++) {
    if (r >= 9 && r <= 19) {
      lines.push(CENTER_BAND[r - 9]);
      continue;
    }
    let row = '';
    for (let c = 0; c < MAZE_COLS; c++) row += open[r][c] ? '.' : '#';
    lines.push(row);
  }
  // Energizers y hueco sin puntos bajo la salida de Pac-Man, como el original.
  for (const [c, r] of [[1, 3], [26, 3], [1, 23], [26, 23]] as const) lines[r] = lines[r].slice(0, c) + 'o' + lines[r].slice(c + 1);
  for (const c of [13, 14]) lines[23] = lines[23].slice(0, c) + ' ' + lines[23].slice(c + 1);
  return lines;
}

// ───────────────────────── Validación ─────────────────────────

export const PAC_SPAWN_TILE = { col: 13, row: 23 };

/** Casillas que Pac-Man puede alcanzar (sin atravesar la puerta; el túnel da la vuelta). */
export function reachableTiles(lines: readonly string[]): Set<number> {
  const rows = lines.length;
  const cols = lines[0].length;
  const walk = (r: number, c: number) => {
    const ch = lines[r]?.[c];
    return ch !== undefined && ch !== '#' && ch !== '-';
  };
  const seen = new Set<number>();
  const stack: [number, number][] = [[PAC_SPAWN_TILE.col, PAC_SPAWN_TILE.row]];
  while (stack.length) {
    const [c0, r] = stack.pop()!;
    const c = (c0 + cols) % cols;
    if (r < 0 || r >= rows || !walk(r, c) || seen.has(r * cols + c)) continue;
    // Solo hay vuelta de túnel en filas abiertas por ambos lados.
    if (c0 !== c && !(walk(r, 0) && walk(r, cols - 1))) continue;
    seen.add(r * cols + c);
    stack.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
  }
  return seen;
}

export function validateMaze(lines: readonly string[]): string[] {
  const errors: string[] = [];
  if (lines.length !== MAZE_ROWS) return [`filas: ${lines.length} (se esperaban ${MAZE_ROWS})`];
  for (const [r, l] of lines.entries()) if (l.length !== MAZE_COLS) errors.push(`fila ${r} con ancho ${l.length}`);
  if (errors.length) return errors;
  if (!/^[#.o \-]+$/.test(lines.join(''))) errors.push('caracteres no permitidos');

  for (const [r, l] of lines.entries()) if (l !== [...l].reverse().join('')) errors.push(`fila ${r} no es simétrica`);
  if (/[^#]/.test(lines[0]) || /[^#]/.test(lines[MAZE_ROWS - 1])) errors.push('las filas de borde deben ser pared');

  const reach = reachableTiles(lines);
  const at = (r: number, c: number) => reach.has(r * MAZE_COLS + ((c + MAZE_COLS) % MAZE_COLS));
  const tunnel = (r: number) => lines[r][0] !== '#' && lines[r][MAZE_COLS - 1] !== '#';

  let dots = 0;
  let energizers = 0;
  for (let r = 0; r < MAZE_ROWS; r++) {
    for (let c = 0; c < MAZE_COLS; c++) {
      const ch = lines[r][c];
      if (ch === '.') dots++;
      if (ch === 'o') energizers++;
      if ((ch === '.' || ch === 'o') && !at(r, c)) errors.push(`punto inalcanzable en (${c},${r})`);
      if (!at(r, c)) continue;
      const nb = (dr: number, dc: number) => {
        const cc = c + dc;
        if ((cc < 0 || cc >= MAZE_COLS) && !tunnel(r)) return false;
        return at(r + dr, cc);
      };
      const degree = +nb(-1, 0) + +nb(1, 0) + +nb(0, -1) + +nb(0, 1);
      if (degree < 2) errors.push(`callejón sin salida en (${c},${r})`);
      // Sin zonas abiertas de 2×2 (los pasillos miden una casilla).
      if (c + 1 < MAZE_COLS && at(r, c + 1) && at(r + 1, c) && at(r + 1, c + 1)) errors.push(`zona abierta 2×2 en (${c},${r})`);
    }
  }
  if (energizers !== 4) errors.push(`energizers: ${energizers} (deben ser 4)`);
  if (dots + energizers < 180 || dots + energizers > 300) errors.push(`puntos: ${dots + energizers} (rango 180–300)`);
  for (const [c, r] of REQUIRED_OPEN) if (!at(r, c)) errors.push(`casilla obligatoria cerrada en (${c},${r})`);
  return errors;
}

/**
 * Criterios estéticos: nada de macizos de pared enormes (el arcade nunca los tiene) ni tramos de
 * pared demasiado largos en una fila.
 */
export function qualityErrors(lines: readonly string[]): string[] {
  const errors: string[] = [];
  const reach = reachableTiles(lines);
  const open = (r: number, c: number) => reach.has(r * MAZE_COLS + c);
  for (let r = 1; r < MAZE_ROWS - 1; r++) {
    if (r >= 9 && r <= 19) continue;
    let run = 0;
    for (let c = 1; c < MAZE_COLS - 1; c++) {
      if (lines[r][c] !== '#') {
        run = 0;
        continue;
      }
      if (++run > 12) errors.push(`tramo de pared demasiado largo en la fila ${r}`);
      let near = false;
      for (let dr = -3; dr <= 3 && !near; dr++) for (let dc = -3; dc <= 3 && !near; dc++) near = open(r + dr, c + dc);
      if (!near) errors.push(`macizo de pared demasiado grueso en (${c},${r})`);
    }
  }
  return errors;
}

/** Genera un laberinto válido y determinista para la semilla dada. */
export function generateMaze(seed: number): string[] {
  for (let attempt = 0; attempt < 5000; attempt++) {
    const rng = createRng(seed * 104729 + attempt * 31);
    const lines = tryGenerate(rng);
    if (lines && validateMaze(lines).length === 0 && qualityErrors(lines).length === 0) return lines;
  }
  throw new Error(`No se pudo generar un laberinto válido para la semilla ${seed}`);
}

/** Huella para detectar repetidos. Los laberintos son simétricos, así que el espejo es idéntico. */
export const mazeHash = (lines: readonly string[]): string => lines.join('|');

/** Número de casillas distintas entre dos laberintos. */
export function mazeDistance(a: readonly string[], b: readonly string[]): number {
  let d = 0;
  for (let r = 0; r < a.length; r++) for (let c = 0; c < a[r].length; c++) if ((a[r][c] === '#') !== (b[r][c] === '#')) d++;
  return d;
}
