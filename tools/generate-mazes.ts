/**
 * Genera los laberintos de los niveles 2–100 (el 1 es el original de Namco). Cada mundo usa su propio
 * estilo de laberinto (ver MAZE_STYLES): bosque enmarañado, fábrica en rejilla, polo de grandes bloques…
 *   npx tsx tools/generate-mazes.ts
 * Escribe src/data/mazes/generated.json. Es determinista: la misma ejecución da los mismos laberintos.
 * Cada laberinto debe diferir del resto en al menos MIN_DISTANCE casillas.
 */
import { writeFileSync } from 'node:fs';
import { ORIGINAL_MAZE } from '../src/data/mazes/original';
import { generateMaze, mazeDistance, mazeHash, validateMaze } from '../src/game/maze/generator';
import { MAZE_STYLES } from '../src/game/theme/worldThemes';

const MIN_DISTANCE = 30;
const MAX_TRIES_PER_LEVEL = 4000;

const accepted: string[][] = [[...ORIGINAL_MAZE]];
const hashes = new Set([mazeHash(ORIGINAL_MAZE)]);
const mazes: string[][] = [];
let seed = 1;
for (let level = 2; level <= 100; level++) {
  const world = Math.ceil(level / 10);
  const style = MAZE_STYLES[world];
  let chosen: string[] | null = null;
  for (let tries = 0; tries < MAX_TRIES_PER_LEVEL && !chosen; tries++) {
    const maze = generateMaze(seed++, style);
    if (hashes.has(mazeHash(maze))) continue;
    if (accepted.some((m) => mazeDistance(m, maze) < MIN_DISTANCE)) continue;
    chosen = maze;
  }
  if (!chosen) throw new Error(`Nivel ${level} (mundo ${world}): no se encontró un laberinto con distancia ≥ ${MIN_DISTANCE}`);
  const errs = validateMaze(chosen);
  if (errs.length) throw new Error(`Laberinto del nivel ${level} inválido: ${errs.join('; ')}`);
  hashes.add(mazeHash(chosen));
  accepted.push(chosen);
  mazes.push(chosen);
}

writeFileSync(new URL('../src/data/mazes/generated.json', import.meta.url), JSON.stringify({ minDistance: MIN_DISTANCE, mazes }, null, 0) + '\n');
console.log(`${mazes.length} laberintos escritos (semillas probadas: ${seed - 1}).`);
