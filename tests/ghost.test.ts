import { describe, expect, it } from 'vitest';
import { ORIGINAL_MAZE, ORIGINAL_PAC_SPAWN } from '../src/data/mazes/original';
import { HOUSE_DOOR_TILE, SCATTER_TARGETS, chaseTarget } from '../src/game/actors/ai';
import { Ghost, type GhostState, type MoveEnv } from '../src/game/actors/ghost';
import { Dir } from '../src/game/constants';
import { Maze } from '../src/game/maze/maze';
import { createRng } from '../src/game/random';
import { arcadeEquivalent } from '../src/game/level/curve';
import { DIFFICULTIES, getLevelRules } from '../src/game/rules';

/** Reglas del nivel global n (1–100) con el preset indicado. */
const rulesAt = (n: number, difficulty: (typeof DIFFICULTIES)[number] = 'arcade') => getLevelRules(arcadeEquivalent(n), difficulty, n);

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
  it('el estado asustado dura cada vez menos y desaparece en el último nivel', () => {
    let prev = Infinity;
    for (let n = 1; n <= 100; n++) {
      const ticks = rulesAt(n).frightTicks;
      expect(ticks, `nivel ${n}`).toBeLessThanOrEqual(prev);
      prev = ticks;
    }
    expect(rulesAt(1).frightTicks).toBe(360);
    expect(rulesAt(100).frightTicks).toBe(0);
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

describe('dificultad', () => {
  it('fácil es más suave que el arcade al principio y la ayuda se va desvaneciendo', () => {
    for (const level of [1, 2, 3, 10, 30]) {
      const easy = rulesAt(level, 'easy');
      const arcade = rulesAt(level, 'arcade');
      expect(easy.ghostSpeed).toBeLessThan(arcade.ghostSpeed);
      expect(easy.pacSpeed).toBeGreaterThan(arcade.pacSpeed);
      expect(easy.frightTicks).toBeGreaterThan(arcade.frightTicks);
      expect(easy.elroy1Dots).toBeLessThanOrEqual(arcade.elroy1Dots);
    }
    // En el último nivel el preset ya no ayuda en nada.
    const e100 = rulesAt(100, 'easy');
    const a100 = rulesAt(100, 'arcade');
    expect(e100.ghostSpeed).toBeCloseTo(a100.ghostSpeed, 5);
    expect(e100.pacSpeed).toBeCloseTo(a100.pacSpeed, 5);
  });

  it('en fácil Pac-Man es más rápido que los fantasmas en los primeros niveles', () => {
    for (const level of [1, 2, 5, 20]) {
      const r = rulesAt(level, 'easy');
      expect(r.pacSpeed, `nivel ${level}`).toBeGreaterThan(r.ghostSpeed);
    }
  });

  it('arcade respeta las tablas originales del primer nivel', () => {
    expect(getLevelRules(1, 'arcade').ghostSpeed).toBe(0.75);
    expect(getLevelRules(1).frightTicks).toBe(360);
    expect(getLevelRules(1).pacSpeed).toBe(0.8);
  });
});

describe('progresión del 1 al 100', () => {
  for (const preset of DIFFICULTIES) {
    it(`la presión sobre el jugador solo sube (preset ${preset})`, () => {
      let prevRatio = 0;
      let prevFright = Infinity;
      let prevScatter = Infinity;
      let prevElroy = -1;
      let prevGhost = 0;
      for (let n = 1; n <= 100; n++) {
        const r = rulesAt(n, preset);
        const ratio = r.ghostSpeed / r.pacSpeed;
        expect(ratio, `nivel ${n}: fantasmas/Pac-Man`).toBeGreaterThanOrEqual(prevRatio - 1e-9);
        expect(r.frightTicks, `nivel ${n}: tiempo asustado`).toBeLessThanOrEqual(prevFright);
        expect(r.schedule[0], `nivel ${n}: primera dispersión`).toBeLessThanOrEqual(prevScatter);
        expect(r.elroy1Dots, `nivel ${n}: Elroy`).toBeGreaterThanOrEqual(prevElroy);
        expect(r.ghostSpeed, `nivel ${n}: velocidad fantasmas`).toBeGreaterThanOrEqual(prevGhost - 1e-9);
        prevRatio = ratio;
        prevFright = r.frightTicks;
        prevScatter = r.schedule[0];
        prevElroy = r.elroy1Dots;
        prevGhost = r.ghostSpeed;
      }
    });

    it(`el nivel 100 es prácticamente imposible (preset ${preset}): fantasmas mucho más rápidos, sin asustados ni respiro`, () => {
      const r = rulesAt(100, preset);
      expect(r.frightTicks).toBe(0);
      expect(r.ghostSpeed / r.pacSpeed).toBeGreaterThan(1.4);
      expect(r.schedule[0]).toBeLessThanOrEqual(90); // la dispersión dura como mucho 1,5 s
      expect(r.elroy1Dots).toBeGreaterThanOrEqual(100);
    });
  }

  it('el primer nivel es asequible y el último muy superior', () => {
    const first = rulesAt(1, 'easy');
    const last = rulesAt(100, 'easy');
    expect(first.ghostSpeed / first.pacSpeed).toBeLessThan(0.8);
    expect(last.ghostSpeed / last.pacSpeed).toBeGreaterThan(1.4);
  });
});

describe('ojos de fantasma comido', () => {
  it('vuelven a casa desde cualquier casilla de los 100 laberintos (sin dar vueltas en bucle)', async () => {
    const { buildLevel } = await import('../src/game/level/levels');
    const { reachableTiles } = await import('../src/game/maze/generator');
    const failures: string[] = [];
    for (let level = 1; level <= 100; level++) {
      const lines = buildLevel(level).maze;
      const maze = new Maze(lines, ORIGINAL_PAC_SPAWN);
      const env: MoveEnv = { maze, target: HOUSE_DOOR_TILE, rng: createRng(level), houseSpeed: 0.5 };
      const reach = [...reachableTiles(lines)];
      const rng = createRng(level * 31);
      for (let i = 0; i < 12; i++) {
        const k = reach[rng.int(reach.length)];
        const col = k % 28;
        const row = Math.floor(k / 28);
        const dirs = [Dir.Up, Dir.Left, Dir.Down, Dir.Right].filter((d) => {
          const v = [[0, -1], [-1, 0], [0, 1], [1, 0]][d];
          return maze.isWalkable(col + v[0], row + v[1]);
        });
        if (dirs.length === 0) continue;
        const g = new Ghost('blinky');
        g.state = 'eaten';
        g.spawnAt(env, col, row, dirs[rng.int(dirs.length)]);
        let home = false;
        for (let t = 0; t < 3000 && !home; t++) {
          g.move(env, 1.6);
          home = (g.state as GhostState) === 'leaving';
        }
        if (!home) failures.push(`nivel ${level} desde (${col},${row})`);
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('movimiento por casillas con velocidades fraccionarias', () => {
  it('ningún fantasma se salta una casilla de decisión (ni acaba dentro de una pared) a ninguna velocidad', () => {
    const lines = ORIGINAL_MAZE;
    const maze = new Maze(lines, ORIGINAL_PAC_SPAWN);
    for (const speed of [0.6, 0.75, 0.9, 1.0, 1.3, 1.6, 1.85]) {
      const env: MoveEnv = { maze, target: { col: 1, row: 29 }, rng: createRng(3), houseSpeed: 0.5 };
      const g = new Ghost('blinky');
      g.initNav(env);
      for (let t = 0; t < 4000; t++) {
        g.move(env, speed);
        expect(maze.charAt(g.col, g.row), `velocidad ${speed}, tick ${t}`).not.toBe('#');
      }
    }
  });
});
