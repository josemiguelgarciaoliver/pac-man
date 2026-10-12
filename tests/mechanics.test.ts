import { describe, expect, it } from 'vitest';
import { ORIGINAL_PAC_SPAWN } from '../src/data/mazes/original';
import { Ghost } from '../src/game/actors/ghost';
import { PacMan } from '../src/game/actors/pacman';
import { Dir } from '../src/game/constants';
import { buildLevel } from '../src/game/level/levels';
import { Maze } from '../src/game/maze/maze';
import { createMechanics } from '../src/game/mechanics';
import { BombMechanic } from '../src/game/mechanics/bomb';
import { CompanionMechanic } from '../src/game/mechanics/companion';
import { BoostMechanic } from '../src/game/mechanics/boost';
import { GateMechanic } from '../src/game/mechanics/gate';
import type { MechanicEnv } from '../src/game/mechanics/mechanic';
import { MushroomMechanic } from '../src/game/mechanics/mushroom';
import { PhenomenonMechanic } from '../src/game/mechanics/phenomenon';
import { PuddleMechanic } from '../src/game/mechanics/puddle';
import { RageMechanic } from '../src/game/mechanics/rage';
import { SawbladeMechanic } from '../src/game/mechanics/sawblade';
import { SpikesMechanic } from '../src/game/mechanics/spikes';
import { TeleportMechanic } from '../src/game/mechanics/teleport';
import { TurretMechanic } from '../src/game/mechanics/turret';
import { createRng } from '../src/game/random';
import { ViewEffects } from '../src/game/viewEffects';

const TILE = 8;
const cx = (c: number) => c * TILE + TILE / 2;

function setup(level: number) {
  const def = buildLevel(level);
  const maze = new Maze(def.maze, ORIGINAL_PAC_SPAWN);
  const pac = new PacMan(ORIGINAL_PAC_SPAWN.x, ORIGINAL_PAC_SPAWN.y);
  const ghosts = ['blinky', 'pinky', 'inky', 'clyde'].map((n) => new Ghost(n as 'blinky'));
  const killed: Ghost[] = [];
  const popups: string[] = [];
  const view = new ViewEffects();
  const env: MechanicEnv = {
    maze,
    pac,
    ghosts,
    view,
    rng: createRng(1),
    killGhost: (g) => {
      killed.push(g);
      g.state = 'eaten';
    },
    sfx: () => {},
    popup: (t) => popups.push(t),
  };
  const mechanics = createMechanics(def.mechanics, def.maze, createRng(def.level * 104729 + 1));
  const place = (col: number, row: number) => {
    pac.x = cx(col);
    pac.y = cx(row);
  };
  const run = (ticks: number, until?: () => boolean) => {
    for (let i = 0; i < ticks; i++) {
      for (const m of mechanics) m.update(env);
      if (until?.()) return i;
    }
    return -1;
  };
  const hits = () => mechanics.some((m) => m.hitsPac?.(pac));
  return { def, maze, pac, ghosts, killed, popups, view, env, mechanics, place, run, hits };
}

describe('laberinto mutable', () => {
  it('derribar una pared la abre y reiniciar la devuelve', () => {
    const def = buildLevel(7);
    const maze = new Maze(def.maze, ORIGINAL_PAC_SPAWN);
    const wall = [...Array(31).keys()].flatMap((r) => [...Array(28).keys()].map((c) => ({ c, r }))).find((t) => maze.isDestroyable(t.c, t.r))!;
    const v0 = maze.version;
    expect(maze.destroyWall(wall.c, wall.r)).toBe(true);
    expect(maze.isWalkable(wall.c, wall.r)).toBe(true);
    expect(maze.version).toBeGreaterThan(v0);
    expect(maze.consumeChanged()).toEqual([{ col: wall.c, row: wall.r }]);
    maze.resetDynamic();
    expect(maze.isWalkable(wall.c, wall.r)).toBe(false);
  });

  it('el borde y la casa de fantasmas no se pueden derribar', () => {
    const maze = new Maze(buildLevel(1).maze, ORIGINAL_PAC_SPAWN);
    expect(maze.isDestroyable(0, 5)).toBe(false);
    expect(maze.isDestroyable(5, 0)).toBe(false);
    expect(maze.isDestroyable(8, 12)).toBe(false); // banda central
  });

  it('una casilla cerrada no es transitable y se vuelve a abrir', () => {
    const maze = new Maze(buildLevel(1).maze, ORIGINAL_PAC_SPAWN);
    expect(maze.isWalkable(1, 1)).toBe(true);
    maze.setBlocked(1, 1, true);
    expect(maze.isWalkable(1, 1)).toBe(false);
    maze.setBlocked(1, 1, false);
    expect(maze.isWalkable(1, 1)).toBe(true);
  });
});

