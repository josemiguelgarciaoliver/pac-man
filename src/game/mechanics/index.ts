import type { TileXY } from '../level/placement';
import type { MechanicDef } from '../level/schema';
import type { Rng } from '../random';
import { AnkhMechanic } from './ankh';
import { BlasterMechanic } from './blaster';
import { BooMechanic } from './boo';
import { BombMechanic } from './bomb';
import { BoostMechanic } from './boost';
import { CompanionMechanic } from './companion';
import { ConveyorMechanic } from './conveyor';
import { GateMechanic } from './gate';
import { JellyfishMechanic } from './jellyfish';
import { LavaMechanic } from './lava';
import type { Mechanic } from './mechanic';
import { MushroomMechanic } from './mushroom';
import { PhenomenonMechanic } from './phenomenon';
import { PuddleMechanic } from './puddle';
import { RageMechanic } from './rage';
import { SawbladeMechanic } from './sawblade';
import { SpikesMechanic } from './spikes';
import { TeleportMechanic } from './teleport';
import { TurretMechanic } from './turret';
import { UfoMechanic } from './ufo';

export type { Mechanic, MechanicEnv, SfxKind } from './mechanic';

/** Mecánicas que reparten objetos por el laberinto: no pueden solaparse entre sí ni con la misión. */
const PICKUPS = new Set(['ankh', 'blaster', 'bomb', 'boost', 'companion', 'mushroom', 'rage', 'teleport']);

/** Crea las mecánicas de un nivel a partir de sus datos. Para añadir una nueva: un caso aquí. */
export function createMechanics(defs: readonly MechanicDef[], lines: readonly string[], rng: Rng, occupied: readonly TileXY[] = []): Mechanic[] {
  // Casillas ya ocupadas por objetos: ningún objeto nuevo cae encima ni al lado.
  const taken: TileXY[] = [...occupied];
  return defs.map((def): Mechanic => {
    const made = build(def, taken);
    if (PICKUPS.has(def.type)) {
      const own = made as unknown as { tiles?: TileXY[]; portals?: TileXY[]; sites?: TileXY[] };
      taken.push(...(own.tiles ?? own.portals ?? own.sites ?? []).map((t) => ({ col: t.col, row: t.row })));
    }
    return made;
  });

  function build(def: MechanicDef, avoid: TileXY[]): Mechanic {
    switch (def.type) {
      case 'conveyor':
        return new ConveyorMechanic(def, lines, rng);
      case 'bomb':
        return new BombMechanic(def, lines, rng, avoid);
      case 'sawblade':
        return new SawbladeMechanic(def, lines, rng);
      case 'turret':
        return new TurretMechanic(def, lines, rng);
      case 'gate':
        return new GateMechanic(def, lines, rng);
      case 'teleport':
        return new TeleportMechanic(def, lines, rng, avoid);
      case 'spikes':
        return new SpikesMechanic(def, lines, rng);
      case 'mushroom':
        return new MushroomMechanic(def, lines, rng, avoid);
      case 'boo':
        return new BooMechanic(def, lines, rng);
      case 'ufo':
        return new UfoMechanic(def, lines, rng);
      case 'lava':
        return new LavaMechanic(def, lines, rng);
      case 'jellyfish':
        return new JellyfishMechanic(def, lines, rng);
      case 'phenomenon':
        return new PhenomenonMechanic(def);
      case 'ankh':
        return new AnkhMechanic(def, lines, rng, avoid);
      case 'blaster':
        return new BlasterMechanic(def, lines, rng, avoid);
      case 'companion':
        return new CompanionMechanic(def, lines, rng, avoid);
      case 'rage':
        return new RageMechanic(def, lines, rng, avoid);
      case 'boost':
        return new BoostMechanic(def, lines, rng, avoid);
      case 'puddle':
        return new PuddleMechanic(def, lines, rng);
    }
  }
}
