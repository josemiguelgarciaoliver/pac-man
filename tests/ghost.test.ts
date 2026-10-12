import { describe, expect, it } from 'vitest';
import { ORIGINAL_MAZE, ORIGINAL_PAC_SPAWN } from '../src/data/mazes/original';
import { HOUSE_DOOR_TILE, SCATTER_TARGETS, chaseTarget } from '../src/game/actors/ai';
import { Ghost, type GhostState, type MoveEnv } from '../src/game/actors/ghost';
import { Dir } from '../src/game/constants';
import { Maze } from '../src/game/maze/maze';
import { createRng } from '../src/game/random';
import { getLevelRules } from '../src/game/rules';

const pac = (col: number, row: number, dir: Dir) => ({ col, row, dir });

describe('objetivos de los fantasmas', () => {
  const blinky = { col: 10, row: 5 };
  it('Blinky persigue la casilla de Pac-Man', () => {
    expect(chaseTarget('blinky', blinky, pac(14, 20, Dir.Left), blinky)).toEqual({ col: 14, row: 20 });
  });
  it('Pinky apunta 4 casillas por delante', () => {
    expect(chaseTarget('pinky', blinky, pac(14, 20, Dir.Right), blinky)).toEqual({ col: 18, row: 20 });
    expect(chaseTarget('pinky', blinky, pac(14, 20, Dir.Down), blinky)).toEqual({ col: 14, row: 24 });
  });
  it('Pinky replica el bug del desbordamiento al mirar arriba (4 arriba y 4 a la izquierda)', () => {
    expect(chaseTarget('pinky', blinky, pac(14, 20, Dir.Up), blinky)).toEqual({ col: 10, row: 16 });
  });
  it('Inky duplica el vector desde Blinky al punto 2 casillas por delante de Pac-Man', () => {
    // Pac en (14,20) mirando a la derecha → ref (16,20); vector Blinky→ref = (6,15); ×2 desde Blinky.
    expect(chaseTarget('inky', blinky, pac(14, 20, Dir.Right), blinky)).toEqual({ col: 22, row: 35 });
  });
  it('Clyde persigue si está lejos y se va a su esquina si está a menos de 8 casillas', () => {
    expect(chaseTarget('clyde', { col: 1, row: 1 }, pac(20, 20, Dir.Left), blinky)).toEqual({ col: 20, row: 20 });
    expect(chaseTarget('clyde', { col: 18, row: 20 }, pac(20, 20, Dir.Left), blinky)).toEqual(SCATTER_TARGETS.clyde);
  });
});

describe('reglas por nivel', () => {
  it('el nivel 1 usa 80 % para Pac-Man y 75 % para los fantasmas', () => {
    const r = getLevelRules(1);
    expect(r.pacSpeed).toBe(0.8);
    expect(r.ghostSpeed).toBe(0.75);
    expect(r.frightTicks).toBe(360);
  });
  it('a partir del nivel 19 no hay estado asustado', () => {
    expect(getLevelRules(19).frightTicks).toBe(0);
    expect(getLevelRules(17).frightTicks).toBe(0);
  });
  it('la última fase del calendario es persecución infinita', () => {
    for (const lv of [1, 2, 5, 30]) {
      const s = getLevelRules(lv).schedule;
      expect(s[s.length - 1]).toBe(Infinity);
      expect(s.length % 2).toBe(0); // acaba en índice impar = chase
    }
  });
});

describe('movimiento de un fantasma', () => {
  const maze = new Maze(ORIGINAL_MAZE, ORIGINAL_PAC_SPAWN);
  const env = (target: { col: number; row: number }): MoveEnv => ({ maze, target, rng: createRng(1), houseSpeed: 0.5 });

  it('Blinky sale por la izquierda y no atraviesa paredes', () => {
    const b = new Ghost('blinky');
    const e = env({ col: 14, row: 23 });
    b.initNav(e);
    for (let i = 0; i < 2000; i++) {
      b.move(e, 1);
      expect(ORIGINAL_MAZE[b.row]?.[b.col] ?? ' ').not.toBe('#');
    }
  });

  it('Blinky llega hasta Pac-Man (objetivo fijo accesible)', () => {
    const b = new Ghost('blinky');
    const target = { col: 6, row: 23 };
    const e = env(target);
    b.initNav(e);
    let reached = false;
    for (let i = 0; i < 3000 && !reached; i++) {
      b.move(e, 1);
      reached = b.col === target.col && b.row === target.row;
    }
    expect(reached).toBe(true);
  });

  it('un fantasma comido vuelve a casa y revive saliendo', () => {
    const g = new Ghost('blinky');
    const e = env(HOUSE_DOOR_TILE);
    g.initNav(e);
    g.state = 'eaten';
    let revived = false;
    for (let i = 0; i < 4000 && !revived; i++) {
      g.move(e, 1.6);
      if ((g.state as GhostState) === 'leaving') revived = true;
    }
    expect(revived).toBe(true);
    expect(g.frightened).toBe(false);
  });

  it('los fantasmas de la casa salen y quedan activos', () => {
    const g = new Ghost('inky');
    const e = env({ col: 6, row: 23 });
    g.state = 'leaving';
    for (let i = 0; i < 400 && (g.state as GhostState) !== 'active'; i++) g.move(e, 0.5);
    expect(g.state).toBe('active');
    expect(g.row).toBe(11);
  });

  it('no gira hacia arriba en los cruces restringidos', () => {
    const g = new Ghost('blinky');
    // Objetivo muy arriba: el fantasma querría subir por (12,23) pero no puede.
    const e = env({ col: 12, row: -5 });
    g.initNav(e);
    g.x = 7 * 8 + 4;
    g.y = 23 * 8 + 4;
    g.dir = Dir.Right;
    g.nextDir = Dir.Right;
    const seenAt12: number[] = [];
    for (let i = 0; i < 40; i++) {
      g.move(e, 1);
      if (g.col === 12 && g.row === 23) seenAt12.push(g.y);
    }
    expect(seenAt12.every((y) => y === 23 * 8 + 4)).toBe(true);
  });
});