describe('bombas', () => {
  it('no estallan si Pac-Man está lejos', () => {
    const s = setup(7);
    const v0 = s.maze.version;
    s.run(600);
    expect(s.maze.version).toBe(v0);
  });

  it('arden al acercarse, derriban paredes, matan a Pac-Man y convierten a los fantasmas en ojos', () => {
    const s = setup(7);
    const bomb = s.mechanics[0] as BombMechanic;
    const site = bomb.sites[0];
    s.place(site.col, site.row);
    s.ghosts[1].state = 'active';
    s.ghosts[1].x = cx(site.col);
    s.ghosts[1].y = cx(site.row);
    const v0 = s.maze.version;
    let hit = false;
    s.run(300, () => (hit ||= s.hits(), false));
    expect(s.maze.version).toBeGreaterThan(v0);
    // La pared de 2 casillas hacia el pasillo vecino queda abierta: ahora hay atajo.
    expect(s.maze.isWalkable(site.col + site.dc, site.row + site.dr)).toBe(true);
    expect(s.maze.isWalkable(site.col + 2 * site.dc, site.row + 2 * site.dr)).toBe(true);
    expect(hit).toBe(true);
    expect(s.killed).toContain(s.ghosts[1]);
  });

  it('si Pac-Man huye antes de que estalle, se salva', () => {
    const s = setup(7);
    const bomb = s.mechanics[0] as BombMechanic;
    const site = bomb.sites[0];
    s.place(site.col, site.row);
    s.run(30); // se arma
    s.place(ORIGINAL_PAC_SPAWN.col, ORIGINAL_PAC_SPAWN.row);
    s.pac.x = ORIGINAL_PAC_SPAWN.x;
    let hit = false;
    s.run(300, () => (hit ||= s.hits(), false));
    expect(hit).toBe(false);
  });
});

describe('torretas', () => {
  it('avisan antes y el proyectil mata a Pac-Man en su línea, no fuera de ella', () => {
    const s = setup(44);
    const turret = s.mechanics[0] as TurretMechanic;
    const lane = turret.lanes[0];
    // Pac-Man en mitad del pasillo de tiro.
    const mid = lane.length / 2;
    s.pac.x = lane.wall.x + lane.dc * mid;
    s.pac.y = lane.wall.y + lane.dr * mid;
    let hitTick = -1;
    for (let t = 0; t < 1500 && hitTick < 0; t++) {
      s.run(1);
      if (s.hits()) hitTick = t;
    }
    expect(hitTick).toBeGreaterThan(60); // no dispara nada más empezar
    // Fuera de la línea no hay peligro.
    s.place(ORIGINAL_PAC_SPAWN.col, ORIGINAL_PAC_SPAWN.row);
    s.pac.x = ORIGINAL_PAC_SPAWN.x;
    let danger = false;
    for (let t = 0; t < 1500; t++) {
      s.run(1);
      danger ||= s.hits() && Math.abs(s.pac.y - lane.wall.y) > 6 && Math.abs(s.pac.x - lane.wall.x) > 6;
    }
    expect(danger).toBe(false);
  });
});

describe('puertas móviles', () => {
  it('se cierran solas y vuelven a abrir', () => {
    const s = setup(13);
    const gate = (s.mechanics[0] as GateMechanic).tiles[0];
    let closed = false;
    let reopened = false;
    for (let t = 0; t < 2400; t++) {
      s.run(1);
      const blocked = s.maze.isBlocked(gate.col, gate.row);
      if (blocked) closed = true;
      else if (closed) reopened = true;
    }
    expect(closed).toBe(true);
    expect(reopened).toBe(true);
  });

  it('nunca cierran encima de Pac-Man', () => {
    const s = setup(13);
    const gate = (s.mechanics[0] as GateMechanic).tiles[0];
    s.place(gate.col, gate.row);
    for (let t = 0; t < 3000; t++) {
      s.run(1);
      expect(s.maze.isBlocked(gate.col, gate.row)).toBe(false);
    }
  });

  it('reabren al perder una vida', () => {
    const s = setup(13);
    const gate = (s.mechanics[0] as GateMechanic).tiles[0];
    s.run(2400, () => s.maze.isBlocked(gate.col, gate.row));
    expect(s.maze.isBlocked(gate.col, gate.row)).toBe(true);
    for (const m of s.mechanics) m.onRespawn?.(s.env);
    expect(s.maze.isBlocked(gate.col, gate.row)).toBe(false);
  });
});

