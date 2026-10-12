import { describe, expect, it, vi } from 'vitest';
import { LEVEL_SPECIALS } from '../src/data/levelSpecials';
import { Dir } from '../src/game/constants';
import { createRng } from '../src/game/random';

// El dibujo de paredes necesita un canvas real; la simulación solo necesita la lógica.
vi.mock('../src/game/theme/background', () => ({
  renderBackground: () => ({}),
  drawParticles: () => {},
}));
vi.mock('../src/game/maze/render', () => ({
  renderWalls: () => ({}),
  WallRenderer: class {
    refresh() {}
    render() {
      return {};
    }
  },
}));

const { Game } = await import('../src/game/game');

class FakeInput {
  directionSeq = 0;
  private dir: Dir | null = null;
  get direction(): Dir | null {
    return this.dir;
  }
  set direction(d: Dir | null) {
    this.dir = d;
    if (d !== null) this.directionSeq++;
  }
  private flags = { press: false, pause: false, mute: false, aina: false, aleix: false, fire: false };
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
  consumeFire() {
    const v = this.flags.fire;
    this.flags.fire = false;
    return v;
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
  press() {
    this.flags.press = true;
  }
  request(kind: 'aina' | 'aleix' | 'fire') {
    this.flags[kind] = true;
  }
}

class FakeAudio {
  muted = false;
  play() {}
  waka() {}
  sfx() {}
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

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}

function newGame(level: number, storage: unknown = { getItem: () => null, setItem: () => {}, removeItem: () => {} }, autostart = true) {
  (globalThis as unknown as { location: unknown }).location = { search: autostart ? `?autostart&level=${level}` : '' };
  (globalThis as unknown as { localStorage: unknown }).localStorage = storage;
  const input = new FakeInput();
  const game = new Game(input as never, new FakeAudio() as never);
  return { game, input, probe: game as unknown as Probe };
}

const DIRS = [Dir.Up, Dir.Left, Dir.Down, Dir.Right];

describe('simulación sin interfaz', () => {
  // El nivel 1, un nivel liso y todos los que llevan misión o mecánicas especiales.
  const levels = [1, 2, ...Object.keys(LEVEL_SPECIALS).map(Number)];

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

describe('checkpoints en el juego', () => {
  type Internals = Probe & { completeLevel(): void; nextLevel(): void; checkpoint: unknown; titleChoice: number; lives: number; difficulty: string; levelDef: { level: number } };

  it('completar un nivel par guarda el siguiente; uno impar no', () => {
    const storage = memoryStorage();
    const odd = newGame(1, storage);
    (odd.game as unknown as Internals).completeLevel();
    expect(storage.getItem('pacman.checkpoint')).toBeNull();

    const even = newGame(2, storage);
    const g = even.game as unknown as Internals;
    g.score = 4560;
    g.completeLevel();
    expect(JSON.parse(storage.getItem('pacman.checkpoint')!)).toMatchObject({ level: 3, score: 4560 });
  });

  it('el título ofrece continuar y reanuda con puntuación y nivel guardados', () => {
    const storage = memoryStorage();
    storage.setItem('pacman.checkpoint', JSON.stringify({ level: 7, score: 9000, lives: 0, difficulty: 'normal' }));
    const { game, input, probe } = newGame(1, storage, false);
    const g = game as unknown as Internals;
    expect(g.titleChoice).toBe(1); // preseleccionado
    input.direction = Dir.Up; // cambia a «nueva partida» y vuelve
    game.update();
    expect(g.titleChoice).toBe(0);
    input.direction = Dir.Down;
    game.update();
    expect(g.titleChoice).toBe(1);
    input.press();
    game.update();
    expect(probe.level).toBe(7);
    expect(probe.score).toBe(9000);
    expect(g.lives).toBeGreaterThanOrEqual(2); // nunca se reanuda sin margen
    expect(g.difficulty).toBe('normal');
  });

  it('«nueva partida» ignora el checkpoint y empieza en el nivel 1', () => {
    const storage = memoryStorage();
    storage.setItem('pacman.checkpoint', JSON.stringify({ level: 7, score: 9000, lives: 2, difficulty: 'easy' }));
    const { game, input, probe } = newGame(1, storage, false);
    input.direction = Dir.Up;
    game.update();
    input.press();
    game.update();
    expect(probe.level).toBe(1);
    expect(probe.score).toBe(0);
    expect(storage.getItem('pacman.checkpoint')).not.toBeNull(); // sigue guardado hasta el siguiente
  });

  it('terminar el nivel 100 borra el checkpoint', () => {
    const storage = memoryStorage();
    storage.setItem('pacman.checkpoint', JSON.stringify({ level: 99, score: 1, lives: 2, difficulty: 'easy' }));
    const { game } = newGame(100, storage);
    const g = game as unknown as Internals;
    g.nextLevel();
    expect(storage.getItem('pacman.checkpoint')).toBeNull();
  });
});
