import { describe, expect, it } from 'vitest';
import { ORIGINAL_MAZE, ORIGINAL_PAC_SPAWN } from '../src/data/mazes/original';
import { Maze } from '../src/game/maze/maze';

describe('laberinto original', () => {
  const maze = new Maze(ORIGINAL_MAZE, ORIGINAL_PAC_SPAWN);

  it('tiene 244 puntos (240 + 4 energizers), como el arcade', () => {
    expect(maze.totalPellets).toBe(244);
    let energizers = 0;
    for (const p of maze.pelletTiles()) if (p.kind === 'energizer') energizers++;
    expect(energizers).toBe(4);
  });

  it('es simétrico horizontalmente', () => {
    for (const row of ORIGINAL_MAZE) {
      const mirrored = [...row].reverse().join('').replace('o', 'o');
      expect(mirrored).toBe(row);
    }
  });

  it('todos los puntos son alcanzables desde la salida de Pac-Man', () => {
    const seen = new Set<number>();
    const stack: [number, number][] = [[ORIGINAL_PAC_SPAWN.col, ORIGINAL_PAC_SPAWN.row]];
    while (stack.length) {
      const [c, r] = stack.pop()!;
      const wc = (c + maze.cols) % maze.cols;
      if (!maze.isWalkable(c, r) || c < -1 || c > maze.cols || seen.has(r * 100 + wc)) continue;
      seen.add(r * 100 + wc);
      stack.push([wc + 1, r], [wc - 1, r], [wc, r + 1], [wc, r - 1]);
    }
    for (const p of maze.pelletTiles()) expect(seen.has(p.r * 100 + p.c)).toBe(true);
  });
});
