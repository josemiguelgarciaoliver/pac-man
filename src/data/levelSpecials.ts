import type { MechanicDef, MissionDef } from '../game/level/schema';

/**
 * Misión y mecánicas de los niveles que no son "comer todos los puntos" (ver PLAN.md §4.4).
 * Los niveles que no aparecen aquí son CLEAR sin mecánicas. Las mecánicas todavía sin motor
 * (hielo, lava, niebla, torretas…) se irán añadiendo en las fases de contenido.
 */
export interface LevelSpecial {
  mission?: MissionDef;
  mechanics?: MechanicDef[];
}

const belts = (segments: number, extra: Partial<Extract<MechanicDef, { type: 'conveyor' }>> = {}): MechanicDef => ({
  type: 'conveyor',
  segments,
  speed: 0.4,
  ghosts: false,
  chain: false,
  ...extra,
});

export const LEVEL_SPECIALS: Record<number, LevelSpecial> = {
  // Mundo 1 — Arcade Clásico
  5: { mission: { type: 'COLLECT', count: 4, icon: 'letters' } },
  8: { mission: { type: 'HUNT', ghosts: 8 } },
  // Mundo 2 — Bosque Encantado
  14: { mission: { type: 'REACH', timeLimit: 75 } },
  // Mundo 3 — La Fábrica
  21: { mechanics: [belts(3)] },
  22: { mechanics: [belts(4, { reverseEvery: 8 })] },
  25: { mission: { type: 'COLLECT', count: 5, icon: 'nut' }, mechanics: [belts(3)] },
  26: { mechanics: [belts(4, { ghosts: true })] },
  28: { mission: { type: 'RESCUE' }, mechanics: [belts(4)] },
  29: { mechanics: [belts(6, { chain: true, reverseEvery: 12 })] },
  // Mundo 4 — Polo Helado
  35: { mission: { type: 'SURVIVE', seconds: 90 } },
  38: { mission: { type: 'REACH', timeLimit: 80 } },
  // Mundo 5 — Pirámides del Desierto
  45: { mission: { type: 'COLLECT', count: 3, icon: 'glyph' } },
  49: { mission: { type: 'RESCUE' } },
  // Mundo 6 — Fondo Marino (corrientes = cintas suaves)
  51: { mechanics: [belts(4, { speed: 0.25, ghosts: true })] },
  58: { mission: { type: 'COLLECT', count: 6, icon: 'pearl', timeLimit: 120 } },
  59: { mechanics: [belts(5, { speed: 0.25, ghosts: true, reverseEvery: 10 })] },
  // Mundo 7 — Volcán
  65: { mission: { type: 'SURVIVE', seconds: 100 } },
  67: { mission: { type: 'REACH', timeLimit: 70 } },
  // Mundo 8 — Estación Espacial
  75: { mission: { type: 'COLLECT', count: 5, icon: 'cell' } },
  78: { mission: { type: 'RESCUE' } },
  // Mundo 9 — Castillo Fantasma
  85: { mission: { type: 'HUNT', ghosts: 12 } },
  // Mundo 10 — El Núcleo Glitch
  92: { mechanics: [belts(5, { speed: 0.5, ghosts: true, reverseEvery: 6 })] },
  95: { mission: { type: 'REACH', timeLimit: 60 } },
  98: { mission: { type: 'SURVIVE', seconds: 120 } },
};