describe('portales', () => {
  it('llevan a Pac-Man al portal gemelo y no rebotan', () => {
    const s = setup(12);
    const tp = s.mechanics[0] as TeleportMechanic;
    const a = tp.portals[0];
    const b = tp.partner(a)!;
    s.place(a.col, a.row);
    s.run(1);
    expect(s.pac.col).toBe(b.col);
    expect(s.pac.row).toBe(b.row);
    s.run(10);
    expect(s.pac.col).toBe(b.col); // sigue en el destino: hay enfriamiento
  });
});

describe('pinchos y sierras', () => {
  it('los pinchos solo matan cuando están fuera', () => {
    const s = setup(10);
    const trap = (s.mechanics[0] as SpikesMechanic).tiles[0];
    s.place(trap.col, trap.row);
    let safeTicks = 0;
    let deadly = 0;
    for (let t = 0; t < 600; t++) {
      s.run(1);
      if (s.hits()) deadly++;
      else safeTicks++;
    }
    expect(deadly).toBeGreaterThan(20);
    expect(safeTicks).toBeGreaterThan(deadly); // la mayor parte del ciclo es segura
  });

  it('las sierras matan al pasar por donde está Pac-Man', () => {
    const s = setup(26);
    const track = (s.mechanics[1] as SawbladeMechanic).tracks[0];
    s.place(Math.round((track.from.col + track.to.col) / 2), Math.round((track.from.row + track.to.row) / 2));
    let killed = false;
    s.run(1200, () => (killed ||= s.hits(), killed));
    expect(killed).toBe(true);
  });
});

describe('setas, fenómenos y barro', () => {
  it('comer una seta da un efecto con aviso; vuelve a crecer más tarde', () => {
    const s = setup(15);
    const tile = (s.mechanics[0] as MushroomMechanic).tiles[0];
    s.place(tile.col, tile.row);
    s.run(1);
    expect(s.view.active().length).toBe(1);
    expect(s.popups.length).toBe(1);
    s.view.clear();
    s.run(5);
    expect(s.view.active().length).toBe(0); // la seta ya no está
  });

  it('un fenómeno periódico activa su efecto', () => {
    const s = setup(18);
    expect(s.mechanics[0]).toBeInstanceOf(PhenomenonMechanic);
    s.run(60 * 25, () => s.view.has('dark'));
    expect(s.view.has('dark')).toBe(true);
  });

  it('el barro frena a Pac-Man y a los fantasmas solo dentro del charco', () => {
    const s = setup(6);
    const mud = s.mechanics[0] as PuddleMechanic;
    const tile = mud.tileList[0];
    s.place(tile.col, tile.row);
    expect(mud.pacSpeedFactor(s.pac)).toBeLessThan(1);
    s.place(ORIGINAL_PAC_SPAWN.col, ORIGINAL_PAC_SPAWN.row);
    expect(mud.pacSpeedFactor(s.pac)).toBe(1);
    const g = s.ghosts[0];
    g.state = 'active';
    g.x = cx(tile.col);
    g.y = cx(tile.row);
    expect(mud.ghostSpeedDelta(g)).toBeLessThan(0);
  });
});

describe('efectos de vista y de mando', () => {
  it('mando al revés, girado, espejo y laberinto girado traducen bien las pulsaciones', () => {
    const v = new ViewEffects();
    expect(v.mapInput(Dir.Up)).toBe(Dir.Up);
    v.add('invert', 5);
    expect(v.mapInput(Dir.Up)).toBe(Dir.Down);
    expect(v.mapInput(Dir.Left)).toBe(Dir.Right);
    v.clear();
    v.add('scramble', 5);
    expect(v.mapInput(Dir.Up)).toBe(Dir.Right); // 90° en sentido horario
    expect(v.mapInput(Dir.Right)).toBe(Dir.Down);
    v.clear();
    v.add('mirror', 5);
    expect(v.mapInput(Dir.Left)).toBe(Dir.Right);
    expect(v.mapInput(Dir.Up)).toBe(Dir.Up);
    v.clear();
    // Con el laberinto girado 90° a la derecha, lo que se ve "arriba" es la izquierda del laberinto.
    v.add('rotate', 5);
    expect(v.mapInput(Dir.Up)).toBe(Dir.Left);
    expect(v.mapInput(Dir.Right)).toBe(Dir.Up);
  });

  it('los efectos caducan y se animan hacia su objetivo', () => {
    const v = new ViewEffects();
    v.add('wobble', 1);
    v.add('dark', 1);
    for (let i = 0; i < 30; i++) v.update();
    expect(v.wobbleAmount).toBeGreaterThan(0.5);
    expect(v.darkAmount).toBeGreaterThan(0.4);
    for (let i = 0; i < 200; i++) v.update();
    expect(v.has('wobble')).toBe(false);
    expect(v.wobbleAmount).toBe(0);
  });

  it('el giro del laberinto reduce la escala para que siga cabiendo', () => {
    const v = new ViewEffects();
    v.add('rotate', 10);
    for (let i = 0; i < 100; i++) v.update();
    const a = v.toScreen(112 + 100, 100, 112, 100, 224, 248);
    // Un punto a la derecha del centro acaba debajo/encima, dentro de la pantalla.
    expect(a.x).toBeCloseTo(112, 0);
    expect(Math.abs(a.y - 100)).toBeLessThan(124);
  });
});

