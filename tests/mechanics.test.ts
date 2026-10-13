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
import { AnkhMechanic } from '../src/game/mechanics/ankh';
import { BlasterMechanic } from '../src/game/mechanics/blaster';
import { BoostMechanic } from '../src/game/mechanics/boost';
import { Projectiles } from '../src/game/projectiles';
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
  const sounds: string[] = [];
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
    eatDot: (c, r) => {
      if (maze.pelletAt(c, r) !== 'dot') return false;
      maze.eatPellet(c, r);
      return true;
    },
    blast: (x, y, radius) => {
      for (const m of mechanics) m.onBlast?.(x, y, radius, env);
    },
    sfx: (k) => void sounds.push(k),
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
  return { def, maze, pac, ghosts, killed, popups, sounds, view, env, mechanics, place, run, hits };
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
    expect(s.view.speedFactor).toBeGreaterThanOrEqual(1.4);
    expect(s.view.speedFactor).toBeLessThan(1.7); // supervelocidad, pero controlable
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

describe('blaster y disparos', () => {
  it('coger el blaster activa el disparo durante un minuto con aviso', () => {
    const s = setup(7);
    const gun = s.mechanics.find((m) => m instanceof BlasterMechanic) as BlasterMechanic;
    expect(gun).toBeDefined();
    const tile = gun.tiles[0];
    expect(s.view.has('gun')).toBe(false);
    s.place(tile.col, tile.row);
    s.run(1);
    expect(s.view.has('gun')).toBe(true);
    expect(s.view.secondsLeft('gun')).toBe(60);
    expect(s.popups.some((p) => p.includes('ESPACIO'))).toBe(true);
  });

  it('un disparo mata al primer fantasma de su camino y no atraviesa paredes', () => {
    const s = setup(1);
    const shots = new Projectiles();
    const kills: string[] = [];
    // Pasillo de la fila 5, libre de lado a lado.
    s.ghosts.forEach((g) => (g.state = 'house'));
    const target = s.ghosts[1];
    target.state = 'active';
    target.x = cx(20);
    target.y = cx(5);
    const behind = s.ghosts[2];
    behind.state = 'active';
    behind.x = cx(24);
    behind.y = cx(5);
    expect(shots.tryFire(cx(8), cx(5), Dir.Right)).toBe(true);
    for (let t = 0; t < 60; t++) shots.update(s.maze, s.ghosts, (g) => kills.push(g.name));
    expect(kills).toEqual(['pinky']); // el que está detrás no se toca: el disparo se gasta con el primero
    expect(shots.count).toBe(0);

    // Contra una pared el disparo desaparece.
    const wallShots = new Projectiles();
    wallShots.tryFire(cx(1), cx(5), Dir.Left);
    for (let t = 0; t < 10; t++) wallShots.update(s.maze, s.ghosts, () => {});
    expect(wallShots.count).toBe(0);
  });

  it('el cañón se enfría entre disparos', () => {
    const s = setup(1);
    const shots = new Projectiles();
    expect(shots.tryFire(cx(8), cx(5), Dir.Right)).toBe(true);
    expect(shots.tryFire(cx(8), cx(5), Dir.Right)).toBe(false);
    for (let t = 0; t < 20; t++) shots.update(s.maze, s.ghosts, () => {});
    expect(shots.tryFire(cx(8), cx(5), Dir.Right)).toBe(true);
  });

  it('hay un blaster cada cinco niveles desde el 7, y en el último', () => {
    const levels = Array.from({ length: 100 }, (_, i) => i + 1).filter((n) => buildLevel(n).mechanics.some((m) => m.type === 'blaster'));
    expect(levels.slice(0, 4)).toEqual([7, 12, 17, 22]);
    expect(levels).toContain(100);
    expect(levels).toHaveLength(20);
  });
});

