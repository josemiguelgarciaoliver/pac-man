/**
 * Genera los laberintos de los niveles 2–100 (el 1 es el original de Namco).
 *   npx tsx tools/generate-mazes.ts
 * Escribe src/data/mazes/generated.json. Es determinista: la misma ejecución da los mismos laberintos.
 * Cada laberinto debe diferir del resto en al menos MIN_DISTANCE casillas.
 */
import { writeFileSync } from 'node:fs';
import { ORIGINAL_MAZE } from '../src/data/mazes/original';
import { generateMaze, mazeDistance, mazeHash, validateMaze } from '../src/game/maze/generator';

const COUNT = 99;
const MIN_DISTANCE = 30;

const accepted: string[][] = [[...ORIGINAL_MAZE]];
const hashes = new Set([mazeHash(ORIGINAL_MAZE)]);
let seed = 1;
while (accepted.length < COUNT + 1) {
  const maze = generateMaze(seed++);
  if (hashes.has(mazeHash(maze))) continue;
  if (accepted.some((m) => mazeDistance(m, maze) < MIN_DISTANCE)) continue;
  hashes.add(mazeHash(maze));
  accepted.push(maze);
}

const mazes = accepted.slice(1);
for (const [i, m] of mazes.entries()) {
  const errs = validateMaze(m);
  if (errs.length) throw new Error(`Laberinto del nivel ${i + 2} inválido: ${errs.join('; ')}`);
}
writeFileSync(new URL('../src/data/mazes/generated.json', import.meta.url), JSON.stringify({ minDistance: MIN_DISTANCE, mazes }, null, 0) + '\n');
console.log(`${mazes.length} laberintos escritos (semillas probadas: ${seed - 1}).`);
