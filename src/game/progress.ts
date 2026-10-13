import { ALBUM, albumForWorld } from '../data/album';
import { LEVELS_PER_WORLD, TOTAL_LEVELS } from '../data/worlds';

const KEY = 'pacman.progress';
const SETTINGS_KEY = 'pacman.settings';

export interface LevelRecord {
  /** Mejor puntuación obtenida en ese nivel. */
  bestScore: number;
  /** 0 = sin completar; 1 = completado; 2 = sin perder vidas; 3 = además en menos del tiempo de referencia. */
  stars: number;
  clears: number;
  bestSeconds: number | null;
}

export interface Progress {
  version: 1;
  levels: Record<string, LevelRecord>;
  /** Nivel más alto jugable. */
  unlocked: number;
  /** Identificadores de las entradas del álbum ya desbloqueadas. */
  album: string[];
}

export const emptyProgress = (): Progress => ({ version: 1, levels: {}, unlocked: 1, album: [] });

/** Segundos de referencia para la tercera estrella de un nivel. */
export function parSeconds(missionType: string, seconds?: number): number {
  if (missionType === 'SURVIVE') return (seconds ?? 90) + 5;
  if (missionType === 'CLEAR') return 130;
  return 100;
}

/** ★ = completado; ★★ = sin perder ninguna vida; ★★★ = además dentro del tiempo de referencia. */
export function computeStars(livesLost: number, seconds: number, par: number): number {
  if (livesLost > 0) return 1;
  return seconds <= par ? 3 : 2;
}

export interface LevelResult {
  score: number;
  livesLost: number;
  seconds: number;
  par: number;
}

export interface RecordOutcome {
  stars: number;
  newBestScore: boolean;
  newBestStars: boolean;
  /** Entradas del álbum desbloqueadas ahora mismo. */
  album: string[];
}

/** Anota un nivel completado: récords, estrellas, desbloqueo del siguiente nivel y del álbum. */
export function recordLevel(progress: Progress, level: number, result: LevelResult): RecordOutcome {
  const key = String(level);
  const prev = progress.levels[key] ?? { bestScore: 0, stars: 0, clears: 0, bestSeconds: null };
  const stars = computeStars(result.livesLost, result.seconds, result.par);
  const next: LevelRecord = {
    bestScore: Math.max(prev.bestScore, result.score),
    stars: Math.max(prev.stars, stars),
    clears: prev.clears + 1,
    bestSeconds: prev.bestSeconds === null ? result.seconds : Math.min(prev.bestSeconds, result.seconds),
  };
  progress.levels[key] = next;
  progress.unlocked = Math.max(progress.unlocked, Math.min(TOTAL_LEVELS, level + 1));

  // Al completar el último nivel de un mundo se desbloquean su carta y su recuerdo.
  const album: string[] = [];
  if (level % LEVELS_PER_WORLD === 0) {
    for (const entry of albumForWorld(level / LEVELS_PER_WORLD)) {
      if (!progress.album.includes(entry.id)) {
        progress.album.push(entry.id);
        album.push(entry.id);
      }
    }
  }
  return { stars, newBestScore: result.score > prev.bestScore, newBestStars: stars > prev.stars, album };
}

export const totalStars = (p: Progress): number => Object.values(p.levels).reduce((n, r) => n + r.stars, 0);
export const isLevelUnlocked = (p: Progress, level: number): boolean => level >= 1 && level <= p.unlocked;
export const isWorldUnlocked = (p: Progress, world: number): boolean => (world - 1) * LEVELS_PER_WORLD + 1 <= p.unlocked;
export const starsOf = (p: Progress, level: number): number => p.levels[String(level)]?.stars ?? 0;
export const worldStars = (p: Progress, world: number): number => {
  let n = 0;
  for (let l = (world - 1) * LEVELS_PER_WORLD + 1; l <= world * LEVELS_PER_WORLD; l++) n += starsOf(p, l);
  return n;
};
export const albumUnlocked = (p: Progress): number => p.album.filter((id) => ALBUM.some((e) => e.id === id)).length;

// ───────────────────────── Persistencia ─────────────────────────

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const defaultStore = (): Store | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};

/** Lee el progreso; si falta o está corrupto, empieza de cero (nunca revienta). */
export function loadProgress(store: Store | null = defaultStore()): Progress {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return emptyProgress();
    const v = JSON.parse(raw) as Partial<Progress>;
    if (v.version !== 1 || typeof v.levels !== 'object' || v.levels === null || !Number.isInteger(v.unlocked) || !Array.isArray(v.album)) return emptyProgress();
    const levels: Record<string, LevelRecord> = {};
    for (const [k, r] of Object.entries(v.levels)) {
      const n = Number(k);
      if (!Number.isInteger(n) || n < 1 || n > TOTAL_LEVELS || !r) continue;
      levels[k] = {
        bestScore: Math.max(0, Number(r.bestScore) || 0),
        stars: Math.min(3, Math.max(0, Math.floor(Number(r.stars) || 0))),
        clears: Math.max(0, Math.floor(Number(r.clears) || 0)),
        bestSeconds: r.bestSeconds === null || r.bestSeconds === undefined ? null : Math.max(0, Number(r.bestSeconds) || 0),
      };
    }
    return { version: 1, levels, unlocked: Math.min(TOTAL_LEVELS, Math.max(1, v.unlocked!)), album: v.album.filter((id) => typeof id === 'string') };
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(p: Progress, store: Store | null = defaultStore()): void {
  try {
    store?.setItem(KEY, JSON.stringify(p));
  } catch {
    /* sin almacenamiento */
  }
}

export function clearProgress(store: Store | null = defaultStore()): void {
  try {
    store?.removeItem(KEY);
  } catch {
    /* sin almacenamiento */
  }
}

// ───────────────────────── Ajustes ─────────────────────────

export interface Settings {
  /** Partículas ambientales de cada mundo. */
  particles: boolean;
  /** Ayuda de desarrollo: la tecla S completa el nivel. */
  devSkip: boolean;
}

export const defaultSettings = (): Settings => ({ particles: true, devSkip: true });

export function loadSettings(store: Store | null = defaultStore()): Settings {
  try {
    const v = JSON.parse(store?.getItem(SETTINGS_KEY) ?? 'null') as Partial<Settings> | null;
    const base = defaultSettings();
    return {
      particles: typeof v?.particles === 'boolean' ? v.particles : base.particles,
      devSkip: typeof v?.devSkip === 'boolean' ? v.devSkip : base.devSkip,
    };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(s: Settings, store: Store | null = defaultStore()): void {
  try {
    store?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* sin almacenamiento */
  }
}
