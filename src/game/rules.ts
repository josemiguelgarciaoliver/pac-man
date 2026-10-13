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

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Reglas de dificultad de un nivel.
 *  - `level`: nivel equivalente del arcade (indexa fruta y salida de la casa).
 *  - `difficulty`: preset del jugador. Su ayuda se va desvaneciendo con el avance del juego.
 *  - `global`: nivel global 1–100. La dificultad crece SIN bajar nunca hasta el 100, donde los fantasmas
 *    corren mucho más que Pac-Man, no hay dispersión ni estado asustado: es prácticamente imposible.
 */
export function getLevelRules(level: number, difficulty: Difficulty = 'arcade', global: number = level): LevelRules {
  const p = clamp01((global - 1) / 99);
  const ramp = clamp01(p / 0.3); // tarda hasta el nivel ~31 en llegar a los valores de velocidad del arcade
  const fade = p ** 1.4; // cuánto se ha desvanecido la ayuda del preset (0 al principio, 1 en el nivel 100)

  // Velocidades base (fracción del 100 %): suben juntas; luego Pac-Man pierde algo y los fantasmas se disparan.
  const pacBase = (0.8 + 0.2 * ramp) * (1 - 0.1 * p ** 2);
  const ghostBase = (0.75 + 0.2 * ramp) * (1 + 0.38 * p ** 2.2);
  const ghostTunnelBase = 0.4 + 0.1 * ramp;
  const ghostFrightBase = 0.5 + 0.1 * ramp;

  const d = DIFFICULTY_PRESETS[difficulty];
  const gMul = d.ghostSpeed + (1 - d.ghostSpeed) * fade;
  const pMul = d.pacSpeed + (1 - d.pacSpeed) * fade;
  // Rebaja general de los fantasmas (20 % al empezar, 0 en el nivel 100 para que siga siendo casi imposible).
  const ghostEase = 1 - 0.2 * (1 - p ** 3);
  const ghostSpeed = ghostBase * gMul * ghostEase;
  const pacSpeed = Math.min(1.2, pacBase * pMul);

  // Estado asustado: de 6 s a ninguno en el último nivel.
  const frightSeconds = 6 * (1 - p) ** 1.35;
  const frightMul = d.fright + (1 - d.fright) * fade;
  const frightMin = d.frightMin * (1 - p) ** 2;
  const frightTicks = p >= 0.995 ? 0 : Math.max(Math.round(s(frightSeconds) * frightMul), Math.round(frightMin));

  // Dispersión (respiro) y persecución: la dispersión se encoge hasta casi desaparecer.
  const base = global === 1 ? [7, 20, 7, 20, 5, 20, 5] : global <= 15 ? [7, 20, 7, 20, 5, 1033, 0] : [5, 20, 5, 20, 5, 1037, 0];
  const scatterScale = (d.scatter + (1 - d.scatter) * fade) * (1 - 0.8 * p ** 1.3);
  const chaseScale = d.chase + (1 - d.chase) * fade;
  const schedule = [
    ...base.map((seconds, i) => {
      if (seconds === 0) return 1; // el último "respiro" es de un solo tick
      return Math.max(i % 2 === 0 ? s(1) : s(2), Math.round(s(seconds) * (i % 2 === 0 ? scatterScale : chaseScale)));
    }),
    Infinity,
  ];

  // Cruise Elroy de Blinky: los presets sin él lo van recuperando poco a poco.
  // Los saltos de velocidad llegan con menos puntos restantes (la mitad al principio, igual en el nivel 100): más tiempo entre uno y otro.
  const elroy1 = Math.round((20 + 100 * p) * (0.5 + 0.5 * p));
  const elroyShare = d.elroy ? 1 : p;

  return {
    pacSpeed,
    pacFrightSpeed: Math.min(1.2, pacSpeed + 0.1),
    ghostSpeed,
    ghostTunnelSpeed: ghostTunnelBase * gMul,
    ghostFrightSpeed: ghostFrightBase * gMul,
    elroy1Dots: Math.round(elroy1 * elroyShare),
    elroy1Speed: ghostSpeed * 1.07,
    elroy2Dots: Math.round((elroy1 / 2) * elroyShare),
    elroy2Speed: ghostSpeed * 1.13,
    frightTicks,
    flashes: frightTicks === 0 ? 0 : frightSeconds >= 3 ? 5 : 3,
    schedule,
    fruit: fruitForLevel(level),
    houseLimits: level === 1 ? { pinky: 0, inky: 30, clyde: 60 } : level === 2 ? { pinky: 0, inky: 0, clyde: 50 } : { pinky: 0, inky: 0, clyde: 0 },
    idleReleaseTicks: s(level < 5 ? 4 : 3),
  };
}

/** Contadores globales de salida tras perder una vida. */
export const GLOBAL_RELEASE = { pinky: 7, inky: 17, clyde: 32 } as const;

export const GHOST_POINTS = [200, 400, 800, 1600] as const;
