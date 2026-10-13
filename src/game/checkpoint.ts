import { TOTAL_LEVELS } from '../data/worlds';
import { DIFFICULTIES, type Difficulty } from './rules';

/** Se guarda un checkpoint cada vez que se completa un nivel múltiplo de este número. */
export const CHECKPOINT_EVERY = 2;
/** Vidas extra mínimas al continuar desde un checkpoint (para no reanudar a un golpe del final). */
export const CHECKPOINT_MIN_LIVES = 2;

const KEY = 'pacman.checkpoint';

export interface Checkpoint {
  /** Siguiente nivel a jugar (el que sigue al último completado). */
  level: number;
  score: number;
  lives: number;
  difficulty: Difficulty;
  /** Letras de AINA y ALEIX conseguidas hasta ahora (misión de todo el juego). */
  letters?: { aina: boolean[]; aleix: boolean[] };
}

/** ¿Al completar este nivel toca guardar? (el último nivel no: ahí acaba el juego) */
export const isCheckpointLevel = (completed: number): boolean => completed % CHECKPOINT_EVERY === 0 && completed < TOTAL_LEVELS;

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const defaultStore = (): Store | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};

export function parseCheckpoint(raw: string | null): Checkpoint | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Checkpoint>;
    const ok =
      Number.isInteger(v.level) &&
      v.level! >= 2 &&
      v.level! <= TOTAL_LEVELS &&
      Number.isFinite(v.score) &&
      v.score! >= 0 &&
      Number.isInteger(v.lives) &&
      v.lives! >= 0 &&
      DIFFICULTIES.includes(v.difficulty as Difficulty);
    return ok ? (v as Checkpoint) : null;
  } catch {
    return null;
  }
}

export function loadCheckpoint(store: Store | null = defaultStore()): Checkpoint | null {
  try {
    return parseCheckpoint(store?.getItem(KEY) ?? null);
  } catch {
    return null;
  }
}

export function saveCheckpoint(cp: Checkpoint, store: Store | null = defaultStore()): void {
  try {
    store?.setItem(KEY, JSON.stringify(cp));
  } catch {
    /* sin almacenamiento: se juega igual, solo que sin checkpoint */
  }
}

export function clearCheckpoint(store: Store | null = defaultStore()): void {
  try {
    store?.removeItem(KEY);
  } catch {
    /* sin almacenamiento */
  }
}