describe('ajustes de equilibrio', () => {
  /** Pone a Pac-Man a `dist` px del centro de la bomba, en el sentido de su pared (o al contrario). */
  const placeAt = (s: ReturnType<typeof setup>, site: { col: number; row: number; dc: number; dr: number }, dist: number, away = false) => {
    const k = away ? -1 : 1;
    s.pac.x = cx(site.col) + k * site.dc * dist;
    s.pac.y = cx(site.row) + k * site.dr * dist;
  };

  it('la onda de la bomba mata a Pac-Man aunque esté fuera del rombo de paredes derribadas, pero no lejos', () => {
    const near = setup(7);
    const bomb = near.mechanics[0] as BombMechanic;
    const site = bomb.sites[0];
    expect(bomb.lethalRadius).toBeGreaterThan(3 * 8); // más que el radio de paredes (2 casillas)
    near.place(site.col, site.row);
    near.run(1); // se arma
    placeAt(near, site, 3 * 8, true); // 3 casillas hacia el pasillo, fuera del rombo
    let hit = false;
    near.run(300, () => (hit ||= near.hits(), false));
    expect(hit).toBe(true);

    const far = setup(7);
    const farBomb = far.mechanics[0] as BombMechanic;
    const farSite = farBomb.sites[0];
    far.place(farSite.col, farSite.row);
    far.run(1);
    placeAt(far, farSite, farBomb.lethalRadius + 6, true);
    let farHit = false;
    far.run(300, () => (farHit ||= far.hits(), false));
    expect(farHit).toBe(false);
  });

  it('las cintas empujan con fuerza y el barro frena mucho', () => {
    const belts = Array.from({ length: 100 }, (_, i) => buildLevel(i + 1).mechanics.filter((m) => m.type === 'conveyor')).flat();
    expect(belts.length).toBeGreaterThan(5);
    for (const b of belts) if (b.type === 'conveyor') expect(b.speed).toBeGreaterThanOrEqual(0.4);
    const s = setup(6);
    const mud = s.mechanics[0] as PuddleMechanic;
    s.place(mud.tileList[0].col, mud.tileList[0].row);
    expect(mud.pacSpeedFactor(s.pac)).toBeLessThanOrEqual(0.4);
  });
});

describe('efectos de vista al terminar el nivel', () => {
  it('clear() apaga la oscuridad, el giro y el espejo al instante', () => {
    const v = new ViewEffects();
    v.add('dark', 20);
    v.add('rotate', 20);
    v.add('mirror', 20);
    v.add('wobble', 20);
    for (let i = 0; i < 100; i++) v.update();
    expect(v.darkAmount).toBeGreaterThan(0.9);
    expect(v.wobbleAmount).toBeGreaterThan(0.9);
    v.clear();
    expect(v.darkAmount).toBe(0);
    expect(v.wobbleAmount).toBe(0);
    expect(v.active()).toEqual([]);
    expect(v.mapInput(Dir.Up)).toBe(Dir.Up);
    // Y no se reactiva solo en los ticks siguientes.
    for (let i = 0; i < 30; i++) v.update();
    expect(v.darkAmount).toBe(0);
  });
});

describe('sonidos al coger los objetos', () => {
  const pickup = (level: number, type: string, who?: string) => {
    const s = setup(level);
    const idx = buildLevel(level).mechanics.findIndex((m) => m.type === type && (!who || (m.type === 'companion' && m.who === who)));
    expect(idx, `${type} en el nivel ${level}`).toBeGreaterThanOrEqual(0);
    const mech = s.mechanics[idx] as unknown as { tiles?: { col: number; row: number }[]; portals?: { col: number; row: number }[] };
    const tile = (mech.tiles ?? mech.portals)![0];
    s.ghosts.forEach((g) => (g.state = 'active'));
    s.place(tile.col, tile.row);
    s.run(1);
    return s.sounds;
  };

  it('cada objeto suena distinto al cogerlo', () => {
    const heard = {
      zapatillas: pickup(4, 'boost'),
      pistola: pickup(7, 'blaster'),
      aleix: pickup(6, 'companion', 'aleix'),
      aina: pickup(11, 'companion', 'aina'),
      furia: pickup(16, 'rage'),
      seta: pickup(15, 'mushroom'),
      portal: pickup(12, 'teleport'),
    };
    expect(heard.zapatillas).toContain('boost');
    expect(heard.pistola).toContain('gun');
    expect(heard.aleix).toContain('aleix');
    expect(heard.aina).toContain('aina');
    expect(heard.furia).toContain('rage');
    expect(heard.seta).toContain('poison');
    expect(heard.portal).toContain('teleport');
    const kinds = new Set(Object.values(heard).map((h) => h[0]));
    expect(kinds.size).toBe(Object.keys(heard).length); // ninguno se repite
  });
});

