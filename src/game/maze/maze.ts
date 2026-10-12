import { MAZE_COLS, MAZE_ROWS } from '../constants';

export const WALL = '#';
export const DOOR = '-';

type PelletKind = 'dot' | 'energizer';

export class Maze {
  readonly cols: number;
  readonly rows: number;
  private readonly cells: string[][];
  /** Filas con túnel de lado a lado. */
  private readonly tunnelRows = new Set<number>();
  /** Casillas no-pared que ningún actor puede alcanzar (se pintan como pared). */
  private readonly voidTiles = new Set<number>();
  private pellets = new Map<number, PelletKind>();
  private distCache = new Map<number, Int16Array>();
  totalPellets = 0;

  constructor(lines: readonly string[], spawn: { col: number; row: number }) {
    this.rows = lines.length;
    this.cols = lines[0].length;
    if (this.cols !== MAZE_COLS || this.rows !== MAZE_ROWS) {
      throw new Error(`Laberinto ${this.cols}×${this.rows}: se esperaba ${MAZE_COLS}×${MAZE_ROWS}`);
    }
    this.cells = lines.map((l, r) => {
      if (l.length !== this.cols) throw new Error(`Fila ${r} con ancho ${l.length}`);
      return [...l];
    });
    for (let r = 0; r < this.rows; r++) {
      if (this.cells[r][0] !== WALL && this.cells[r][this.cols - 1] !== WALL) this.tunnelRows.add(r);
    }
    this.computeVoid(spawn);
    this.resetPellets();
  }

  private key(c: number, r: number): number {
    return r * this.cols + c;
  }

  resetPellets(): void {
    this.pellets = new Map();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const ch = this.cells[r][c];
        if (ch === '.') this.pellets.set(this.key(c, r), 'dot');
        else if (ch === 'o') this.pellets.set(this.key(c, r), 'energizer');
      }
    }
    this.totalPellets = this.pellets.size;
  }

  /**
   * Distancia en casillas (por el camino más corto, con túnel) desde cada casilla hasta (col,row).
   * -1 = inalcanzable. Se calcula una vez por destino. Sirve para que los ojos vuelvan a casa sin
   * quedarse dando vueltas, algo que la búsqueda "voraz" de los fantasmas no garantiza.
   */
  distancesTo(col: number, row: number): Int16Array {
    const k = this.key(col, row);
    const hit = this.distCache.get(k);
    if (hit) return hit;
    const dist = new Int16Array(this.cols * this.rows).fill(-1);
    const queue: [number, number][] = [[col, row]];
    dist[k] = 0;
    for (let i = 0; i < queue.length; i++) {
      const [c, r] = queue[i];
      for (const [dc, dr] of [[0, -1], [-1, 0], [0, 1], [1, 0]]) {
        let nc = c + dc;
        const nr = r + dr;
        if (nr < 0 || nr >= this.rows) continue;
        if (nc < 0 || nc >= this.cols) {
          if (!this.tunnelRows.has(nr)) continue;
          nc = (nc + this.cols) % this.cols;
        }
        if (!this.isWalkable(nc, nr) || dist[this.key(nc, nr)] !== -1) continue;
        dist[this.key(nc, nr)] = dist[this.key(c, r)] + 1;
        queue.push([nc, nr]);
      }
    }
    this.distCache.set(k, dist);
    return dist;
  }

  /** Devuelve los energizers al laberinto (misiones de caza). */
  respawnEnergizers(): void {
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) if (this.cells[r][c] === 'o' && !this.pellets.has(this.key(c, r))) this.pellets.set(this.key(c, r), 'energizer');
  }

  get pelletsLeft(): number {
    return this.pellets.size;
  }

  /** Carácter de la casilla; fuera del laberinto solo hay suelo en filas de túnel. */
  charAt(c: number, r: number): string {
    if (r < 0 || r >= this.rows) return WALL;
    if (c < 0 || c >= this.cols) return this.tunnelRows.has(r) ? ' ' : WALL;
    return this.cells[r][c];
  }

  /** ¿Puede Pac-Man pisar la casilla? (ni paredes ni puertas) */
  isWalkable(c: number, r: number): boolean {
    const ch = this.charAt(c, r);
    return ch !== WALL && ch !== DOOR;
  }

  /** Casilla que se dibuja como espacio abierto (suelo o puerta; no pared ni vacío). */
  isOpen(c: number, r: number): boolean {
    if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return this.tunnelRows.has(r);
    return this.cells[r][c] !== WALL && !this.voidTiles.has(this.key(c, r));
  }

  pelletAt(c: number, r: number): PelletKind | undefined {
    return this.pellets.get(this.key(c, r));
  }

  eatPellet(c: number, r: number): PelletKind | undefined {
    const k = this.key(c, r);
    const p = this.pellets.get(k);
    if (p) this.pellets.delete(k);
    return p;
  }

  *pelletTiles(): Generator<{ c: number; r: number; kind: PelletKind }> {
    for (const [k, kind] of this.pellets) yield { c: k % this.cols, r: Math.floor(k / this.cols), kind };
  }

  doors(): { c: number; r: number }[] {
    const out: { c: number; r: number }[] = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) if (this.cells[r][c] === DOOR) out.push({ c, r });
    return out;
  }

  private computeVoid(spawn: { col: number; row: number }): void {
    const seen = new Set<number>();
    const flood = (sc: number, sr: number) => {
      const stack = [[sc, sr]];
      while (stack.length) {
        const [c, r] = stack.pop()!;
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) continue;
        if (this.cells[r][c] === WALL || seen.has(this.key(c, r))) continue;
        seen.add(this.key(c, r));
        stack.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
      }
    };
    flood(spawn.col, spawn.row);
    // Los dos extremos de una fila de túnel están conectados por el wrap.
    for (const r of this.tunnelRows) {
      flood(0, r);
      flood(this.cols - 1, r);
    }
    // La casa de fantasmas se alcanza a través de la puerta.
    for (const d of this.doors()) flood(d.c, d.r);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.cells[r][c] !== WALL && !seen.has(this.key(c, r))) this.voidTiles.add(this.key(c, r));
      }
    }
  }
}