describe('todos los niveles con peligros', () => {
  it('se construyen y colocan lo que piden', () => {
    for (let n = 1; n <= 100; n++) {
      const def = buildLevel(n);
      const mechs = createMechanics(def.mechanics, def.maze, createRng(def.level * 104729 + 1));
      expect(mechs).toHaveLength(def.mechanics.length);
      for (const m of mechs) {
        const count = (m as unknown as { count?: number }).count;
        if (count !== undefined) expect(count, `nivel ${n} ${m.kind}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('cada mundo estrena al menos una mecánica y el último nivel mezcla muchas', () => {
    for (let w = 1; w <= 10; w++) {
      const kinds = new Set<string>();
      for (let s = 1; s <= 10; s++) buildLevel((w - 1) * 10 + s).mechanics.forEach((m) => kinds.add(m.type));
      expect(kinds.size, `mundo ${w}`).toBeGreaterThanOrEqual(1);
    }
    expect(new Set(buildLevel(100).mechanics.map((m) => m.type)).size).toBeGreaterThanOrEqual(5);
  });
});

describe('supervelocidad', () => {
  it('coger las zapatillas da supervelocidad durante un minuto, con aviso, y tardan en reaparecer', () => {
    const s = setup(4);
    const boost = s.mechanics.find((m) => m instanceof BoostMechanic) as BoostMechanic;
    expect(boost).toBeDefined();
    const tile = boost.tiles[0];
    expect(s.view.speedFactor).toBe(1);
    s.place(tile.col, tile.row);
    s.run(1);
    expect(s.view.has('boost')).toBe(true);
    expect(s.view.speedFactor).toBeGreaterThan(1.4);
    expect(s.view.secondsLeft('boost')).toBe(60);
    expect(s.popups).toContain('SUPERVELOCIDAD');
    // Ya no está: pasar otra vez no vuelve a dar nada.
    s.view.clear();
    s.run(5);
    expect(s.view.has('boost')).toBe(false);
  });

  it('caduca y supera al turbo de las setas', () => {
    const v = new ViewEffects();
    v.add('turbo', 5);
    const turbo = v.speedFactor;
    v.add('boost', 1);
    expect(v.speedFactor).toBeGreaterThan(turbo);
    for (let i = 0; i < 70; i++) v.update();
    expect(v.has('boost')).toBe(false);
    expect(v.speedFactor).toBe(turbo);
  });

  it('hay unas zapatillas cada cinco niveles y en el último, y no salen entre los efectos de las setas', () => {
    const levelsWithBolt = Array.from({ length: 100 }, (_, i) => i + 1).filter((n) => buildLevel(n).mechanics.some((m) => m.type === 'boost'));
    expect(levelsWithBolt.slice(0, 4)).toEqual([4, 9, 14, 19]);
    expect(levelsWithBolt).toContain(100);
    expect(levelsWithBolt).toHaveLength(21);
    const shroom = buildLevel(20).mechanics.find((m) => m.type === 'mushroom');
    expect(shroom && shroom.type === 'mushroom' ? shroom.effects : []).not.toContain('boost');
  });
});

describe('trampa de furia', () => {
  const activate = (ghostsActive = 4) => {
    const s = setup(16);
    const rage = s.mechanics.find((m) => m instanceof RageMechanic) as RageMechanic;
    s.ghosts.forEach((g, i) => (g.state = i < ghostsActive ? 'active' : 'house'));
    const tile = rage.tiles[0];
    return { s, rage, tile };
  };

  it('al pisarla enfurece a un solo fantasma, que corre más y avisa quién es', () => {
    const { s, rage, tile } = activate();
    s.place(tile.col, tile.row);
    s.run(1);
    expect(rage.angry).toHaveLength(1);
    const angry = rage.angry[0];
    const others = s.ghosts.filter((g) => g !== angry);
    expect(rage.ghostSpeedDelta(angry)).toBeGreaterThan(0.5);
    for (const o of others) expect(rage.ghostSpeedDelta(o)).toBe(0);
    expect(s.popups.some((p) => p.includes('FURIOSO'))).toBe(true);
  });

  it('la furia dura unos segundos, no se repite al instante y se calma con un energizer', () => {
    const { s, rage, tile } = activate();
    s.place(tile.col, tile.row);
    s.run(1);
    s.run(1); // sigue pisando la trampa: no enfurece a otro
    expect(rage.angry).toHaveLength(1);
    const angry = rage.angry[0];
    angry.frightened = true;
    expect(rage.ghostSpeedDelta(angry)).toBe(0);
    angry.frightened = false;
    s.place(ORIGINAL_PAC_SPAWN.col, ORIGINAL_PAC_SPAWN.row);
    s.run(60 * 7);
    expect(rage.angry).toHaveLength(0);
  });

  it('no se gasta si no hay ningún fantasma suelto, y un fantasma comido deja de estar furioso', () => {
    const none = activate(0);
    none.s.place(none.tile.col, none.tile.row);
    none.s.run(2);
    expect(none.rage.angry).toHaveLength(0);

    const { s, rage, tile } = activate();
    s.place(tile.col, tile.row);
    s.run(1);
    rage.angry[0].state = 'eaten';
    s.run(1);
    expect(rage.angry).toHaveLength(0);
  });
});

describe('miniaturas de Aleix y Aina', () => {
  const find = (level: number, who: 'aleix' | 'aina') => {
    const s = setup(level);
    const defs = buildLevel(level).mechanics;
    const idx = defs.findIndex((m) => m.type === 'companion' && m.who === who);
    return { s, c: s.mechanics[idx] as CompanionMechanic, idx };
  };

  it('Aleix aparece en los niveles que acaban en 6 y Aina en los que acaban en 1; los dos en los de jefe', () => {
    const who = (n: number) => buildLevel(n).mechanics.filter((m) => m.type === 'companion').map((m) => (m.type === 'companion' ? m.who : ''));
    expect(who(6)).toEqual(['aleix']);
    expect(who(16)).toEqual(['aleix']);
    expect(who(11)).toEqual(['aina']);
    expect(who(21)).toEqual(['aina']);
    expect(who(1)).toEqual([]);
    expect(who(10).sort()).toEqual(['aina', 'aleix']);
    expect(who(100).sort()).toEqual(['aina', 'aleix']);
  });

  it('al coger la insignia aparece la miniatura y avisa', () => {
    const { s, c } = find(6, 'aleix');
    expect(c.active).toBeNull();
    const tile = c.tiles[0];
    s.place(tile.col, tile.row);
    s.run(1);
    expect(c.active).not.toBeNull();
    expect(s.popups.some((p) => p.includes('ALEIX'))).toBe(true);
  });

  it('persigue a un fantasma y lo convierte en ojos al alcanzarlo', () => {
    const { s, c } = find(6, 'aleix');
    const tile = c.tiles[0];
    s.place(tile.col, tile.row);
    // Un fantasma suelto, lejos de Pac-Man.
    const ghost = s.ghosts[0];
    ghost.state = 'active';
    ghost.x = cx(26);
    ghost.y = cx(29);
    for (const g of s.ghosts.slice(1)) g.state = 'house';
    let caught = false;
    for (let t = 0; t < 1800 && !caught; t++) {
      // El fantasma se queda quieto: lo que se prueba es que la miniatura lo encuentra.
      s.run(1);
      caught = s.killed.includes(ghost);
    }
    expect(caught).toBe(true);
  });

  it('caduca a los segundos y se retira si Pac-Man pierde una vida', () => {
    const { s, c } = find(16, 'aleix');
    const tile = c.tiles[0];
    s.place(tile.col, tile.row);
    s.ghosts.forEach((g) => (g.state = 'house'));
    s.run(1);
    expect(c.active).not.toBeNull();
    s.run(60 * 11);
    expect(c.active).toBeNull();
    s.place(tile.col, tile.row);
    s.run(1); // la insignia aún no ha vuelto a crecer
    expect(c.active).toBeNull();
    const again = find(16, 'aleix');
    again.s.place(again.c.tiles[0].col, again.c.tiles[0].row);
    again.s.run(1);
    for (const m of again.s.mechanics) m.onRespawn?.(again.s.env);
    expect(again.c.active).toBeNull();
  });
});
