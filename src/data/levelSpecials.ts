import type { MechanicDef, MissionDef } from '../game/level/schema';
import type { EffectKind } from '../game/viewEffects';

/**
 * Misión y mecánicas de los niveles que no son "comer todos los puntos" (ver PLAN.md §4.4 y §4.6).
 * Los niveles que no aparecen aquí son CLEAR sin mecánicas. Cada mundo introduce sus mecánicas
 * una a una y las combina hacia el final; los jefes de cada mundo llegarán en las fases de contenido.
 */
export interface LevelSpecial {
  mission?: MissionDef;
  mechanics?: MechanicDef[];
}

type Belt = Extract<MechanicDef, { type: 'conveyor' }>;

// ── Constructores breves de mecánicas ──
const belts = (segments: number, extra: Partial<Belt> = {}): MechanicDef => ({ type: 'conveyor', segments, speed: 0.4, ghosts: false, chain: false, ...extra });
const bombs = (count: number, fuseSeconds = 3, radius = 2): MechanicDef => ({ type: 'bomb', count, fuseSeconds, radius });
const saws = (count: number, speed = 0.6): MechanicDef => ({ type: 'sawblade', count, speed });
const turrets = (count: number, periodSeconds = 5): MechanicDef => ({ type: 'turret', count, periodSeconds });
const gates = (count: number, openSeconds = 6, closedSeconds = 4): MechanicDef => ({ type: 'gate', count, openSeconds, closedSeconds });
const portals = (pairs: number): MechanicDef => ({ type: 'teleport', pairs });
const spikes = (count: number, periodSeconds = 4.5): MechanicDef => ({ type: 'spikes', count, periodSeconds });
const shrooms = (count: number, effects: EffectKind[] = ['wobble', 'invert', 'scramble', 'rotate', 'mirror', 'dark', 'turbo'], effectSeconds = 8): MechanicDef => ({
  type: 'mushroom',
  count,
  effects,
  effectSeconds,
});
const phenomenon = (effect: EffectKind, everySeconds: number, durationSeconds: number): MechanicDef => ({ type: 'phenomenon', effect, everySeconds, durationSeconds });
const mud = (count: number): MechanicDef => ({ type: 'puddle', count });
const bolt = (count = 1, seconds = 6): MechanicDef => ({ type: 'boost', count, seconds });

