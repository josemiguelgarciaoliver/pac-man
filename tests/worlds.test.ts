import { describe, expect, it } from 'vitest';
import { WORLD_NAMES, levelPosition } from '../src/data/worlds';

describe('levelPosition', () => {
  it('reparte 100 niveles en 10 mundos de 10 niveles', () => {
    expect(levelPosition(1)).toMatchObject({ world: 1, stage: 1, name: 'Arcade Clásico' });
    expect(levelPosition(10)).toMatchObject({ world: 1, stage: 10 });
    expect(levelPosition(11)).toMatchObject({ world: 2, stage: 1 });
    expect(levelPosition(100)).toMatchObject({ world: 10, stage: 10, name: 'El Núcleo Glitch' });
    expect(WORLD_NAMES).toHaveLength(10);
  });
  it('limita los valores fuera de rango', () => {
    expect(levelPosition(0).level).toBe(1);
    expect(levelPosition(250).level).toBe(100);
  });
});
