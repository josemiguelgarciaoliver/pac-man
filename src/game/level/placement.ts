import { MAZE_COLS, MAZE_ROWS } from '../constants';
import { PAC_SPAWN_TILE, reachableTiles } from '../maze/generator';
import type { Rng } from '../random';

export interface TileXY {
  col: number;
  row: number;
}

const DELTAS: [number, number][] = [
  [0, -1],
  [-1, 0],
  [0, 1],
  [1, 0],
];

const key = (c: number, r: number) => r * MAZE_COLS + c;

function isTunnel(lines: readonly string[], row: number): boolean {
  return lines[row][0] !== '#' && lines[row][MAZE_COLS - 1] !== '#';
}

/** Vecinos transitables de una casilla (ni paredes ni puerta); el túnel da la vuelta. */
export function neighbors(lines: readonly string[], col: number, row: number): TileXY[] {
  const out: TileXY[] = [];
  for (const [dc, dr] of DELTAS) {
    let c = col + dc;
    const r = row + dr;
    if (r < 0 || r >= MAZE_ROWS) continue;
    if (c < 0 || c >= MAZE_COLS) {
      if (!isTunnel(lines, r)) continue;
      c = (c + MAZE_COLS) % MAZE_COLS;
    }
    const ch = lines[r][c];
    if (ch === '#' || ch === '-') continue;
    out.push({ col: c, row: r });
  }
  return out;
}

/** BFS desde `from`: distancia en casillas (−1 = inalcanzable) y casilla de la que se llegó. */
export function bfs(lines: readonly string[], from: TileXY): { dist: Int16Array; parent: Int32Array } {
  const dist = new Int16Array(MAZE_COLS * MAZE_ROWS).fill(-1);
  const parent = new Int32Array(MAZE_COLS * MAZE_ROWS).fill(-1);
  const queue: TileXY[] = [from];
  dist[key(from.col, from.row)] = 0;
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    for (const n of neighbors(lines, cur.col, cur.row)) {
      const k = key(n.col, n.row);
      if (dist[k] !== -1) continue;
      dist[k] = dist[key(cur.col, cur.row)] + 1;
      parent[k] = key(cur.col, cur.row);
      queue.push(n);
    }
  }
  return { dist, parent };
}

/** Camino más corto (incluye origen y destino) o null si no hay. */
export function shortestPath(lines: readonly string[], from: TileXY, to: TileXY): TileXY[] | null {
  const { dist, parent } = bfs(lines, from);
  let k = key(to.col, to.row);
  if (dist[k] === -1) return null;
  const path: TileXY[] = [];
  while (k !== -1) {
    path.push({ col: k % MAZE_COLS, row: Math.floor(k / MAZE_COLS) });
    k = parent[k];
  }
  return path.reverse();
}

/** Casilla más cercana a `from` que cumpla `pred` (null si ninguna). */
export function nearestTile(lines: readonly string[], from: TileXY, pred: (t: TileXY) => boolean): TileXY | null {
  const { dist } = bfs(lines, from);
  let best: TileXY | null = null;
  let bestDist = Infinity;
  for (let k = 0; k < dist.length; k++) {
    if (dist[k] <= 0 || dist[k] >= bestDist) continue;
    const t = { col: k % MAZE_COLS, row: Math.floor(k / MAZE_COLS) };
    if (pred(t)) {
      best = t;
      bestDist = dist[k];
    }
  }
  return best;
}

/** Casillas con punto normal alcanzables (donde se pueden colocar objetos sin estorbar). */
export function dotTiles(lines: readonly string[]): TileXY[] {
  const reach = reachableTiles(lines);
  const out: TileXY[] = [];
  for (let r = 0; r < MAZE_ROWS; r++) for (let c = 0; c < MAZE_COLS; c++) if (lines[r][c] === '.' && reach.has(key(c, r))) out.push({ col: c, row: r });
  return out;
}

/** Distancia mínima (casillas) a la salida de Pac-Man para colocar un objeto. */
const MIN_FROM_SPAWN = 6;
/** Separación (casillas por pasillo) que se intenta guardar entre objetos del mismo tipo; se va relajando. */
const SEPARATIONS = [14, 11, 8, 5, 3, 0];

