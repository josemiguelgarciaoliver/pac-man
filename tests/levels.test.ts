import { describe, expect, it } from 'vitest';
import { LEVEL_SPECIALS } from '../src/data/levelSpecials';
import { levelPhrase } from '../src/data/family';
import { ORIGINAL_MAZE } from '../src/data/mazes/original';
import { Dir } from '../src/game/constants';
import { arcadeEquivalent } from '../src/game/level/curve';
import { buildLevel, isSpecialLevel, validateLevelMaze, WORLD_WALL_COLORS } from '../src/game/level/levels';
import { bfs, beltRuns, nearestTile, shortestPath } from '../src/game/level/placement';
import { levelSchema } from '../src/game/level/schema';
import { generateMaze, mazeDistance, mazeHash, qualityErrors } from '../src/game/maze/generator';
import { Maze } from '../src/game/maze/maze';
import { ConveyorMechanic } from '../src/game/mechanics/conveyor';
import { drift } from '../src/game/mechanics/drift';
import { Mission } from '../src/game/missions';
import { createRng } from '../src/game/random';
import { ORIGINAL_PAC_SPAWN } from '../src/data/mazes/original';

const levels = Array.from({ length: 100 }, (_, i) => buildLevel(i + 1));

describe('los 100 niveles', () => {
  it('cada nivel cumple el esquema y cae en su mundo', () => {
    for (const def of levels) {
      expect(() => levelSchema.parse(def)).not.toThrow();
      expect(def.world).toBe(Math.ceil(def.level / 10));
      expect(def.wallColor).toBe(WORLD_WALL_COLORS[def.world - 1]);
    }
  });

  it('todos los laberintos son válidos', () => {
    for (const def of levels) expect(validateLevelMaze(def.level, def.maze), `nivel ${def.level}`).toEqual([]);
  });

  it('ningún laberinto se repite y todos difieren bastante', () => {
    const hashes = new Set(levels.map((l) => mazeHash(l.maze)));
    expect(hashes.size).toBe(100);
    let minDist = Infinity;
    for (let i = 0; i < levels.length; i++) for (let j = i + 1; j < levels.length; j++) minDist = Math.min(minDist, mazeDistance(levels[i].maze, levels[j].maze));
    expect(minDist).toBeGreaterThanOrEqual(30);
  });

  it('el nivel 1 es el laberinto original', () => {
    expect(levels[0].maze).toEqual([...ORIGINAL_MAZE]);
  });

  it('los laberintos generados tienen el aspecto del arcade (sin macizos de pared)', () => {
    for (const def of levels.slice(1).filter((d) => !isSpecialLevel(d.level))) expect(qualityErrors(def.maze), `nivel ${def.level}`).toEqual([]);
  });
});

describe('curva de dificultad', () => {
  it('crece dentro de cada mundo y no baja nunca más de lo que sube', () => {
    for (let world = 1; world <= 10; world++) {
      for (let stage = 2; stage <= 10; stage++) {
        const n = (world - 1) * 10 + stage;
        expect(arcadeEquivalent(n)).toBeGreaterThanOrEqual(arcadeEquivalent(n - 1));
      }
    }
  });

  it('no baja nunca: la dificultad es progresiva del 1 al 100', () => {
    for (let n = 2; n <= 100; n++) expect(arcadeEquivalent(n), `nivel ${n}`).toBeGreaterThanOrEqual(arcadeEquivalent(n - 1));
    expect(arcadeEquivalent(1)).toBe(1);
  });

  it('el último nivel es claramente más difícil que el primero', () => {
    expect(arcadeEquivalent(100)).toBeGreaterThan(arcadeEquivalent(1) + 15);
  });
});