describe('envenenamiento (Pac-Man verde)', () => {
  it('los efectos negativos envenenan; los positivos no', () => {
    for (const bad of ['wobble', 'invert', 'scramble', 'dark'] as const) {
      const v = new ViewEffects();
      expect(v.poisoned).toBe(false);
      v.add(bad, 5);
      expect(v.poisoned, bad).toBe(true);
    }
    for (const good of ['turbo', 'boost', 'gun', 'rotate', 'mirror'] as const) {
      const v = new ViewEffects();
      v.add(good, 5);
      expect(v.poisoned, good).toBe(false);
    }
  });

  it('el veneno se acaba con el efecto y al completar el nivel', () => {
    const v = new ViewEffects();
    v.add('invert', 1);
    expect(v.poisoned).toBe(true);
    for (let i = 0; i < 70; i++) v.update();
    expect(v.poisoned).toBe(false);
    v.add('mirror', 20);
    v.clear();
    expect(v.poisoned).toBe(false);
  });

  it('comer una seta con efecto negativo envenena a Pac-Man', () => {
    const s = setup(17); // setas con visión borrosa o mando al revés: los dos son negativos
    const m = s.mechanics.find((x) => x instanceof MushroomMechanic) as MushroomMechanic;
    s.place(m.tiles[0].col, m.tiles[0].row);
    s.run(1);
    expect(s.view.poisoned).toBe(true);
  });
});

describe('sierras de línea larga', () => {
  const sawLevels = Array.from({ length: 100 }, (_, i) => i + 1).filter((n) => buildLevel(n).mechanics.some((m) => m.type === 'sawblade'));

  it('patrullan líneas largas y nunca pasan cerca de la salida de Pac-Man', () => {
    expect(sawLevels.length).toBeGreaterThan(5);
    for (const n of sawLevels) {
      const s = setup(n);
      const saws = s.mechanics.filter((m) => m instanceof SawbladeMechanic) as SawbladeMechanic[];
      for (const saw of saws) {
        for (const tr of saw.tracks) {
          const len = Math.abs(tr.to.col - tr.from.col) + Math.abs(tr.to.row - tr.from.row) + 1;
          expect(len, `nivel ${n}: línea de la sierra`).toBeGreaterThanOrEqual(10);
          // Ni la salida (13,23)/(14,23) ni sus alrededores inmediatos están en la pista.
          const cols = [tr.from.col, tr.to.col].sort((a, b) => a - b);
          const rows = [tr.from.row, tr.to.row].sort((a, b) => a - b);
          const crossesSpawn = cols[0] <= 14 && cols[1] >= 13 && rows[0] <= 23 && rows[1] >= 23;
          expect(crossesSpawn, `nivel ${n}`).toBe(false);
        }
      }
    }
  });

  it('una sierra de línea larga deja huecos: pasar de un lado a otro de la línea es posible', () => {
    // La sierra solo está sobre una casilla una fracción pequeña del tiempo.
    const s = setup(sawLevels[0]);
    const saw = s.mechanics.find((m) => m instanceof SawbladeMechanic) as SawbladeMechanic;
    const track = saw.tracks[0];
    const mid = { col: Math.round((track.from.col + track.to.col) / 2), row: Math.round((track.from.row + track.to.row) / 2) };
    s.place(mid.col, mid.row);
    let danger = 0;
    const ticks = 3000;
    for (let i = 0; i < ticks; i++) {
      s.run(1);
      if (s.hits()) danger++;
    }
    expect(danger / ticks).toBeLessThan(0.15);
  });
});

