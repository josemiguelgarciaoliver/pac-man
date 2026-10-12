import { DIRS, Dir, TILE } from '../constants';
import type { Maze } from '../maze/maze';

/** Desplaza un actor `dist` px en `dir` sin atravesar paredes (cintas, corrientes…). */
export function drift(actor: { x: number; y: number }, maze: Maze, dir: Dir, dist: number): void {
  const d = DIRS[dir];
  const nx = actor.x + d.x * dist;
  const ny = actor.y + d.y * dist;
  // La casilla que se pisa con el borde delantero del actor debe ser transitable.
  const lc = Math.floor((nx + d.x * (TILE / 2)) / TILE);
  const lr = Math.floor((ny + d.y * (TILE / 2)) / TILE);
  if (!maze.isWalkable(lc, lr)) return;
  actor.x = nx;
  actor.y = ny;
}