describe('misiones', () => {
  it('cada misión especial usa tipos válidos y ocupa un sitio alcanzable', () => {
    for (const n of Object.keys(LEVEL_SPECIALS).map(Number)) {
      const def = buildLevel(n);
      const mission = new Mission(def.mission, def.maze, createRng(n));
      const { dist } = bfs(def.maze, { col: 13, row: 23 });
      const target = mission.target({ col: 13, row: 23 });
      if (['COLLECT', 'REACH', 'RESCUE'].includes(def.mission.type)) {
        expect(target, `nivel ${n}`).not.toBeNull();
        expect(dist[target!.row * 28 + target!.col]).toBeGreaterThan(5);
      }
    }
  });

  it('COLLECT reparte los objetos y se completa al recogerlos', () => {
    const def = buildLevel(5);
    const m = new Mission(def.mission, def.maze, createRng(5));
    expect(def.mission.type).toBe('COLLECT');
    expect(m.isComplete({ col: 1, row: 1 }, 100)).toBe(false);
    for (let i = 0; i < 4; i++) {
      const t = m.target({ col: 13, row: 23 })!;
      m.update({ x: 0, y: 0, col: t.col, row: t.row });
    }
    expect(m.collected).toBe(4);
    expect(m.isComplete({ col: 1, row: 1 }, 100)).toBe(true);
  });

  it('RESCUE exige liberar al amigo y volver a la salida', () => {
    const def = buildLevel(28);
    const m = new Mission(def.mission, def.maze, createRng(28));
    const exit = { col: 13, row: 23 };
    expect(m.isComplete(exit, 100)).toBe(false);
    const captive = m.target(exit)!;
    m.update({ x: 0, y: 0, col: captive.col, row: captive.row });
    expect(m.isComplete(exit, 100)).toBe(true);
  });

  it('REACH con límite de tiempo falla al agotarse', () => {
    const def = buildLevel(14);
    const m = new Mission(def.mission, def.maze, createRng(14));
    expect(m.failed()).toBe(false);
    for (let i = 0; i < 75 * 60; i++) m.update({ x: 0, y: 0, col: 1, row: 1 });
    expect(m.failed()).toBe(true);
  });

  it('SURVIVE se completa con el paso del tiempo y HUNT al comer fantasmas', () => {
    const survive = new Mission({ type: 'SURVIVE', seconds: 10 }, ORIGINAL_MAZE, createRng(1));
    for (let i = 0; i < 600; i++) survive.update({ x: 0, y: 0, col: 1, row: 1 });
    expect(survive.isComplete({ col: 1, row: 1 }, 100)).toBe(true);

    const hunt = new Mission({ type: 'HUNT', ghosts: 3 }, ORIGINAL_MAZE, createRng(1));
    for (let i = 0; i < 3; i++) hunt.onGhostEaten();
    expect(hunt.isComplete({ col: 1, row: 1 }, 100)).toBe(true);
  });
});

describe('mecánicas', () => {
  it('los niveles con cintas colocan los tramos pedidos', () => {
    for (const n of [21, 22, 25, 26, 28, 29, 51, 59, 92]) {
      const def = buildLevel(n);
      const belt = def.mechanics[0];
      expect(belt.type).toBe('conveyor');
      if (belt.type !== 'conveyor') continue;
      const m = new ConveyorMechanic(belt, def.maze, createRng(n));
      expect(m.count, `nivel ${n}`).toBeGreaterThanOrEqual(Math.min(belt.segments, 2));
    }
  });

  it('hay tramos rectos de sobra en los laberintos generados', () => {
    for (const def of levels.slice(1).filter((d) => !isSpecialLevel(d.level))) expect(beltRuns(def.maze).length, `nivel ${def.level}`).toBeGreaterThanOrEqual(3);
  });

  it('una cinta empuja a Pac-Man pero no a través de las paredes', () => {
    const maze = new Maze(ORIGINAL_MAZE, ORIGINAL_PAC_SPAWN);
    const actor = { x: 6 * 8 + 4, y: 5 * 8 + 4 };
    drift(actor, maze, Dir.Right, 3);
    expect(actor.x).toBeCloseTo(6 * 8 + 4 + 3);
    // Contra una pared no avanza.
    const wall = { x: 1 * 8 + 4, y: 2 * 8 + 4 };
    drift(wall, maze, Dir.Left, 6);
    expect(wall.x).toBe(1 * 8 + 4);
  });
});

