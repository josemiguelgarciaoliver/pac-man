/**
 * Nivel "equivalente del arcade" para el nivel global n (1–100): indexa la fruta, la salida de la casa
 * de fantasmas, etc. Crece sin bajar nunca: la dificultad del juego es progresiva del 1 al 100.
 */
export function arcadeEquivalent(level: number): number {
  const n = Math.min(Math.max(Math.floor(level), 1), 100);
  return 1 + Math.floor((20 * (n - 1)) / 99);
}
