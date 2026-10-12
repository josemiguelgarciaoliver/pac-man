/** PRNG determinista (mulberry32): los replays, los tests y los generadores necesitan la misma secuencia. */
export interface Rng {
  /** Entero en [0, n). */
  int(n: number): number;
  /** Decimal en [0, 1). */
  float(): number;
  /** true con probabilidad p. */
  chance(p: number): boolean;
  /** Mezcla una copia del array (Fisher-Yates). */
  shuffle<T>(items: readonly T[]): T[];
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const float = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(float() * n);
  return {
    int,
    float,
    chance: (p) => float() < p,
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}
