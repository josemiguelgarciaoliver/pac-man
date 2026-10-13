import { describe, expect, it, vi } from 'vitest';
import { Dir } from '../src/game/constants';
import { Menus, type MenuHost } from '../src/game/menus';
import { defaultSettings, emptyProgress, recordLevel } from '../src/game/progress';
import type { Difficulty } from '../src/game/rules';

function makeHost(over: Partial<MenuHost> = {}) {
  const host = {
    progress: emptyProgress(),
    settings: defaultSettings(),
    checkpoint: null,
    difficulty: 'easy' as Difficulty,
    muted: false,
    high: 0,
    frame: 0,
    startAt: vi.fn(),
    continueGame: vi.fn(),
    setDifficulty: vi.fn((d: Difficulty) => void (host.difficulty = d)),
    toggleMute: vi.fn(() => void (host.muted = !host.muted)),
    setParticles: vi.fn((on: boolean) => void (host.settings = { ...host.settings, particles: on })),
    resetProgress: vi.fn(),
    ...over,
  } as MenuHost & { startAt: ReturnType<typeof vi.fn>; continueGame: ReturnType<typeof vi.fn>; resetProgress: ReturnType<typeof vi.fn> };
  return host;
}

const press = (m: Menus, ...keys: ('up' | 'down' | 'left' | 'right' | 'ok' | 'back')[]) => {
  for (const k of keys) {
    m.update({
      dir: k === 'up' ? Dir.Up : k === 'down' ? Dir.Down : k === 'left' ? Dir.Left : k === 'right' ? Dir.Right : null,
      confirm: k === 'ok',
      back: k === 'back',
    });
  }
};

describe('menú principal', () => {
  it('sin checkpoint, confirmar empieza una partida nueva', () => {
    const host = makeHost();
    const m = new Menus(host);
    m.reset();
    press(m, 'ok');
    expect(host.startAt).toHaveBeenCalledWith(1);
  });

  it('con checkpoint, "Continuar" está preseleccionado y se puede cambiar a "Nueva partida"', () => {
    const host = makeHost({ checkpoint: { level: 7, score: 100, lives: 2, difficulty: 'easy' } });
    const m = new Menus(host);
    m.reset();
    press(m, 'ok');
    expect(host.continueGame).toHaveBeenCalledTimes(1);
    press(m, 'up', 'ok');
    expect(host.startAt).toHaveBeenCalledWith(1);
  });

  it('izquierda y derecha cambian la dificultad', () => {
    const host = makeHost();
    const m = new Menus(host);
    m.reset();
    press(m, 'right');
    expect(host.difficulty).toBe('normal');
    press(m, 'right', 'right');
    expect(host.difficulty).toBe('easy'); // da la vuelta
    press(m, 'left');
    expect(host.difficulty).toBe('arcade');
  });

  it('la selección da la vuelta arriba y abajo', () => {
    const host = makeHost();
    const m = new Menus(host);
    m.reset();
    const n = m.mainItems().length;
    for (let i = 0; i < n; i++) press(m, 'down');
    press(m, 'ok');
    expect(host.startAt).toHaveBeenCalledWith(1); // volvió a la primera opción
  });
});

describe('mapa de mundos y selector de niveles', () => {
  const toWorlds = (m: Menus) => press(m, 'down', 'ok'); // sin checkpoint: opción 1 = seleccionar nivel

  it('se llega del menú al mapa, al mundo y al nivel; atrás vuelve paso a paso', () => {
    const host = makeHost();
    const m = new Menus(host);
    m.reset();
    toWorlds(m);
    expect(m.screen).toBe('worlds');
    press(m, 'ok');
    expect(m.screen).toBe('levels');
    press(m, 'back');
    expect(m.screen).toBe('worlds');
    press(m, 'back');
    expect(m.screen).toBe('main');
  });

  it('solo se pueden jugar los niveles desbloqueados', () => {
    const host = makeHost();
    const m = new Menus(host);
    m.reset();
    toWorlds(m);
    press(m, 'ok'); // entra en el mundo 1: arranca en el último nivel desbloqueado (el 1)
    press(m, 'right', 'right', 'right', 'ok'); // nivel 4: bloqueado
    expect(host.startAt).not.toHaveBeenCalled();
    press(m, 'left', 'left', 'left', 'ok'); // nivel 1
    expect(host.startAt).toHaveBeenCalledWith(1);
  });

  it('con progreso, los niveles se desbloquean y el cursor empieza en el último disponible', () => {
    const host = makeHost();
    for (let l = 1; l <= 4; l++) recordLevel(host.progress, l, { score: 1, livesLost: 0, seconds: 10, par: 100 });
    const m = new Menus(host);
    m.reset();
    toWorlds(m);
    press(m, 'ok', 'ok');
    expect(m.selectedLevel).toBe(5);
    expect(host.startAt).toHaveBeenCalledWith(5);
  });

  it('un mundo bloqueado no se abre; los mundos se recorren en dos columnas de cinco', () => {
    const host = makeHost();
    const m = new Menus(host);
    m.reset();
    toWorlds(m);
    expect(m.selectedWorld).toBe(1);
    press(m, 'down');
    expect(m.selectedWorld).toBe(2);
    press(m, 'ok');
    expect(m.screen).toBe('worlds'); // el mundo 2 está bloqueado
    press(m, 'right');
    expect(m.selectedWorld).toBe(7);
    press(m, 'left', 'up');
    expect(m.selectedWorld).toBe(1);
    press(m, 'up');
    expect(m.selectedWorld).toBe(5); // da la vuelta por arriba
  });

  it('dentro de un mundo se mueve por 5 columnas y 2 filas', () => {
    const host = makeHost();
    host.progress.unlocked = 100;
    const m = new Menus(host);
    m.reset();
    toWorlds(m);
    press(m, 'right', 'down'); // columna derecha, segunda fila: mundo 7
    expect(m.selectedWorld).toBe(7);
    press(m, 'ok');
    expect(m.screen).toBe('levels');
    expect(m.selectedLevel).toBe(70); // empieza en el último nivel desbloqueado del mundo
    press(m, 'up');
    expect(m.selectedLevel).toBe(65); // sube de fila, misma columna
    press(m, 'right');
    expect(m.selectedLevel).toBe(61); // da la vuelta por la derecha
    press(m, 'ok');
    expect(host.startAt).toHaveBeenCalledWith(61);
  });
});

