import { describe, expect, it } from 'vitest';
import { ORIGINAL_MAZE, ORIGINAL_PAC_SPAWN } from '../src/data/mazes/original';
import { PacMan } from '../src/game/actors/pacman';
import { BASE_SPEED, Dir, TICK_RATE } from '../src/game/constants';
import { Maze } from '../src/game/maze/maze';

const speed = (BASE_SPEED * 0.8) / TICK_RATE;

function setup() {
  const maze = new Maze(ORIGINAL_MAZE, ORIGINAL_PAC_SPAWN);
  const pac = new PacMan(ORIGINAL_PAC_SPAWN.x, ORIGINAL_PAC_SPAWN.y);
  return { maze, pac };
}

const run = (pac: PacMan, maze: Maze, ticks: number) => {
  for (let i = 0; i < ticks; i++) pac.move(maze, speed);
};

describe('PacMan', () => {
  it('arranca moviéndose a la izquierda y se detiene contra la pared', () => {
    const { maze, pac } = setup();
    run(pac, maze, 600);
    expect(pac.moving).toBe(false);
    expect(pac.dir).toBe(Dir.Left);
    // Pared en la columna 6 de la fila 23 ("#o..##"): la casilla 6 es '.', la 5 es '#'.
    expect(pac.col).toBe(6);
    expect(pac.x).toBe(6 * 8 + 4);
  });

  it('no atraviesa paredes al pedir una dirección bloqueada', () => {
    const { maze, pac } = setup();
    pac.want = Dir.Up; // sobre (13,23) hay un hueco en el pasillo: la fila 22 es '.' a la izquierda pero '#' en el centro
    run(pac, maze, 300);
    expect(maze.isWalkable(pac.col, pac.row)).toBe(true);
  });

  it('puede dar la vuelta en cualquier momento', () => {
    const { maze, pac } = setup();
    run(pac, maze, 20);
    pac.want = Dir.Right;
    run(pac, maze, 20);
    expect(pac.dir).toBe(Dir.Right);
    expect(pac.x).toBeGreaterThan(ORIGINAL_PAC_SPAWN.x - 20);
  });

  it('cruza el túnel y reaparece por el otro lado', () => {
    const { maze, pac } = setup();
    pac.x = 3 * 8 + 4;
    pac.y = 14 * 8 + 4;
    pac.dir = Dir.Left;
    run(pac, maze, 50); // ~50 px: sale por la izquierda (a los 32 px) y reaparece por la derecha
    expect(pac.x).toBeGreaterThan(200);
  });
});

describe('teclas', () => {
  it('S salta el nivel con la ayuda activada y mueve hacia abajo si está desactivada', async () => {
    const { interpretKey } = await import('../src/input/input');
    expect(interpretKey('KeyS', true)).toEqual({ dir: null, skip: true });
    expect(interpretKey('KeyS', false)).toEqual({ dir: Dir.Down, skip: false });
    expect(interpretKey('ArrowDown', true)).toEqual({ dir: Dir.Down, skip: false });
    expect(interpretKey('KeyW', true).dir).toBe(Dir.Up);
    expect(interpretKey('KeyQ', true)).toEqual({ dir: null, skip: false });
  });
});

describe('cruceta virtual', () => {
  it('traduce el desplazamiento del dedo en una dirección', async () => {
    const { directionFromOffset } = await import('../src/input/input');
    expect(directionFromOffset(30, 5, 6)).toBe(Dir.Right);
    expect(directionFromOffset(-30, 5, 6)).toBe(Dir.Left);
    expect(directionFromOffset(4, -30, 6)).toBe(Dir.Up);
    expect(directionFromOffset(4, 30, 6)).toBe(Dir.Down);
  });
  it('ignora la zona muerta del centro', async () => {
    const { directionFromOffset } = await import('../src/input/input');
    expect(directionFromOffset(2, 2, 6)).toBeNull();
  });
});

describe('supervelocidad', () => {
  it('a más del doble de velocidad Pac-Man sigue frenando centrado contra las paredes', () => {
    const { maze, pac } = setup();
    const fast = (BASE_SPEED * 1 * 2.1) / TICK_RATE;
    for (let i = 0; i < 400; i++) pac.move(maze, fast);
    expect(pac.moving).toBe(false);
    expect(pac.x).toBe(pac.col * 8 + 4);
    expect(maze.isWalkable(pac.col, pac.row)).toBe(true);
  });

  it('a supervelocidad todavía puede girar en una esquina', () => {
    const { maze, pac } = setup();
    const fast = (BASE_SPEED * 2.1) / TICK_RATE;
    for (let i = 0; i < 20; i++) pac.move(maze, fast);
    pac.want = Dir.Up;
    let turned = false;
    for (let i = 0; i < 80 && !turned; i++) {
      pac.move(maze, fast);
      turned = pac.dir === Dir.Up;
    }
    expect(turned).toBe(true);
    for (let i = 0; i < 40; i++) pac.move(maze, fast);
    expect(maze.isWalkable(pac.col, pac.row)).toBe(true);
  });
});