/**
 * Reparte `count` casillas al azar por TODO el laberinto (no solo por la parte alejada de la salida),
 * procurando que queden separadas entre sí: cada una se elige al azar entre las que cumplen la
 * separación, y si no hay sitio se va relajando. Nunca cae demasiado cerca de la salida de Pac-Man.
 */
export function pickSpread(lines: readonly string[], count: number, rng: Rng, allCandidates: TileXY[] = dotTiles(lines), avoid: readonly TileXY[] = []): TileXY[] {
  // Nunca dos objetos en la misma casilla (ni pegados): se vería uno y se recogerían los dos.
  const free = allCandidates.filter((t) => avoid.every((a) => Math.abs(a.col - t.col) + Math.abs(a.row - t.row) >= 2));
  const candidates = free.length >= count ? free : allCandidates;
  const spawnDist = bfs(lines, PAC_SPAWN_TILE).dist;
  const fromChosen: Int16Array[] = [];

  const chosen: TileXY[] = [];
  for (let i = 0; i < count; i++) {
    let pool: TileXY[] = [];
    for (const minSpawn of [MIN_FROM_SPAWN, 0]) {
      for (const sep of SEPARATIONS) {
        pool = candidates.filter((t) => !chosen.includes(t) && spawnDist[key(t.col, t.row)] >= minSpawn && fromChosen.every((d) => d[key(t.col, t.row)] >= sep));
        if (pool.length > 0) break;
      }
      if (pool.length > 0) break;
    }
    const pick = pool.length > 0 ? pool[rng.int(pool.length)] : candidates.filter((t) => !chosen.includes(t))[0];
    chosen.push(pick);
    fromChosen.push(bfs(lines, pick).dist);
  }
  return chosen;
}

/** Casilla con punto más lejana de la salida de Pac-Man (opcionalmente a no más de `maxDist` casillas). */
export function farthestFromSpawn(lines: readonly string[], maxDist = Infinity): TileXY {
  const { dist } = bfs(lines, PAC_SPAWN_TILE);
  let best = -1;
  for (let k = 0; k < dist.length; k++) {
    if (lines[Math.floor(k / MAZE_COLS)][k % MAZE_COLS] !== '.') continue;
    if (dist[k] > maxDist) continue;
    if (best === -1 || dist[k] > dist[best]) best = k;
  }
  return { col: best % MAZE_COLS, row: Math.floor(best / MAZE_COLS) };
}

export interface BeltRun {
  tiles: TileXY[];
  horizontal: boolean;
}

/**
 * Tramos rectos de pasillo (con pared a ambos lados) de al menos 4 casillas, fuera de la banda
 * central y de la salida de Pac-Man: sitios donde una cinta no estorba a los cruces.
 */
export function beltRuns(lines: readonly string[]): BeltRun[] {
  const reach = reachableTiles(lines);
  const open = (c: number, r: number) => reach.has(key(c, r)) && lines[r][c] !== ' ';
  const wall = (c: number, r: number) => r < 0 || r >= MAZE_ROWS || c < 0 || c >= MAZE_COLS || lines[r][c] === '#';
  const usable = (c: number, r: number) => r >= 1 && r <= 29 && (r < 9 || r > 19) && !(r === 23 && c >= 10 && c <= 17) && open(c, r);

  const runs: BeltRun[] = [];
  const collect = (horizontal: boolean) => {
    const outer = horizontal ? MAZE_ROWS : MAZE_COLS;
    const inner = horizontal ? MAZE_COLS : MAZE_ROWS;
    for (let a = 0; a < outer; a++) {
      let run: TileXY[] = [];
      const flush = () => {
        if (run.length >= 4) runs.push({ tiles: run, horizontal });
        run = [];
      };
      for (let b = 0; b < inner; b++) {
        const [c, r] = horizontal ? [b, a] : [a, b];
        const straight = horizontal ? wall(c, r - 1) && wall(c, r + 1) : wall(c - 1, r) && wall(c + 1, r);
        if (usable(c, r) && straight) run.push({ col: c, row: r });
        else flush();
      }
      flush();
    }
  };
  collect(true);
  collect(false);
  return runs;
}

