import { LEVELS_PER_WORLD } from '../../data/worlds';

/**
 * Nivel "equivalente del arcade" para el nivel global n (1–100). Indexa las tablas de velocidad,
 * tiempo asustado, fruta, etc. La curva es un diente de sierra ascendente: sube dentro de cada
 * mundo, baja un poco al empezar el siguiente (respiro para aprender su mecánica) y cada mundo
 * arranca más arriba que el anterior.
 */
export function arcadeEquivalent(level: number): number {
  const n = Math.min(Math.max(Math.floor(level), 1), 100);
  const world = Math.ceil(n / LEVELS_PER_WORLD);
  const stage = ((n - 1) % LEVELS_PER_WORLD) + 1;
  const a = 1 + (world - 1) * 2 + (stage - 1) * 0.4 * (1 + world / 10);
  return Math.max(1, Math.round(a));
}