describe('ajustes y álbum', () => {
  const toSettings = (m: Menus) => press(m, 'down', 'down', 'down', 'ok'); // sin checkpoint: ajustes es la 4.ª opción

  it('cambian el sonido, las partículas y la dificultad', () => {
    const host = makeHost();
    const m = new Menus(host);
    m.reset();
    toSettings(m);
    expect(m.screen).toBe('settings');
    press(m, 'right');
    expect(host.difficulty).toBe('normal');
    press(m, 'down', 'ok');
    expect(host.muted).toBe(true);
    press(m, 'down', 'ok');
    expect(host.settings.particles).toBe(false);
  });

  it('borrar el progreso exige confirmar dos veces', () => {
    const host = makeHost();
    const m = new Menus(host);
    m.reset();
    toSettings(m);
    press(m, 'down', 'down', 'down', 'ok'); // "Borrar progreso": primera pulsación
    expect(host.resetProgress).not.toHaveBeenCalled();
    press(m, 'ok');
    expect(host.resetProgress).toHaveBeenCalledTimes(1);
  });

  it('moverse a otra opción cancela el borrado pendiente', () => {
    const host = makeHost();
    const m = new Menus(host);
    m.reset();
    toSettings(m);
    press(m, 'down', 'down', 'down', 'ok', 'up', 'down', 'ok');
    expect(host.resetProgress).not.toHaveBeenCalled();
  });

  it('el álbum se recorre y se sale con atrás', () => {
    const host = makeHost();
    const m = new Menus(host);
    m.reset();
    press(m, 'down', 'down', 'ok');
    expect(m.screen).toBe('album');
    press(m, 'down', 'down', 'right', 'up');
    expect(m.screen).toBe('album');
    press(m, 'back');
    expect(m.screen).toBe('main');
  });
});

describe('objetos y peligros', () => {
  it('se abre desde el menú principal y se cierra con atrás', () => {
    const m = new Menus(makeHost());
    m.reset();
    const n = m.mainItems().length;
    press(m, ...Array<'down'>(n - 1).fill('down'), 'ok');
    expect(m.screen).toBe('legend');
    press(m, 'back');
    expect(m.screen).toBe('main');
  });

  it('todos los elementos caben en la pantalla, con frases que no se salen', async () => {
    const { LEGEND_ITEMS, LEGEND_HAZARDS, LEGEND_ROWS, LEGEND_ROW_HEIGHT } = await import('../src/game/legend');
    const { CHAR_W } = await import('../src/engine/font');
    const { SCREEN_H, SCREEN_W } = await import('../src/game/constants');
    expect(LEGEND_ITEMS.length + LEGEND_HAZARDS.length).toBeGreaterThanOrEqual(24);
    expect(30 + LEGEND_ROWS * LEGEND_ROW_HEIGHT).toBeLessThanOrEqual(SCREEN_H - 20); // deja sitio a la pista de "atrás"
    for (const e of [...LEGEND_ITEMS, ...LEGEND_HAZARDS]) {
      expect(22 + e.text.length * CHAR_W, e.text).toBeLessThanOrEqual(SCREEN_W - 4);
      expect(e.text, e.text).toMatch(/^[A-Z0-9 :]+$/);
    }
  });
});
