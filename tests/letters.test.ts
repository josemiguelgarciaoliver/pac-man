import { describe, expect, it } from 'vitest';
import { parseCheckpoint } from '../src/game/checkpoint';
import { LetterCollection, LetterTokens } from '../src/game/letters';
import { buildLevel } from '../src/game/level/levels';
import { createRng } from '../src/game/random';

describe('letras AINA y ALEIX', () => {
  it('AINA se completa con A, I, N, A (en cualquier orden) y se reinicia', () => {
    const c = new LetterCollection();
    expect(c.collect('N')).toEqual([]);
    expect(c.collect('A')).toEqual([]);
    expect(c.collect('I')).toEqual([]);
    expect(c.collect('A')).toEqual(['aina']);
    expect(c.slots.aina.every((b) => !b)).toBe(true); // reiniciada
    expect(c.slots.aleix.filter(Boolean)).toHaveLength(2); // la A y la I también contaron para ALEIX
  });

  it('ALEIX se completa con A, L, E, I, X', () => {
    const c = new LetterCollection();
    for (const l of ['L', 'E', 'X', 'I']) expect(c.collect(l)).toEqual([]);
    expect(c.collect('A')).toEqual(['aleix']);
    expect(c.slots.aleix.every((b) => !b)).toBe(true);
    expect(c.slots.aina.filter(Boolean)).toHaveLength(2); // A e I de AINA ya puestas
  });

  it('si una sola letra remata las dos palabras a la vez, devuelve las dos (dos vidas)', () => {
    const c = new LetterCollection();
    expect(['A', 'L', 'E', 'I'].flatMap((l) => c.collect(l))).toEqual([]);
    expect(c.collect('X')).toEqual(['aleix']); // ALEIX completa y se reinicia; AINA lleva A e I
    expect(['N', 'L', 'E', 'X', 'I'].flatMap((l) => c.collect(l))).toEqual([]); // AINA: A I N · ALEIX: L E X I
    expect(c.collect('A')).toEqual(['aina', 'aleix']); // la 2.ª A de AINA y la A de ALEIX
    expect(c.slots.aina.concat(c.slots.aleix).some(Boolean)).toBe(false);
  });

  it('solo se piden letras que sirven para algún hueco', () => {
    const c = new LetterCollection();
    expect(c.needed().sort()).toEqual(['A', 'E', 'I', 'L', 'N', 'X']);
    for (const l of ['L', 'E', 'X']) c.collect(l);
    expect(c.needed().sort()).toEqual(['A', 'I', 'N']);
  });

  it('se guarda y se recupera, y un guardado roto empieza de cero', () => {
    const c = new LetterCollection();
    c.collect('A');
    c.collect('N');
    const d = new LetterCollection();
    d.restore(c.snapshot());
    expect(d.slots).toEqual(c.slots);
    d.restore({ aina: [true], aleix: [] } as never);
    expect(d.slots.aina).toEqual([false, false, false, false]);
    d.restore(undefined);
    expect(d.slots.aleix).toHaveLength(5);
  });

  it('el checkpoint conserva las letras', () => {
    const raw = JSON.stringify({ level: 5, score: 10, lives: 3, difficulty: 'normal', letters: { aina: [true, false, false, false], aleix: [false, false, false, false, false] } });
    expect(parseCheckpoint(raw)?.letters?.aina[0]).toBe(true);
    expect(parseCheckpoint(JSON.stringify({ level: 5, score: 10, lives: 3, difficulty: 'normal' }))?.letters).toBeUndefined();
  });
});

describe('letras sueltas por el laberinto', () => {
  it('aparecen al azar (a veces ninguna), nunca encima de otros objetos, y se recogen al pisarlas', () => {
    const def = buildLevel(20);
    const c = new LetterCollection();
    const avoid = [{ col: 6, row: 1 }];
    let withLetters = 0;
    let none = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const t = new LetterTokens(def.maze, createRng(seed), c, avoid);
      if (t.tiles.length === 0) none++;
      else withLetters++;
      for (const tile of t.tiles) expect(Math.abs(tile.col - 6) + Math.abs(tile.row - 1)).toBeGreaterThanOrEqual(2);
      for (const l of t.letters) expect(['A', 'L', 'E', 'I', 'X', 'N']).toContain(l);
      if (t.tiles.length > 0) {
        const got = t.update({ col: t.tiles[0].col, row: t.tiles[0].row });
        expect(got.length).toBeGreaterThanOrEqual(1);
        expect(t.update({ col: t.tiles[0]?.col ?? -1, row: t.tiles[0]?.row ?? -1 }).length).toBeLessThanOrEqual(1);
      }
    }
    expect(none).toBeGreaterThan(30);
    expect(withLetters).toBeGreaterThan(80);
  });
});

describe('HUD de letras', () => {
  it('las dos palabras juntas caben entre los botones de ayuda y el nivel, centradas en la pantalla', async () => {
    const { LETTER_HUD_WIDTH } = await import('../src/game/letters');
    const { SCREEN_W } = await import('../src/game/constants');
    const left = SCREEN_W / 2 - LETTER_HUD_WIDTH / 2;
    expect(left).toBeGreaterThan(30); // a la derecha de los botones A y L
    expect(left + LETTER_HUD_WIDTH).toBeLessThan(SCREEN_W - 50);
    expect(left + LETTER_HUD_WIDTH / 2).toBeCloseTo(SCREEN_W / 2, 5);
  });
});