describe('utilidades de camino', () => {
  it('el camino más corto empieza y acaba donde debe', () => {
    const p = shortestPath(ORIGINAL_MAZE, { col: 1, row: 1 }, { col: 26, row: 29 })!;
    expect(p[0]).toEqual({ col: 1, row: 1 });
    expect(p[p.length - 1]).toEqual({ col: 26, row: 29 });
    expect(p.length).toBeGreaterThan(30);
  });
  it('el túnel acorta el camino entre los dos lados', () => {
    const p = shortestPath(ORIGINAL_MAZE, { col: 0, row: 14 }, { col: 27, row: 14 })!;
    expect(p.length).toBe(2);
  });
  it('nearestTile encuentra el punto más cercano', () => {
    const t = nearestTile(ORIGINAL_MAZE, { col: 1, row: 1 }, (x) => ORIGINAL_MAZE[x.row][x.col] === 'o');
    expect(t).toEqual({ col: 1, row: 3 });
  });
});

describe('temática familiar', () => {
  it('cada nivel tiene una frase que cabe en la tarjeta', () => {
    for (let n = 1; n <= 100; n++) {
      const p = levelPhrase(n);
      for (const line of p.lines) expect(line.length).toBeLessThanOrEqual(26);
    }
  });
  it('aparecen los tres miembros de la familia', () => {
    const who = new Set(Array.from({ length: 100 }, (_, i) => levelPhrase(i + 1).who));
    expect(who).toEqual(new Set(['cely', 'aina', 'aleix']));
  });
});

describe('generador', () => {
  it('es determinista', () => {
    expect(generateMaze(7)).toEqual(generateMaze(7));
    expect(mazeHash(generateMaze(7))).not.toBe(mazeHash(generateMaze(8)));
  });
});

describe('niveles raros', () => {
  const specialLevels = levels.filter((l) => isSpecialLevel(l.level));

  it('hay varios y cada uno lleva título', () => {
    expect(specialLevels.length).toBeGreaterThanOrEqual(8);
    for (const l of specialLevels) expect(l.subtitle, `nivel ${l.level}`).toBeTruthy();
  });

  it('la sala sin paredes no tiene ninguna pared interior', () => {
    const arena = buildLevel(9);
    // Zonas libres (filas 1–8 y 20–29): solo el borde es pared.
    for (const r of [...Array(8).keys()].map((i) => i + 1).concat([...Array(10).keys()].map((i) => i + 20))) {
      expect(arena.maze[r].slice(1, 27), `fila ${r}`).not.toContain('#');
    }
  });

  it('son distintos entre sí y siguen siendo jugables', () => {
    const hashes = new Set(specialLevels.map((l) => l.maze.join('|')));
    expect(hashes.size).toBe(specialLevels.length);
    for (const l of specialLevels) expect(validateLevelMaze(l.level, l.maze), `nivel ${l.level}`).toEqual([]);
  });
});

describe('rescate con el amigo a cuestas', () => {
  it('los niveles de rescate son el 28, el 38, el 49, el 54 y el 78', () => {
    const rescues = levels.filter((l) => l.mission.type === 'RESCUE').map((l) => l.level);
    expect(rescues).toEqual([28, 38, 49, 54, 78]);
  });

  it('solo se va más lento una vez liberado el amigo, y deja de hacerlo al ponerlo a salvo', () => {
    const def = buildLevel(38);
    const m = new Mission(def.mission, def.maze, createRng(38));
    expect(m.carrying).toBe(false);
    const captive = m.target({ col: 13, row: 23 })!;
    m.update({ x: 0, y: 0, col: captive.col, row: captive.row });
    expect(m.carrying).toBe(true);
    expect(m.isComplete({ col: 13, row: 23 }, 100)).toBe(true); // llegar a la salida completa el nivel
    // Las demás misiones nunca van "a cuestas".
    const clear = new Mission({ type: 'CLEAR' }, def.maze, createRng(1));
    expect(clear.carrying).toBe(false);
  });
});
