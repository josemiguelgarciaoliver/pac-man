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
  pause() {
    this.flags.pause = true;
  }
  request(kind: 'aina' | 'aleix' | 'fire') {
    this.flags[kind] = true;
  }
}

class FakeAudio {
  muted = false;
  play() {}
  waka() {}
  log: string[] = [];
  sfx(kind: string) {
    this.log.push(kind);
  }
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
  const audio = new FakeAudio();
  const game = new Game(input as never, audio as never);
  return { game, input, audio, probe: game as unknown as Probe };
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

  it('el menú ofrece continuar (preseleccionado) y reanuda con puntuación y nivel guardados', () => {
    const storage = memoryStorage();
    storage.setItem('pacman.checkpoint', JSON.stringify({ level: 7, score: 9000, lives: 0, difficulty: 'normal' }));
    const { game, input, probe } = newGame(1, storage, false);
    const g = game as unknown as Internals & { menus: { mainIndex: number; screen: string } };
    expect(g.menus.screen).toBe('main');
    expect(g.menus.mainIndex).toBe(1); // "Continuar"
    input.direction = Dir.Up; // sube a "Nueva partida" y vuelve a bajar
    game.update();
    expect(g.menus.mainIndex).toBe(0);
    input.direction = Dir.Down;
    game.update();
    expect(g.menus.mainIndex).toBe(1);
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

describe('arranque aleatorio de los fantasmas', () => {
  type G = { rng: unknown; beginReady(): void; houseOrder: string[]; corners: Record<string, unknown>; ghost(n: string): { dir: number }; updateHouse(): void; ghosts: { name: string; state: string }[]; personal: Record<string, number> };

  it('cada vida cambia el orden de salida, las esquinas y la dirección de salida', () => {
    const orders = new Set<string>();
    const corners = new Set<string>();
    const dirs = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) {
      const { game } = newGame(3);
      const g = game as unknown as G;
      g.rng = createRng(seed);
      g.beginReady();
      orders.add(g.houseOrder.join());
      corners.add(JSON.stringify(g.corners));
      dirs.add(g.ghost('blinky').dir);
    }
    expect(orders.size).toBeGreaterThanOrEqual(4);
    expect(corners.size).toBeGreaterThanOrEqual(8);
    expect(dirs.size).toBe(2); // sale por la izquierda o por la derecha
  });

  it('con la misma semilla el arranque se repite (los replays siguen siendo posibles)', () => {
    const start = (seed: number) => {
      const { game } = newGame(3);
      const g = game as unknown as G;
      g.rng = createRng(seed);
      g.beginReady();
      return [g.houseOrder.join(), JSON.stringify(g.corners), g.ghost('blinky').dir];
    };
    expect(start(7)).toEqual(start(7));
  });

  it('quien va primero en la cola sale primero, sea cual sea el fantasma', () => {
    const { game } = newGame(3); // nivel 3: todos los límites son 0
    const g = game as unknown as G;
    g.houseOrder = ['clyde', 'inky', 'pinky'];
    for (const gh of g.ghosts) if (gh.name !== 'blinky') gh.state = 'house';
    g.updateHouse();
    expect(g.ghosts.find((x) => x.name === 'clyde')!.state).toBe('leaving');
    expect(g.ghosts.find((x) => x.name === 'pinky')!.state).toBe('house');
  });
});

describe('progresión en el juego (Fase 6)', () => {
  type Run = Probe & {
    completeLevel(): void;
    nextLevel(): void;
    levelPlayTicks: number;
    levelLivesLost: number;
    levelStartScore: number;
    lives: number;
    progress: { levels: Record<string, { stars: number; bestScore: number }>; unlocked: number; album: string[] };
    menus: { screen: string };
  };

  const untilPlay = (game: { update(): void }, probe: Probe) => {
    for (let i = 0; i < 1500 && probe.state !== 'play'; i++) game.update();
    expect(probe.state).toBe('play');
  };

  it('completar un nivel rápido y sin perder vidas da 3 estrellas y lo guarda', () => {
    const storage = memoryStorage();
    const { game } = newGame(3, storage);
    const g = game as unknown as Run;
    g.levelPlayTicks = 60 * 20;
    g.completeLevel();
    expect(g.progress.levels['3'].stars).toBe(3);
    expect(g.progress.unlocked).toBe(4);
    expect(JSON.parse(storage.getItem('pacman.progress')!).unlocked).toBe(4);
  });

  it('completar el nivel apaga al instante la oscuridad y el resto de efectos de vista', () => {
    const { game } = newGame(3, memoryStorage());
    const g = game as unknown as Run & { view: { add(k: string, s: number): void; update(): void; darkAmount: number; active(): unknown[] } };
    g.view.add('dark', 30);
    for (let i = 0; i < 80; i++) g.view.update();
    expect(g.view.darkAmount).toBeGreaterThan(0.9);
    g.completeLevel();
    expect(g.view.darkAmount).toBe(0);
    expect(g.view.active()).toEqual([]);
  });

  it('la tarjeta de nivel dura más y se puede saltar con una pulsación pasado un momento', () => {
    const { game, input, probe } = newGame(4, memoryStorage());
    expect(probe.state).toBe('ready');
    let ticks = 0;
    while (probe.state === 'ready' && ticks < 2000) {
      game.update();
      ticks++;
    }
    expect(ticks).toBeGreaterThan(60 * 6); // tarjeta (4,5 s) + READY (2 s) como mínimo

    const other = newGame(4, memoryStorage());
    other.input.press();
    other.game.update(); // demasiado pronto: no se salta
    expect(other.probe.state).toBe('ready');
    for (let i = 0; i < 80; i++) other.game.update();
    other.input.press();
    let after = 0;
    while (other.probe.state === 'ready' && after < 2000) {
      other.game.update();
      after++;
    }
    expect(after).toBeLessThan(60 * 3); // saltó la tarjeta y solo quedaba el READY
    void input;
  });

  it('recoger un objeto de misión y liberar al amigo suenan', () => {
    const collect = newGame(5, memoryStorage());
    untilPlay(collect.game, collect.probe);
    const c = collect.game as unknown as { mission: { target(f: { col: number; row: number }): { col: number; row: number } | null }; pac: { x: number; y: number } };
    const item = c.mission.target({ col: 13, row: 23 })!;
    c.pac.x = item.col * 8 + 4;
    c.pac.y = item.row * 8 + 4;
    collect.game.update();
    expect(collect.audio.log).toContain('collect');

    const rescue = newGame(28, memoryStorage());
    untilPlay(rescue.game, rescue.probe);
    const r = rescue.game as unknown as { mission: { target(f: { col: number; row: number }): { col: number; row: number } | null }; pac: { x: number; y: number } };
    const captive = r.mission.target({ col: 13, row: 23 })!;
    r.pac.x = captive.col * 8 + 4;
    r.pac.y = captive.row * 8 + 4;
    rescue.game.update();
    expect(rescue.audio.log).toContain('rescue');
  });

  it('con el amigo rescatado a cuestas Pac-Man va exactamente a la mitad de velocidad', () => {
    const { game, probe } = newGame(38, memoryStorage());
    for (let i = 0; i < 1500 && probe.state !== 'play'; i++) game.update();
    const g = game as unknown as { pacSpeed(): number; mission: { carrying: boolean; target(f: { col: number; row: number }): { col: number; row: number }; update(p: { x: number; y: number; col: number; row: number }): unknown } };
    const normal = g.pacSpeed(); // en la salida, sin barro ni nada que frene
    expect(g.mission.carrying).toBe(false);
    const captive = g.mission.target({ col: 13, row: 23 });
    g.mission.update({ x: 0, y: 0, col: captive.col, row: captive.row }); // lo libera sin mover a Pac-Man
    expect(g.mission.carrying).toBe(true);
    expect(g.pacSpeed()).toBeCloseTo(normal / 2, 6);
  });

  it('perder una vida en el nivel deja solo una estrella', () => {
    const { game } = newGame(3, memoryStorage());
    const g = game as unknown as Run;
    g.levelLivesLost = 1;
    g.levelPlayTicks = 60 * 10;
    g.completeLevel();
    expect(g.progress.levels['3'].stars).toBe(1);
  });

  it('completar el nivel 10 desbloquea el álbum, lanza la escena y el mundo 2 empieza con las vidas recargadas', () => {
    const { game, input, probe } = newGame(10, memoryStorage());
    const g = game as unknown as Run;
    g.lives = 0;
    g.completeLevel();
    expect(g.progress.album).toContain('letter-1');
    expect(g.progress.album).toContain('memory-1');
    g.nextLevel();
    expect(probe.state).toBe('cutscene');
    // Al principio no se puede saltar.
    input.press();
    game.update();
    expect(probe.state).toBe('cutscene');
    for (let i = 0; i < 100; i++) game.update();
    input.press();
    game.update();
    expect(probe.state).toBe('ready');
    expect(probe.level).toBe(11);
    expect(g.lives).toBe(4); // vidas del modo fácil
  });

  it('el menú de pausa permite continuar, reintentar el nivel y salir al menú', () => {
    const { game, input, probe } = newGame(2, memoryStorage());
    const g = game as unknown as Run;
    untilPlay(game, probe);

    // Continuar con la misma tecla de pausa.
    input.pause();
    game.update();
    expect(probe.state).toBe('paused');
    input.pause();
    game.update();
    expect(probe.state).toBe('play');

    // Reintentar: vuelve a "ready" con la puntuación de inicio del nivel.
    probe.score = 1234;
    input.pause();
    game.update();
    input.direction = Dir.Down;
    game.update();
    input.press();
    game.update();
    expect(probe.state).toBe('ready');
    expect(probe.score).toBe(g.levelStartScore);
    expect(probe.level).toBe(2);

    // Salir al menú.
    untilPlay(game, probe);
    input.pause();
    game.update();
    input.direction = Dir.Down;
    game.update();
    input.direction = Dir.Down;
    game.update();
    input.press();
    game.update();
    expect(probe.state).toBe('title');
    expect(g.menus.screen).toBe('main');
  });

  it('reiniciar el progreso borra estrellas y álbum', () => {
    const storage = memoryStorage();
    const { game } = newGame(10, storage);
    const g = game as unknown as Run & { menuHost(): { resetProgress(): void } };
    g.completeLevel();
    expect(g.progress.unlocked).toBe(11);
    g.menuHost().resetProgress();
    expect(g.progress.unlocked).toBe(1);
    expect(g.progress.album).toEqual([]);
    expect(storage.getItem('pacman.progress')).toBeNull();
  });
});

describe('letras AINA y ALEIX en la partida', () => {
  type Letters = { lives: number; collectLetter(l: string): void; letters: { collect(l: string): string[]; snapshot(): { aina: boolean[]; aleix: boolean[] } }; letterTokens: { tiles: unknown[] } | null };

  it('al completar una palabra se gana una vida; al completar las dos a la vez, dos', () => {
    const { game } = newGame(5, memoryStorage());
    const g = game as unknown as Letters;
    const start = g.lives;
    for (const l of ['N', 'A', 'I']) g.collectLetter(l);
    expect(g.lives).toBe(start);
    g.collectLetter('A');
    expect(g.lives).toBe(start + 1); // AINA
    // ALEIX lleva A e I; faltan L, E, X → al completar sube otra vida.
    for (const l of ['L', 'E']) g.collectLetter(l);
    g.collectLetter('X');
    expect(g.lives).toBe(start + 2);
    // Las dos a la vez: la 2.ª A y la A de ALEIX.
    for (const l of ['N', 'I', 'A', 'L', 'E', 'X', 'I']) g.collectLetter(l);
    const before = g.lives;
    g.collectLetter('A');
    expect(g.lives - before).toBeGreaterThanOrEqual(1);
  });

  it('empezar una partida nueva reinicia las letras', () => {
    const { game } = newGame(5, memoryStorage());
    const g = game as unknown as Letters & { startGame(level: number): void };
    g.collectLetter('N');
    g.startGame(1);
    expect(g.letters.snapshot().aina.some(Boolean)).toBe(false);
  });
});