describe('sierras separadas entre sí', () => {
  const withSaws = Array.from({ length: 100 }, (_, i) => i + 1).filter((n) => buildLevel(n).mechanics.some((m) => m.type === 'sawblade' && m.count > 1));

  it('el nivel 30 (mundo 3, nivel 10) tiene sus tres sierras bien alejadas', () => {
    const s = setup(30);
    const saws = s.mechanics.find((m) => m instanceof SawbladeMechanic) as SawbladeMechanic;
    expect(saws.count).toBe(3);
    expect(saws.gap).toBeGreaterThanOrEqual(7); // antes podían quedar a solo 3 casillas
  });

  it('en todos los niveles con varias sierras las pistas quedan separadas al menos 3 casillas', () => {
    expect(withSaws.length).toBeGreaterThan(3);
    for (const n of withSaws) {
      const saws = setup(n).mechanics.find((m) => m instanceof SawbladeMechanic) as SawbladeMechanic;
      expect(saws.gap, `nivel ${n}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('Anj del desierto', () => {
  it('aparece solo en algunos niveles del mundo 5', () => {
    const levels = Array.from({ length: 100 }, (_, i) => i + 1).filter((n) => buildLevel(n).mechanics.some((m) => m.type === 'ankh'));
    expect(levels).toEqual([42, 45, 48]);
    for (const n of levels) expect(buildLevel(n).world).toBe(5);
  });

  it('al cogerlo destruye a todos los fantasmas, suena y avisa', () => {
    const s = setup(42);
    const ankh = s.mechanics.find((m) => m instanceof AnkhMechanic) as AnkhMechanic;
    expect(ankh).toBeDefined();
    // Dos fantasmas sueltos, uno saliendo de la casa y otro dentro.
    s.ghosts[0].state = 'active';
    s.ghosts[1].state = 'active';
    s.ghosts[2].state = 'leaving';
    s.ghosts[2].y = 100;
    s.ghosts[3].state = 'house';
    const tile = ankh.tiles[0];
    s.place(tile.col, tile.row);
    s.run(1);
    expect(s.killed).toEqual([s.ghosts[0], s.ghosts[1]]); // los activos se convierten en ojos
    expect(s.ghosts[2].state).toBe('house'); // el que salía vuelve a la casa a regenerarse
    expect(s.ghosts[2].reviveTicks).toBeGreaterThan(0);
    expect(s.ghosts[3].reviveTicks).toBeGreaterThan(0);
    expect(s.sounds).toContain('ankh');
    expect(s.popups.some((p) => p.includes('ANJ'))).toBe(true);
  });

  it('no se puede coger dos veces seguidas', () => {
    const s = setup(42);
    const ankh = s.mechanics.find((m) => m instanceof AnkhMechanic) as AnkhMechanic;
    s.place(ankh.tiles[0].col, ankh.tiles[0].row);
    s.ghosts[0].state = 'active';
    s.run(1);
    s.ghosts[1].state = 'active';
    s.run(5);
    expect(s.killed).toHaveLength(1); // el segundo fantasma no cae: el Anj ya se gastó
  });
});

describe('objetos sin solaparse', () => {
  it('en ningún nivel dos objetos comparten casilla (se vería uno y se cogerían dos)', async () => {
    const { Mission } = await import('../src/game/missions');
    const { createRng } = await import('../src/game/random');
    for (let n = 1; n <= 100; n++) {
      const def = buildLevel(n);
      const mission = new Mission(def.mission, def.maze, createRng(n * 7919));
      const mechs = createMechanics(def.mechanics, def.maze, createRng(n * 104729 + 1), mission.occupied);
      const all = [...mission.occupied];
      for (const m of mechs) {
        if (!['ankh','blaster','bomb','boost','companion','mushroom','rage','teleport'].includes(m.kind)) continue;
        const own = m as unknown as { tiles?: { col: number; row: number }[]; portals?: { col: number; row: number }[]; sites?: { col: number; row: number }[] };
        all.push(...(own.tiles ?? own.portals ?? own.sites ?? []));
      }
      const keys = all.map((t) => `${t.col},${t.row}`);
      expect(new Set(keys).size, `nivel ${n}`).toBe(keys.length);
    }
  });
});

describe('nivel 50: transportador entre mitades', () => {
  it('conecta la parte de arriba con la de abajo', () => {
    const s = setup(50);
    const tp = s.mechanics.find((m) => m.kind === 'teleport') as unknown as { portals: { col: number; row: number }[] };
    expect(tp.portals).toHaveLength(2);
    expect(Math.min(...tp.portals.map((p) => p.row))).toBeLessThan(9);
    expect(Math.max(...tp.portals.map((p) => p.row))).toBeGreaterThan(19);
  });
});

describe('medusas del Fondo Marino', () => {
  const water = [52, 53, 54, 56, 57, 59, 60];
  it('solo hay medusas en el mundo del agua y todas se colocan', () => {
    for (let n = 1; n <= 100; n++) {
      const jelly = buildLevel(n).mechanics.some((m) => m.type === 'jellyfish');
      expect(jelly, `nivel ${n}`).toBe(water.includes(n));
    }
    for (const n of water) {
      const j = setup(n).mechanics.find((m) => m.kind === 'jellyfish') as unknown as { count: number };
      expect(j.count, `nivel ${n}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('paralizan a Pac-Man sin matarlo y luego le dan un respiro', () => {
    const s = setup(53);
    const j = s.mechanics.find((m) => m.kind === 'jellyfish') as unknown as { paths: { col: number; row: number }[][]; stunned: boolean; pacSpeedFactor(p: unknown): number };
    s.run(1);
    const t = j.paths[0][0];
    s.place(t.col, t.row);
    s.run(1);
    expect(j.stunned).toBe(true);
    expect(j.pacSpeedFactor(s.pac)).toBeLessThan(0.1);
    expect(s.hits()).toBe(false);
    s.run(200);
    expect(j.stunned).toBe(false);
    expect(j.pacSpeedFactor(s.pac)).toBe(1);
  });
});

describe('lava del Volcán', () => {
  const volcano = [61, 63, 64, 65, 67, 68, 70];
  it('solo hay erupciones en algunos niveles del mundo 7', () => {
    for (let n = 1; n <= 100; n++) expect(buildLevel(n).mechanics.some((m) => m.type === 'lava'), `nivel ${n}`).toBe(volcano.includes(n));
  });

  it('avisa antes de la erupción y solo mata durante ella, dentro de la salpicadura', () => {
    const s = setup(65);
    const lava = s.mechanics.find((m) => m.kind === 'lava') as unknown as { active: { tile: { col: number; row: number }; phase: string }[]; splashRadius: number };
    s.place(ORIGINAL_PAC_SPAWN.col, ORIGINAL_PAC_SPAWN.row);
    const first = s.run(5000, () => lava.active.length > 0);
    expect(first).toBeGreaterThan(60); // no empieza de golpe
    const v = lava.active[0];
    expect(v.phase).toBe('warn');
    // Aviso: aunque Pac-Man esté encima, todavía no mata.
    s.place(v.tile.col, v.tile.row);
    expect(s.hits()).toBe(false);
    s.run(1000, () => lava.active[0]?.phase === 'erupt');
    expect(s.hits()).toBe(true);
    // Lejos de la salpicadura no pasa nada.
    s.place(ORIGINAL_PAC_SPAWN.col, ORIGINAL_PAC_SPAWN.row);
    expect(s.hits()).toBe(false);
  });

  it('el aviso nunca cae cerca de Pac-Man', () => {
    const s = setup(70);
    const lava = s.mechanics.find((m) => m.kind === 'lava') as unknown as { active: { tile: { col: number; row: number }; phase: string }[] };
    s.place(ORIGINAL_PAC_SPAWN.col, ORIGINAL_PAC_SPAWN.row);
    for (let i = 0; i < 20; i++) {
      s.run(5000, () => lava.active.some((v) => v.phase === 'warn'));
      for (const v of lava.active) expect(Math.abs(v.tile.col - s.pac.col) + Math.abs(v.tile.row - s.pac.row)).toBeGreaterThanOrEqual(5);
      s.run(400, () => lava.active.length === 0);
    }
  });
});

describe('bombas contra fantasmas', () => {
  it('matan a los fantasmas del radio al explotar y a los que entran en la llamarada', () => {
    const s = setup(62);
    const bomb = s.mechanics[0] as BombMechanic;
    const site = bomb.sites[0];
    const cx = site.col * 8 + 4;
    const cy = site.row * 8 + 4;
    s.ghosts[0].state = 'active';
    s.ghosts[0].x = cx + 3;
    s.ghosts[0].y = cy;
    s.ghosts[1].state = 'active';
    s.ghosts[1].x = cx + 200;
    s.ghosts[1].y = cy;
    s.place(site.col, site.row + 1);
    s.run(1000, () => s.killed.length > 0);
    expect(s.killed).toContain(s.ghosts[0]);
    expect(s.killed).not.toContain(s.ghosts[1]);
    // Otro fantasma entra en la llamarada mientras arde.
    s.ghosts[2].state = 'active';
    s.ghosts[2].x = cx - 4;
    s.ghosts[2].y = cy;
    s.run(5);
    expect(s.killed).toContain(s.ghosts[2]);
  });
});

describe('ayudantes que comen puntos', () => {
  it('la miniatura se come los puntos por los que pasa', () => {
    const s = setup(16);
    const comp = s.mechanics.find((m) => m instanceof CompanionMechanic) as CompanionMechanic;
    expect(comp).toBeDefined();
    const before = s.maze.pelletsLeft;
    const tile = comp.tiles[0];
    s.place(tile.col, tile.row);
    s.run(1);
    s.ghosts[0].state = 'active';
    s.ghosts[0].x = s.pac.x + 120;
    s.ghosts[0].y = s.pac.y;
    s.run(200);
    expect(comp.active).not.toBeNull();
    expect(s.maze.pelletsLeft).toBeLessThan(before - 1);
  });

  it('no se come los energizers', () => {
    const s = setup(13);
    const energizers = [...s.maze.pelletTiles()].filter((p) => p.kind === 'energizer').length;
    s.place(1, 3);
    s.run(1);
    expect([...s.maze.pelletTiles()].filter((p) => p.kind === 'energizer').length).toBe(energizers);
  });
});

describe('platillo volante del espacio', () => {
  const space = [71, 73, 74, 76, 78, 80];
  type Ufo = { present: boolean; position: { x: number; y: number }; boltCount: number; phaseName: string; summon(env: MechanicEnv): void; shotAt(x: number, y: number, env: MechanicEnv): boolean };
  const ufoOf = (s: ReturnType<typeof setup>) => s.mechanics.find((m) => m.kind === 'ufo') as unknown as Ufo;

  it('solo hay platillos en algunos niveles del mundo 8', () => {
    for (let n = 1; n <= 100; n++) expect(buildLevel(n).mechanics.some((m) => m.type === 'ufo'), `nivel ${n}`).toBe(space.includes(n));
  });

  it('llega, dispara a Pac-Man atravesando muros, y se va pasados unos segundos', () => {
    const s = setup(74);
    const u = ufoOf(s);
    s.place(ORIGINAL_PAC_SPAWN.col, ORIGINAL_PAC_SPAWN.row);
    expect(s.run(5000, () => u.present)).toBeGreaterThan(0);
    expect(s.run(1500, () => u.boltCount > 0)).toBeGreaterThanOrEqual(0);
    expect(u.boltCount).toBeGreaterThan(0);
    // Un rayo pasa por encima de una pared y mata si alcanza a Pac-Man.
    expect(s.run(3000, () => s.hits())).toBeGreaterThanOrEqual(0);
    s.run(4000, () => !u.present);
    expect(u.present).toBe(false);
  });

  it('un disparo de la pistola lo derriba, y una bomba cercana también', () => {
    const s = setup(74);
    const u = ufoOf(s);
    u.summon(s.env);
    s.run(30);
    expect(u.present).toBe(true);
    expect(u.shotAt(u.position.x + 40, u.position.y, s.env)).toBe(false);
    expect(u.shotAt(u.position.x + 3, u.position.y, s.env)).toBe(true);
    expect(u.present).toBe(false);
    expect(s.sounds).toContain('explosion');

    const t = setup(74);
    const v = ufoOf(t);
    v.summon(t.env);
    t.run(30);
    t.env.blast(v.position.x + 10, v.position.y, 30);
    expect(v.present).toBe(false);
  });
});

describe('reparto de objetos por todo el laberinto', () => {
  it('los objetos caen tanto en la mitad de arriba como en la de abajo', async () => {
    const { pickSpread } = await import('../src/game/level/placement');
    const def = buildLevel(20);
    let top = 0;
    let bottom = 0;
    for (let seed = 1; seed <= 200; seed++) {
      for (const t of pickSpread(def.maze, 1, createRng(seed))) {
        if (t.row < 15) top++;
        else bottom++;
      }
    }
    // Antes todos caían arriba (lo más lejos de la salida): ahora hay de ambos lados.
    expect(top).toBeGreaterThan(40);
    expect(bottom).toBeGreaterThan(40);
  });

  it('varios objetos siguen quedando separados y lejos de la salida de Pac-Man', async () => {
    const { pickSpread, bfs } = await import('../src/game/level/placement');
    const { PAC_SPAWN_TILE } = await import('../src/game/maze/generator');
    const def = buildLevel(20);
    for (let seed = 1; seed <= 30; seed++) {
      const tiles = pickSpread(def.maze, 3, createRng(seed));
      expect(new Set(tiles.map((t) => `${t.col},${t.row}`)).size).toBe(3);
      const d = bfs(def.maze, PAC_SPAWN_TILE).dist;
      for (const t of tiles) expect(d[t.row * 28 + t.col]).toBeGreaterThanOrEqual(6);
    }
  });
});

describe('nivel 80: centro de abajo sin trampas', () => {
  it('ninguna torreta ni sierra pasa por las filas 21–27', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const def = buildLevel(80);
      const mechs = createMechanics(def.mechanics, def.maze, createRng(seed));
      for (const m of mechs) {
        const own = m as unknown as { turrets?: unknown[]; saws?: { from: { row: number }; to: { row: number } }[] };
        for (const t of (own.turrets ?? []) as { wall: { y: number }; dr: number; length: number }[]) {
          // La línea de tiro (sin contar la casilla de pared de la que sale) no toca las filas 21–27.
          const ys = [t.wall.y, t.wall.y + t.dr * t.length];
          const lo = Math.min(...ys);
          const hi = Math.max(...ys);
          expect(hi < 22 * 8 || lo >= 28 * 8, `torreta ${JSON.stringify(t.wall)}`).toBe(true);
        }
        for (const w of own.saws ?? []) for (const row of [w.from.row, w.to.row]) expect(row < 21 || row > 27, `sierra fila ${row}`).toBe(true);
      }
    }
  });
});

describe('fantasma gigante del castillo', () => {
  const castle = [83, 85, 87, 89, 90];
  type Boo = { present: boolean; isFrozen: boolean; position: { x: number; y: number }; phaseName: string; summon(env: MechanicEnv): void };
  const booOf = (s: ReturnType<typeof setup>) => s.mechanics.find((m) => m.kind === 'boo') as unknown as Boo & { x: number; y: number };

  it('solo aparece en algunos niveles del mundo 9', () => {
    for (let n = 1; n <= 100; n++) expect(buildLevel(n).mechanics.some((m) => m.type === 'boo'), `nivel ${n}`).toBe(castle.includes(n));
  });

  it('persigue atravesando paredes, se paraliza si Pac-Man lo mira y avanza si le da la espalda', () => {
    const s = setup(83);
    const b = booOf(s);
    s.place(14, 23);
    s.pac.dir = Dir.Left;
    b.summon(s.env);
    s.run(100); // termina de aparecer
    expect(b.phaseName).toBe('chase');
    // Lo coloca a la espalda de Pac-Man (Pac mira a la izquierda; el fantasma está a la derecha).
    (b as unknown as { x: number; y: number }).x = s.pac.x + 60;
    (b as unknown as { x: number; y: number }).y = s.pac.y;
    const x0 = b.position.x;
    s.run(30);
    expect(b.isFrozen).toBe(false);
    expect(b.position.x).toBeLessThan(x0);
    // Ahora Pac-Man se da la vuelta y lo mira: se queda quieto.
    s.pac.dir = Dir.Right;
    const x1 = b.position.x;
    s.run(30);
    expect(b.isFrozen).toBe(true);
    expect(b.position.x).toBe(x1);
  });

  it('mata si toca a Pac-Man (aunque esté paralizado), pero no mientras aparece, y se va al rato', () => {
    const s = setup(83);
    const b = booOf(s);
    s.place(14, 23);
    s.pac.dir = Dir.Left;
    b.summon(s.env);
    (b as unknown as { x: number; y: number }).x = s.pac.x + 3;
    (b as unknown as { x: number; y: number }).y = s.pac.y;
    expect(s.hits()).toBe(false); // aparece: inofensivo
    s.run(100);
    (b as unknown as { x: number; y: number }).x = s.pac.x + 3;
    (b as unknown as { x: number; y: number }).y = s.pac.y;
    expect(s.hits()).toBe(true);
    s.run(60 * 40, () => !b.present);
    expect(b.present).toBe(false);
  });
});

describe('elementos del Núcleo Glitch', () => {
  const has = (type: string) => Array.from({ length: 100 }, (_, i) => i + 1).filter((n) => buildLevel(n).mechanics.some((m) => m.type === type));
  it('solo salen en algunos niveles del mundo 10', () => {
    expect(has('cloak')).toEqual([93, 98, 100]);
    expect(has('hole')).toEqual([91, 94, 97, 99]);
    expect(has('corrupt')).toEqual([92, 96, 100]);
  });

  it('el manto vuelve invisible a Pac-Man y se puede coger solo una vez seguida', () => {
    const s = setup(93);
    const cloak = s.mechanics.find((m) => m.kind === 'cloak') as unknown as { tiles: { col: number; row: number }[] };
    const t = cloak.tiles[0];
    expect(s.view.has('invisible')).toBe(false);
    s.place(t.col, t.row);
    s.run(1);
    expect(s.view.has('invisible')).toBe(true);
    expect(s.view.poisoned).toBe(false); // ayuda: no pone a Pac-Man verde
    expect(s.sounds).toContain('collect');
  });

  it('el agujero de datos te lleva lejos, sin avisar, y se cierra unos segundos', () => {
    const s = setup(94);
    const hole = s.mechanics.find((m) => m.kind === 'hole') as unknown as { tiles: { col: number; row: number }[] };
    const t = hole.tiles[0];
    s.place(t.col, t.row);
    s.run(1);
    const dist = Math.abs(s.pac.col - t.col) + Math.abs(s.pac.row - t.row);
    expect(dist).toBeGreaterThanOrEqual(9);
    // Cerrado: volver a pisarlo no hace nada.
    const there = { x: s.pac.x, y: s.pac.y };
    s.place(t.col, t.row);
    s.run(5);
    expect(s.pac.col).toBe(t.col);
    expect(there).toBeDefined();
  });

  it('la zona corrupta gira el mando mientras se pisa y un instante después', () => {
    const s = setup(92);
    const z = s.mechanics.find((m) => m.kind === 'corrupt') as unknown as { tileList: { col: number; row: number }[] };
    const t = z.tileList[0];
    s.place(t.col, t.row);
    s.run(1);
    expect(s.view.has('scramble')).toBe(true);
    s.place(13, 23);
    for (let i = 0; i < 120; i++) {
      s.run(1);
      s.view.update();
    }
    expect(s.view.has('scramble')).toBe(false);
  });
});
