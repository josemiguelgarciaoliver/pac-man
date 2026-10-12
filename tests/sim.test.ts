import { describe, expect, it, vi } from 'vitest';
import { Dir } from '../src/game/constants';
import { createRng } from '../src/game/random';

// El dibujo de paredes necesita un canvas real; la simulación solo necesita la lógica.
vi.mock('../src/game/maze/render', () => ({ renderWalls: () => ({}) }));

const { Game } = await import('../src/game/game');

class FakeInput {
  direction: Dir | null = null;
  private flags = { press: false, pause: false, mute: false, aina: false, aleix: false };
  poll() {}
  consumePress() {
    const v = this.flags.press;
    this.flags.press = false;
    return v;
  }
  consumePause() {
    const v = this.flags.pause;
    this.flags.pause = false;
    return v;
  }
  consumeMute() {
    return false;
  }
  consumeAina() {
    const v = this.flags.aina;
    this.flags.aina = false;
    return v;
  }
  consumeAleix() {
    const v = this.flags.aleix;
    this.flags.aleix = false;
    return v;
  }
  request(kind: 'aina' | 'aleix') {
    this.flags[kind] = true;
  }
}

class FakeAudio {
  muted = false;
  play() {}
  waka() {}
  setAmbient() {}
  suspend() {}
  resume() {}
  duration() {
    return 0;
  }
  toggleMute() {}
  unlock() {}
}

interface Probe {
  state: string;
  level: number;
  maze: { charAt(c: number, r: number): string; pelletsLeft: number };
  pac: { col: number; row: number; x: number; y: number };
  ghosts: { col: number; row: number; name: string; state: string }[];
  score: number;
}

function newGame(level: number) {
  (globalThis as unknown as { location: unknown }).location = { search: `?autostart&level=${level}` };
  (globalThis as unknown as { localStorage: unknown }).localStorage = { getItem: () => null, setItem: () => {} };
  const input = new FakeInput();
  const game = new Game(input as never, new FakeAudio() as never);
  return { game, input, probe: game as unknown as Probe };
}

const DIRS = [Dir.Up, Dir.Left, Dir.Down, Dir.Right];

describe('simulación sin interfaz', () => {
  // Un nivel por mundo, más los que llevan misión y mecánicas.
  const levels = [1, 2, 5, 8, 14, 21, 25, 28, 35, 45, 49, 58, 65, 75, 85, 92, 100];

  for (const level of levels) {
    it(`el nivel ${level} aguanta 6000 ticks de un bot aleatorio sin romper reglas`, () => {
      const { game, input, probe } = newGame(level);
      const rng = createRng(level);
      for (let t = 0; t < 6000; t++) {
        if (t % 12 === 0) input.direction = DIRS[rng.int(4)];
        if (t % 400 === 0) input.request('aina');
        if (t % 500 === 0) input.request('aleix');
        game.update();
        if (t % 5 === 0) {
          // Nadie atraviesa paredes.
          expect(probe.maze.charAt(probe.pac.col, probe.pac.row), `Pac-Man en pared (t=${t})`).not.toBe('#');
          for (const g of probe.ghosts) {
            if (g.state === 'house' || g.state === 'leaving' || g.state === 'entering') continue;
            expect(probe.maze.charAt(g.col, g.row), `${g.name} en pared (t=${t})`).not.toBe('#');
          }
        }
      }
      expect(probe.level).toBeGreaterThanOrEqual(level);
    });
  }

  it('un bot que busca el punto más cercano come puntos y suma puntuación', async () => {
    const { nearestTile, shortestPath } = await import('../src/game/level/placement');
    const { game, input, probe } = newGame(1);
    const lines = (game as unknown as { levelDef: { maze: string[] } }).levelDef.maze;
    let lastScore = 0;
    for (let t = 0; t < 4000; t++) {
      if (probe.state === 'play' && t % 4 === 0) {
        const from = { col: probe.pac.col, row: probe.pac.row };
        const target = nearestTile(lines, from, (x) => (probe.maze as unknown as { pelletAt(c: number, r: number): unknown }).pelletAt(x.col, x.row) !== undefined);
        const path = target && shortestPath(lines, from, target);
        if (path && path.length > 1) {
          const [a, b] = [path[0], path[1]];
          input.direction = b.col > a.col ? Dir.Right : b.col < a.col ? Dir.Left : b.row > a.row ? Dir.Down : Dir.Up;
        }
      }
      game.update();
      lastScore = probe.score;
    }
    expect(lastScore).toBeGreaterThan(300);
  });
});
