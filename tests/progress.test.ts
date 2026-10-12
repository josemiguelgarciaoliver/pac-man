import { describe, expect, it } from 'vitest';
import { ALBUM, albumForWorld } from '../src/data/album';
import { clearProgress, computeStars, defaultSettings, emptyProgress, isLevelUnlocked, isWorldUnlocked, loadProgress, loadSettings, parSeconds, recordLevel, saveProgress, saveSettings, starsOf, totalStars, worldStars } from '../src/game/progress';

const memoryStore = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
};

const result = (over: Partial<{ score: number; livesLost: number; seconds: number; par: number }> = {}) => ({ score: 1000, livesLost: 0, seconds: 60, par: 100, ...over });

describe('estrellas', () => {
  it('★ completar, ★★ sin perder vidas, ★★★ además dentro del tiempo', () => {
    expect(computeStars(1, 10, 100)).toBe(1);
    expect(computeStars(3, 10, 100)).toBe(1);
    expect(computeStars(0, 150, 100)).toBe(2);
    expect(computeStars(0, 100, 100)).toBe(3);
    expect(computeStars(0, 40, 100)).toBe(3);
  });

  it('el tiempo de referencia depende de la misión', () => {
    expect(parSeconds('CLEAR')).toBeGreaterThan(parSeconds('COLLECT'));
    expect(parSeconds('SURVIVE', 90)).toBe(95);
  });
});

describe('registro de niveles', () => {
  it('completar un nivel desbloquea el siguiente y guarda récords', () => {
    const p = emptyProgress();
    expect(isLevelUnlocked(p, 1)).toBe(true);
    expect(isLevelUnlocked(p, 2)).toBe(false);
    const o = recordLevel(p, 1, result());
    expect(o).toMatchObject({ stars: 3, newBestScore: true, newBestStars: true });
    expect(p.unlocked).toBe(2);
    expect(starsOf(p, 1)).toBe(3);
    expect(p.levels['1']).toMatchObject({ bestScore: 1000, clears: 1, bestSeconds: 60 });
  });

  it('solo mejora los récords: no los empeora', () => {
    const p = emptyProgress();
    recordLevel(p, 5, result({ score: 5000, seconds: 50 }));
    const worse = recordLevel(p, 5, result({ score: 2000, livesLost: 2, seconds: 120 }));
    expect(worse).toMatchObject({ stars: 1, newBestScore: false, newBestStars: false });
    expect(p.levels['5']).toMatchObject({ bestScore: 5000, stars: 3, clears: 2, bestSeconds: 50 });
    expect(p.unlocked).toBe(6);
  });

  it('rejugar un nivel viejo no baja el nivel desbloqueado', () => {
    const p = emptyProgress();
    recordLevel(p, 9, result());
    recordLevel(p, 2, result());
    expect(p.unlocked).toBe(10);
  });

  it('el último mundo no pasa del nivel 100', () => {
    const p = emptyProgress();
    recordLevel(p, 100, result());
    expect(p.unlocked).toBe(100);
  });

  it('completar el último nivel de un mundo desbloquea su carta y su recuerdo (una sola vez)', () => {
    const p = emptyProgress();
    recordLevel(p, 9, result());
    expect(p.album).toEqual([]);
    const first = recordLevel(p, 10, result());
    expect(first.album.sort()).toEqual(['letter-1', 'memory-1']);
    expect(recordLevel(p, 10, result()).album).toEqual([]);
    expect(p.album).toHaveLength(2);
  });

  it('suma estrellas por mundo y en total, y los mundos se abren con el progreso', () => {
    const p = emptyProgress();
    expect(isWorldUnlocked(p, 1)).toBe(true);
    expect(isWorldUnlocked(p, 2)).toBe(false);
    for (let l = 1; l <= 10; l++) recordLevel(p, l, result({ livesLost: l % 2 }));
    expect(worldStars(p, 1)).toBe(5 * 3 + 5 * 1);
    expect(totalStars(p)).toBe(20);
    expect(isWorldUnlocked(p, 2)).toBe(true);
    expect(isWorldUnlocked(p, 3)).toBe(false);
  });
});

describe('persistencia', () => {
  it('guarda y recupera el progreso', () => {
    const store = memoryStore();
    const p = emptyProgress();
    recordLevel(p, 1, result());
    saveProgress(p, store);
    expect(loadProgress(store)).toEqual(p);
    clearProgress(store);
    expect(loadProgress(store)).toEqual(emptyProgress());
  });

  it('un guardado corrupto o manipulado nunca rompe el juego', () => {
    const store = memoryStore();
    store.setItem('pacman.progress', 'esto no es json');
    expect(loadProgress(store)).toEqual(emptyProgress());
    store.setItem('pacman.progress', JSON.stringify({ version: 1, unlocked: 999, album: ['x', 3], levels: { '1': { stars: 99, bestScore: -5, clears: 'a' }, '500': { stars: 1 }, abc: {} } }));
    const p = loadProgress(store);
    expect(p.unlocked).toBe(100);
    expect(p.album).toEqual(['x']);
    expect(p.levels['1']).toMatchObject({ stars: 3, bestScore: 0, clears: 0 });
    expect(Object.keys(p.levels)).toEqual(['1']);
  });

  it('sin almacenamiento funciona igual', () => {
    expect(loadProgress(null)).toEqual(emptyProgress());
    expect(() => saveProgress(emptyProgress(), null)).not.toThrow();
  });

  it('los ajustes se guardan y tienen valores por defecto', () => {
    const store = memoryStore();
    expect(loadSettings(store)).toEqual(defaultSettings());
    saveSettings({ particles: false }, store);
    expect(loadSettings(store)).toEqual({ particles: false });
    store.setItem('pacman.settings', '{"particles": "nope"}');
    expect(loadSettings(store)).toEqual(defaultSettings());
  });
});

describe('álbum familiar', () => {
  it('tiene una carta y un recuerdo por mundo, con ids únicos y líneas que caben', () => {
    expect(ALBUM).toHaveLength(20);
    expect(new Set(ALBUM.map((e) => e.id)).size).toBe(20);
    for (let w = 1; w <= 10; w++) {
      const entries = albumForWorld(w);
      expect(entries.map((e) => e.kind).sort(), `mundo ${w}`).toEqual(['letter', 'memory']);
    }
    for (const e of ALBUM) {
      expect(e.lines.length).toBeLessThanOrEqual(4);
      for (const line of e.lines) expect(line.length, `${e.id}: ${line}`).toBeLessThanOrEqual(26);
      expect(e.title.length).toBeLessThanOrEqual(26);
    }
  });
});
