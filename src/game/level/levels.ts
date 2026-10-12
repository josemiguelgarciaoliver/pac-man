import generated from '../../data/mazes/generated.json';
import { ORIGINAL_MAZE } from '../../data/mazes/original';
import { LEVEL_SPECIALS } from '../../data/levelSpecials';
import { TOTAL_LEVELS, levelPosition } from '../../data/worlds';
import { arcadeEquivalent } from './curve';
import { levelSchema, type LevelDef } from './schema';

/** Color de las paredes de cada mundo (mismo estilo, distinta paleta). */
export const WORLD_WALL_COLORS = [
  '#3d5bff', // 1 Arcade: azul clásico
  '#3fdc6a', // 2 Bosque: verde
  '#ff9a3d', // 3 Fábrica: naranja acero
  '#5fe3ff', // 4 Polo: cian hielo
  '#ffd24a', // 5 Desierto: dorado
  '#20d4c4', // 6 Marino: turquesa
  '#ff4a3a', // 7 Volcán: rojo magma
  '#b36bff', // 8 Espacio: violeta
  '#a79bd0', // 9 Castillo: piedra morada
  '#ff3df2', // 10 Glitch: magenta
] as const;

export const mazeForLevel = (level: number): readonly string[] => (level === 1 ? ORIGINAL_MAZE : generated.mazes[level - 2]);

const cache = new Map<number, LevelDef>();

/** Construye (y valida) la definición del nivel 1–100. */
export function buildLevel(level: number): LevelDef {
  const n = Math.min(Math.max(Math.floor(level), 1), TOTAL_LEVELS);
  const hit = cache.get(n);
  if (hit) return hit;
  const pos = levelPosition(n);
  const special = LEVEL_SPECIALS[n];
  const def = levelSchema.parse({
    level: n,
    world: pos.world,
    stage: pos.stage,
    name: pos.name,
    arcadeLevel: arcadeEquivalent(n),
    maze: [...mazeForLevel(n)],
    wallColor: WORLD_WALL_COLORS[pos.world - 1],
    mission: special?.mission ?? { type: 'CLEAR' },
    mechanics: special?.mechanics ?? [],
  });
  cache.set(n, def);
  return def;
}
