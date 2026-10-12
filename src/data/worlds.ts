export const TOTAL_LEVELS = 100;
export const LEVELS_PER_WORLD = 10;

export const WORLD_NAMES = [
  'Arcade Clásico',
  'Bosque Encantado',
  'La Fábrica',
  'Polo Helado',
  'Pirámides del Desierto',
  'Fondo Marino',
  'Volcán',
  'Estación Espacial',
  'Castillo Fantasma',
  'El Núcleo Glitch',
] as const;

export interface LevelPosition {
  /** Mundo 1–10. */
  world: number;
  /** Nivel dentro del mundo, 1–10. */
  stage: number;
  /** Nivel global 1–100. */
  level: number;
  name: string;
}

/** Traduce el nivel global (1–100) a mundo y nivel dentro del mundo. */
export function levelPosition(level: number): LevelPosition {
  const n = Math.min(Math.max(Math.floor(level), 1), TOTAL_LEVELS);
  const world = Math.ceil(n / LEVELS_PER_WORLD);
  return { world, stage: ((n - 1) % LEVELS_PER_WORLD) + 1, level: n, name: WORLD_NAMES[world - 1] };
}
