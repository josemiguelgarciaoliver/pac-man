import { TICK_RATE } from './constants';

/** Tablas de dificultad del arcade (The Pac-Man Dossier). Velocidades como fracción del 100 %. */
export interface LevelRules {
  pacSpeed: number;
  pacFrightSpeed: number;
  ghostSpeed: number;
  ghostTunnelSpeed: number;
  ghostFrightSpeed: number;
  elroy1Dots: number;
  elroy1Speed: number;
  elroy2Dots: number;
  elroy2Speed: number;
  /** Duración del estado asustado en ticks (0 = los fantasmas solo dan la vuelta). */
  frightTicks: number;
  /** Número de parpadeos de aviso. */
  flashes: number;
  /** Duraciones alternas scatter/chase en ticks; la última es infinita. */
  schedule: readonly number[];
  fruit: FruitKind;
  /** Puntos de salida de la casa por fantasma (contadores personales). */
  houseLimits: { pinky: number; inky: number; clyde: number };
  /** Ticks sin comer antes de forzar la salida de un fantasma. */
  idleReleaseTicks: number;
}

export type FruitKind = 'cherry' | 'strawberry' | 'orange' | 'apple' | 'melon' | 'galaxian' | 'bell' | 'key';

export const FRUIT_POINTS: Record<FruitKind, number> = {
  cherry: 100,
  strawberry: 300,
  orange: 500,
  apple: 700,
  melon: 1000,
  galaxian: 2000,
  bell: 3000,
  key: 5000,
};

const s = (seconds: number) => Math.round(seconds * TICK_RATE);

const FRUIT_BY_LEVEL: FruitKind[] = [
  'cherry',
  'strawberry',
  'orange',
  'orange',
  'apple',
  'apple',
  'melon',
  'melon',
  'galaxian',
  'galaxian',
  'bell',
  'bell',
];

export const fruitForLevel = (level: number): FruitKind => FRUIT_BY_LEVEL[level - 1] ?? 'key';

/** [segundos asustados, parpadeos] por nivel del 1 al 18. */
const FRIGHT: [number, number][] = [
  [6, 5], [5, 5], [4, 5], [3, 5], [2, 5], [5, 5], [2, 5], [2, 5], [1, 3],
  [5, 5], [2, 5], [1, 3], [1, 3], [3, 5], [1, 3], [1, 3], [0, 0], [1, 3],
];

/** [puntos restantes para Elroy 1] por nivel (Elroy 2 = la mitad). */
const ELROY: number[] = [20, 30, 40, 40, 40, 50, 50, 50, 60, 60, 60, 80, 80, 80, 100, 100, 100, 100];

export function getLevelRules(level: number): LevelRules {
  const tier = level === 1 ? 0 : level <= 4 ? 1 : level <= 20 ? 2 : 3;
  const [fright, flashes] = FRIGHT[level - 1] ?? [0, 0];
  const elroy1 = ELROY[level - 1] ?? 120;

  const pacSpeed = [0.8, 0.9, 1, 0.9][tier];
  const pacFrightSpeed = [0.9, 0.95, 1, 0.9][tier];
  const ghostSpeed = [0.75, 0.85, 0.95, 0.95][tier];
  const ghostTunnelSpeed = [0.4, 0.45, 0.5, 0.5][tier];
  const ghostFrightSpeed = [0.5, 0.55, 0.6, 0.6][tier];
  const elroySpeeds = [
    [0.8, 0.85],
    [0.9, 0.95],
    [1, 1.05],
    [1, 1.05],
  ][tier];

  const schedule =
    level === 1
      ? [s(7), s(20), s(7), s(20), s(5), s(20), s(5), Infinity]
      : level <= 4
        ? [s(7), s(20), s(7), s(20), s(5), s(1033), 1, Infinity]
        : [s(5), s(20), s(5), s(20), s(5), s(1037), 1, Infinity];

  return {
    pacSpeed,
    pacFrightSpeed,
    ghostSpeed,
    ghostTunnelSpeed,
    ghostFrightSpeed,
    elroy1Dots: elroy1,
    elroy1Speed: elroySpeeds[0],
    elroy2Dots: Math.floor(elroy1 / 2),
    elroy2Speed: elroySpeeds[1],
    frightTicks: s(fright),
    flashes,
    schedule,
    fruit: fruitForLevel(level),
    houseLimits: level === 1 ? { pinky: 0, inky: 30, clyde: 60 } : level === 2 ? { pinky: 0, inky: 0, clyde: 50 } : { pinky: 0, inky: 0, clyde: 0 },
    idleReleaseTicks: s(level < 5 ? 4 : 3),
  };
}

/** Contadores globales de salida tras perder una vida. */
export const GLOBAL_RELEASE = { pinky: 7, inky: 17, clyde: 32 } as const;

export const GHOST_POINTS = [200, 400, 800, 1600] as const;
