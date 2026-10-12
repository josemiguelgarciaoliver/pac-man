import { describe, expect, it } from 'vitest';
import { CHECKPOINT_EVERY, clearCheckpoint, isCheckpointLevel, loadCheckpoint, parseCheckpoint, saveCheckpoint } from '../src/game/checkpoint';

const memoryStore = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
};

describe('checkpoints', () => {
  it('se guardan cada 2 niveles completados, salvo en el último', () => {
    expect(CHECKPOINT_EVERY).toBe(2);
    const saved = Array.from({ length: 100 }, (_, i) => i + 1).filter(isCheckpointLevel);
    expect(saved.slice(0, 4)).toEqual([2, 4, 6, 8]);
    expect(saved).toHaveLength(49);
    expect(saved).not.toContain(100);
    expect(isCheckpointLevel(1)).toBe(false);
    expect(isCheckpointLevel(99)).toBe(false);
  });

  it('se guardan, se cargan y se borran', () => {
    const store = memoryStore();
    expect(loadCheckpoint(store)).toBeNull();
    saveCheckpoint({ level: 5, score: 12340, lives: 3, difficulty: 'normal' }, store);
    expect(loadCheckpoint(store)).toEqual({ level: 5, score: 12340, lives: 3, difficulty: 'normal' });
    clearCheckpoint(store);
    expect(loadCheckpoint(store)).toBeNull();
  });

  it('descarta datos corruptos o manipulados', () => {
    expect(parseCheckpoint('no es json')).toBeNull();
    expect(parseCheckpoint('{"level":1,"score":0,"lives":2,"difficulty":"easy"}')).toBeNull(); // nada que continuar
    expect(parseCheckpoint('{"level":101,"score":0,"lives":2,"difficulty":"easy"}')).toBeNull();
    expect(parseCheckpoint('{"level":5,"score":-4,"lives":2,"difficulty":"easy"}')).toBeNull();
    expect(parseCheckpoint('{"level":5,"score":0,"lives":2,"difficulty":"imposible"}')).toBeNull();
    expect(parseCheckpoint('{"level":5,"score":10,"lives":2,"difficulty":"easy"}')).not.toBeNull();
  });

  it('sin almacenamiento no rompe nada', () => {
    expect(loadCheckpoint(null)).toBeNull();
    expect(() => saveCheckpoint({ level: 3, score: 0, lives: 2, difficulty: 'easy' }, null)).not.toThrow();
  });
});
