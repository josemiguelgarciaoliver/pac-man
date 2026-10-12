import type { MechanicDef } from '../level/schema';
import type { Rng } from '../random';
import { BombMechanic } from './bomb';
import { BoostMechanic } from './boost';
import { ConveyorMechanic } from './conveyor';
import { GateMechanic } from './gate';
import type { Mechanic } from './mechanic';
import { MushroomMechanic } from './mushroom';
import { PhenomenonMechanic } from './phenomenon';
import { PuddleMechanic } from './puddle';
import { SawbladeMechanic } from './sawblade';
import { SpikesMechanic } from './spikes';
import { TeleportMechanic } from './teleport';
import { TurretMechanic } from './turret';

export type { Mechanic, MechanicEnv, SfxKind } from './mechanic';

/** Crea las mecánicas de un nivel a partir de sus datos. Para añadir una nueva: un caso aquí. */
export function createMechanics(defs: readonly MechanicDef[], lines: readonly string[], rng: Rng): Mechanic[] {
  return defs.map((def): Mechanic => {
    switch (def.type) {
      case 'conveyor':
        return new ConveyorMechanic(def, lines, rng);
      case 'bomb':
        return new BombMechanic(def, lines, rng);
      case 'sawblade':
        return new SawbladeMechanic(def, lines, rng);
      case 'turret':
        return new TurretMechanic(def, lines, rng);
      case 'gate':
        return new GateMechanic(def, lines, rng);
      case 'teleport':
        return new TeleportMechanic(def, lines, rng);
      case 'spikes':
        return new SpikesMechanic(def, lines, rng);
      case 'mushroom':
        return new MushroomMechanic(def, lines, rng);
      case 'phenomenon':
        return new PhenomenonMechanic(def);
      case 'boost':
        return new BoostMechanic(def, lines, rng);
      case 'puddle':
        return new PuddleMechanic(def, lines, rng);
    }
  });
}