export const LEVEL_SPECIALS: Record<number, LevelSpecial> = {
  // ── Mundo 1 — Arcade Clásico: los básicos, uno a uno ──
  3: { mechanics: [portals(1)] },
  5: { mission: { type: 'COLLECT', count: 4, icon: 'letters' } },
  6: { mechanics: [mud(2)] },
  7: { mechanics: [bombs(1, 4)] },
  8: { mission: { type: 'HUNT', ghosts: 8 } },
  9: { mechanics: [bombs(2, 4), portals(1)] },
  10: { mechanics: [spikes(2, 5.5)] },

  // ── Mundo 2 — Bosque Encantado: setas, portales y enredaderas ──
  11: { mechanics: [mud(2)] },
  12: { mechanics: [portals(2)] },
  13: { mechanics: [gates(3, 7, 4)] },
  14: { mission: { type: 'REACH', timeLimit: 75 }, mechanics: [portals(1)] },
  15: { mechanics: [shrooms(2, ['dark', 'turbo'], 7)] },
  16: { mechanics: [gates(3), mud(2)] },
  17: { mechanics: [shrooms(3, ['wobble', 'invert'], 7)] },
  18: { mechanics: [phenomenon('dark', 22, 9)] },
  19: { mechanics: [shrooms(3), portals(1)] },
  20: { mechanics: [shrooms(4, undefined, 9), gates(2)] },

  // ── Mundo 3 — La Fábrica: cintas, prensas y sierras ──
  21: { mechanics: [belts(3)] },
  22: { mechanics: [belts(4, { reverseEvery: 8 }), spikes(2)] },
  23: { mechanics: [spikes(4, 4)] },
  24: { mechanics: [gates(4, 6, 4)] },
  25: { mission: { type: 'COLLECT', count: 5, icon: 'nut' }, mechanics: [belts(3)] },
  26: { mechanics: [belts(4, { ghosts: true }), saws(1, 0.6)] },
  27: { mechanics: [saws(2, 0.7), spikes(2)] },
  28: { mission: { type: 'RESCUE' }, mechanics: [belts(4), gates(2)] },
  29: { mechanics: [belts(6, { chain: true, reverseEvery: 12 }), saws(2, 0.7)] },
  30: { mechanics: [belts(5, { chain: true }), saws(3, 0.8), turrets(1, 6)] },

  // ── Mundo 4 — Polo Helado: barro helado, deshielos y ventiscas ──
  31: { mechanics: [mud(3)] },
  32: { mechanics: [mud(3), portals(1)] },
  33: { mechanics: [bombs(2, 3.5)] },
  34: { mechanics: [phenomenon('wobble', 16, 7)] },
  35: { mission: { type: 'SURVIVE', seconds: 90 }, mechanics: [phenomenon('wobble', 18, 8)] },
  36: { mechanics: [portals(2)] },
  37: { mechanics: [spikes(3, 5)] },
  38: { mission: { type: 'REACH', timeLimit: 80 }, mechanics: [mud(2)] },
  39: { mechanics: [bombs(2, 3.5), gates(2)] },
  40: { mechanics: [turrets(2, 5), bombs(1), mud(2)] },

  // ── Mundo 5 — Pirámides del Desierto: muros falsos, dardos y momias ──
  41: { mechanics: [mud(3)] },
  42: { mechanics: [bombs(3, 3.5)] },
  43: { mechanics: [phenomenon('dark', 20, 10)] },
  44: { mechanics: [turrets(2, 6)] },
  45: { mission: { type: 'COLLECT', count: 3, icon: 'glyph' }, mechanics: [turrets(1, 6)] },
  46: { mechanics: [saws(2, 0.6)] },
  47: { mechanics: [phenomenon('wobble', 14, 8), mud(2)] },
  48: { mechanics: [spikes(4, 4), saws(1, 0.7)] },
  49: { mission: { type: 'RESCUE' }, mechanics: [gates(3)] },
  50: { mechanics: [turrets(3, 5), bombs(2), spikes(2)] },

  // ── Mundo 6 — Fondo Marino: corrientes, medusas y remolinos ──
  51: { mechanics: [belts(4, { speed: 0.25, ghosts: true })] },
  52: { mechanics: [mud(3), phenomenon('wobble', 18, 6)] },
  53: { mechanics: [saws(3, 0.5)] },
  54: { mechanics: [portals(2)] },
  55: { mechanics: [gates(3, 5, 3), belts(3, { speed: 0.25 })] },
  56: { mechanics: [spikes(3, 5)] },
  57: { mechanics: [gates(4, 5, 4)] },
  58: { mission: { type: 'COLLECT', count: 6, icon: 'pearl', timeLimit: 120 }, mechanics: [saws(2, 0.5)] },
  59: { mechanics: [belts(5, { speed: 0.25, ghosts: true, reverseEvery: 10 }), portals(1)] },
  60: { mechanics: [saws(3, 0.7), turrets(2, 5), belts(3, { speed: 0.25 })] },

  // ── Mundo 7 — Volcán: géiseres, derrumbes y torretas de fuego ──
  61: { mechanics: [spikes(5, 4)] },
  62: { mechanics: [bombs(3, 3)] },
  63: { mechanics: [gates(3), spikes(3)] },
  64: { mechanics: [turrets(3, 5)] },
  65: { mission: { type: 'SURVIVE', seconds: 100 }, mechanics: [spikes(3, 4)] },
  66: { mechanics: [saws(3, 0.8)] },
  67: { mission: { type: 'REACH', timeLimit: 70 }, mechanics: [spikes(3, 4)] },
  68: { mechanics: [saws(4, 0.9)] },
  69: { mechanics: [turrets(3, 4), bombs(2, 3)] },
  70: { mechanics: [spikes(5, 4), turrets(3, 4.5), saws(2, 0.8)] },

  // ── Mundo 8 — Estación Espacial: portales, láseres y giros de gravedad ──
  71: { mechanics: [mud(3), portals(1)] },
  72: { mechanics: [portals(3)] },
  73: { mechanics: [turrets(4, 4)] },
  74: { mechanics: [shrooms(2, ['turbo', 'dark', 'mirror'], 7)] },
  75: { mission: { type: 'COLLECT', count: 5, icon: 'cell' }, mechanics: [turrets(2, 5)] },
  76: { mechanics: [phenomenon('rotate', 16, 8)] },
  77: { mechanics: [saws(4, 0.9)] },
  78: { mission: { type: 'RESCUE' }, mechanics: [portals(2)] },
  79: { mechanics: [phenomenon('mirror', 13, 7), portals(1)] },
  80: { mechanics: [turrets(4, 3.5), saws(3, 0.9), phenomenon('rotate', 18, 7)] },

  // ── Mundo 9 — Castillo Fantasma: puertas, ballestas y espejos ──
  81: { mechanics: [gates(4, 5, 4)] },
  82: { mechanics: [turrets(3, 4)] },
  83: { mechanics: [shrooms(3, ['dark', 'wobble'], 8)] },
  84: { mechanics: [gates(5, 4, 3)] },
  85: { mission: { type: 'HUNT', ghosts: 12 }, mechanics: [gates(2)] },
  86: { mechanics: [phenomenon('mirror', 12, 7)] },
  87: { mechanics: [bombs(3, 3), portals(2)] },
  88: { mechanics: [saws(3, 0.9), gates(3)] },
  89: { mechanics: [spikes(4, 4), turrets(2, 4), shrooms(2)] },
  90: { mechanics: [turrets(3, 4), gates(3, 5, 3), bombs(2, 3)] },

  // ── Mundo 10 — El Núcleo Glitch: todo mezclado y corrompido ──
  91: { mechanics: [shrooms(4, undefined, 9), portals(2)] },
  92: { mechanics: [belts(5, { speed: 0.5, ghosts: true, reverseEvery: 6 }), spikes(3, 4)] },
  93: { mechanics: [turrets(3, 4), saws(3, 0.8), phenomenon('dark', 18, 9)] },
  94: { mechanics: [phenomenon('mirror', 10, 8), shrooms(3, ['invert', 'scramble'], 9)] },
  95: { mission: { type: 'REACH', timeLimit: 60 }, mechanics: [phenomenon('rotate', 14, 8), gates(3)] },
  96: { mechanics: [bombs(3, 2.5), turrets(3, 3.5), spikes(4, 3.5)] },
  97: { mechanics: [mud(3), portals(2), saws(4, 0.9), shrooms(3)] },
  98: { mission: { type: 'SURVIVE', seconds: 120 }, mechanics: [turrets(3, 3.5), saws(3, 0.9), spikes(3, 4)] },
  99: { mechanics: [phenomenon('rotate', 12, 8), bombs(3, 2.5), shrooms(3)] },
  100: { mechanics: [turrets(4, 3.5), saws(4, 0.9), bombs(3, 2.5), shrooms(4, undefined, 9), phenomenon('rotate', 16, 7)] },
};

/**
 * Rayos de supervelocidad: aparecen en un nivel de cada cinco (4, 9, 14…) y en el último, como
 * respiro y recompensa entre tanto peligro. Se añaden a lo que ya tenga el nivel.
 */
for (const n of [...Array.from({ length: 20 }, (_, i) => 4 + i * 5), 100]) {
  const entry = (LEVEL_SPECIALS[n] ??= {});
  entry.mechanics = [...(entry.mechanics ?? []), bolt(n >= 50 ? 2 : 1, n >= 50 ? 7 : 6)];
}