const OPEN_CHARS = '. o';
const isOpenChar = (lines: readonly string[], c: number, r: number) => r >= 0 && r < MAZE_ROWS && c >= 0 && c < MAZE_COLS && OPEN_CHARS.includes(lines[r][c]) && lines[r][c] !== '-';
const isWallChar = (lines: readonly string[], c: number, r: number) => r < 0 || r >= MAZE_ROWS || c < 0 || c >= MAZE_COLS || lines[r][c] === '#';

export interface OpenRun {
  horizontal: boolean;
  tiles: TileXY[];
  /** Pared de la que sale el disparo (extremo de inicio) y pared contra la que acaba. */
  startWall: TileXY;
  endWall: TileXY;
}

/**
 * Tramos rectos de pasillo cerrados por una pared en cada extremo (de pared a pared), de al menos
 * 8 casillas: el sitio donde una torreta puede disparar de lado a lado.
 */
export function openRuns(lines: readonly string[], minLength = 8): OpenRun[] {
  const reach = reachableTiles(lines);
  const runs: OpenRun[] = [];
  const scan = (horizontal: boolean) => {
    const outer = horizontal ? MAZE_ROWS : MAZE_COLS;
    const inner = horizontal ? MAZE_COLS : MAZE_ROWS;
    for (let a = 0; a < outer; a++) {
      // Los pasillos horizontales de la banda central (casa y túnel) no sirven de pista de tiro.
      if (horizontal && (a < 1 || a > 29 || (a >= 9 && a <= 19))) continue;
      let start = -1;
      for (let b = 0; b <= inner; b++) {
        const [c, r] = horizontal ? [b, a] : [a, b];
        const open = b < inner && isOpenChar(lines, c, r) && reach.has(r * MAZE_COLS + c);
        if (open && start === -1) start = b;
        if (!open && start !== -1) {
          const len = b - start;
          const tile = (i: number): TileXY => (horizontal ? { col: i, row: a } : { col: a, row: i });
          if (len >= minLength && isWallChar(lines, ...(horizontal ? [start - 1, a] : [a, start - 1]) as [number, number]) && isWallChar(lines, ...(horizontal ? [b, a] : [a, b]) as [number, number])) {
            runs.push({ horizontal, tiles: Array.from({ length: len }, (_, i) => tile(start + i)), startWall: tile(start - 1), endWall: tile(b) });
          }
          start = -1;
        }
      }
    }
  };
  scan(true);
  scan(false);
  return runs;
}

export interface BombSite extends TileXY {
  /** Dirección (dc, dr) hacia la pared de 2 casillas que la explosión puede abrir. */
  dc: number;
  dr: number;
}

/**
 * Casillas de pasillo pegadas a una pared de exactamente 2 casillas de grosor con otro pasillo
 * detrás: al estallar ahí una bomba se abre un atajo útil.
 */
export function bombSites(lines: readonly string[]): BombSite[] {
  const reach = reachableTiles(lines);
  const sites: BombSite[] = [];
  const destroyable = (c: number, r: number) => c >= 1 && c <= MAZE_COLS - 2 && r >= 1 && r <= MAZE_ROWS - 2 && (r < 9 || r > 19) && lines[r][c] === '#';
  for (let r = 1; r <= 29; r++) {
    if (r >= 9 && r <= 19) continue;
    for (let c = 1; c <= MAZE_COLS - 2; c++) {
      if (lines[r][c] !== '.' || !reach.has(r * MAZE_COLS + c)) continue;
      for (const [dc, dr] of [[0, -1], [-1, 0], [0, 1], [1, 0]] as const) {
        if (destroyable(c + dc, r + dr) && destroyable(c + 2 * dc, r + 2 * dr) && isOpenChar(lines, c + 3 * dc, r + 3 * dr) && reach.has((r + 3 * dr) * MAZE_COLS + c + 3 * dc)) {
          sites.push({ col: c, row: r, dc, dr });
          break;
        }
      }
    }
  }
  return sites;
}
