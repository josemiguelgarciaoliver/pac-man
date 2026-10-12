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

/** Ajuste de dificultad sobre las tablas del arcade (que son muy duras para jugar sin práctica). */
export type Difficulty = 'easy' | 'normal' | 'arcade';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'arcade'];

interface DifficultyPreset {
  label: string;
  /** Multiplica la velocidad de los fantasmas. */
  ghostSpeed: number;
  /** Multiplica la velocidad de Pac-Man. */
  pacSpeed: number;
  /** Multiplica la duración del estado asustado. */
  fright: number;
  /** Mínimo de ticks asustados (los niveles altos del arcade lo dejan en 0). */
  frightMin: number;
  /** Multiplicadores de las fases de dispersión (respiro) y de persecución. */
  scatter: number;
  chase: number;
  /** Cruise Elroy de Blinky activo. */
  elroy: boolean;
  /** Vidas extra al empezar. */
  lives: number;
}

const TICKS_PER_SECOND = 60;

export const DIFFICULTY_PRESETS: Record<Difficulty, DifficultyPreset> = {
  easy: { label: 'FACIL', ghostSpeed: 0.78, pacSpeed: 1.1, fright: 2, frightMin: 5 * TICKS_PER_SECOND, scatter: 2, chase: 0.5, elroy: false, lives: 4 },
  normal: { label: 'NORMAL', ghostSpeed: 0.92, pacSpeed: 1.04, fright: 1.3, frightMin: 2 * TICKS_PER_SECOND, scatter: 1.3, chase: 0.8, elroy: true, lives: 3 },
  arcade: { label: 'ARCADE', ghostSpeed: 1, pacSpeed: 1, fright: 1, frightMin: 0, scatter: 1, chase: 1, elroy: true, lives: 2 },
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

export function getLevelRules(level: number, difficulty: Difficulty = 'arcade'): LevelRules {
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

  const d = DIFFICULTY_PRESETS[difficulty];
  // Alterna scatter (índices pares) y chase (impares); la última fase infinita se queda como está.
  const scaledSchedule = schedule.map((t, i) => (Number.isFinite(t) ? Math.max(1, Math.round(t * (i % 2 === 0 ? d.scatter : d.chase))) : t));

  return {
    pacSpeed: Math.min(pacSpeed * d.pacSpeed, 1.2),
    pacFrightSpeed: Math.min(pacFrightSpeed * d.pacSpeed, 1.2),
    ghostSpeed: ghostSpeed * d.ghostSpeed,
    ghostTunnelSpeed: ghostTunnelSpeed * d.ghostSpeed,
    ghostFrightSpeed: ghostFrightSpeed * d.ghostSpeed,
    elroy1Dots: d.elroy ? elroy1 : 0,
    elroy1Speed: elroySpeeds[0],
    elroy2Dots: d.elroy ? Math.floor(elroy1 / 2) : 0,
    elroy2Speed: elroySpeeds[1],
    frightTicks: Math.max(Math.round(s(fright) * d.fright), d.frightMin),
    flashes,
    schedule: scaledSchedule,
    fruit: fruitForLevel(level),
    houseLimits: level === 1 ? { pinky: 0, inky: 30, clyde: 60 } : level === 2 ? { pinky: 0, inky: 0, clyde: 50 } : { pinky: 0, inky: 0, clyde: 0 },
    idleReleaseTicks: s(level < 5 ? 4 : 3),
  };
}

/** Contadores globales de salida tras perder una vida. */
export const GLOBAL_RELEASE = { pinky: 7, inky: 17, clyde: 32 } as const;

export const GHOST_POINTS = [200, 400, 800, 1600] as const;
