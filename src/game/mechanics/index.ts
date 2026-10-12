import type { MechanicDef } from '../level/schema';
import type { Rng } from '../random';
import { ConveyorMechanic } from './conveyor';
import type { Mechanic } from './mechanic';

export type { Mechanic, MechanicEnv } from './mechanic';

/** Crea las mecánicas de un nivel a partir de sus datos. Para añadir una nueva: un caso aquí. */
export function createMechanics(defs: readonly MechanicDef[], lines: readonly string[], rng: Rng): Mechanic[] {
  return defs.map((def) => {
    switch (def.type) {
      case 'conveyor':
        return new ConveyorMechanic(def, lines, rng);
    }
  });
}
