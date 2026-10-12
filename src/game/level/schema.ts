import { z } from 'zod';
import { ALL_EFFECTS } from '../viewEffects';

/**
 * Formato de datos de un nivel. Todo lo que cambia entre niveles (laberinto, misión, mecánicas,
 * paleta, dificultad) vive aquí, validado al cargar: añadir un nivel no requiere tocar el motor.
 */
export const missionSchema = z.discriminatedUnion('type', [
  /** Comer todos los puntos (clásico). */
  z.object({ type: z.literal('CLEAR') }),
  /** Recoger objetos repartidos por el laberinto. */
  z.object({
    type: z.literal('COLLECT'),
    count: z.number().int().min(1).max(10),
    icon: z.enum(['letters', 'nut', 'glyph', 'pearl', 'cell', 'gem']),
    timeLimit: z.number().int().min(10).max(300).optional(),
  }),
  /** Llegar a un punto del mapa, a veces contra reloj. */
  z.object({ type: z.literal('REACH'), timeLimit: z.number().int().min(10).max(300).optional() }),
  /** Liberar a un amigo enjaulado y llevarlo a la salida. */
  z.object({ type: z.literal('RESCUE') }),
  /** Comer N fantasmas (los energizers reaparecen). */
  z.object({ type: z.literal('HUNT'), ghosts: z.number().int().min(1).max(30) }),
  /** Aguantar con vida X segundos. */
  z.object({ type: z.literal('SURVIVE'), seconds: z.number().int().min(10).max(600) }),
]);

export const mechanicSchema = z.discriminatedUnion('type', [
  /** Cintas transportadoras sobre tramos rectos de pasillo. */
  z.object({
    type: z.literal('conveyor'),
    segments: z.number().int().min(1).max(10),
    /** Empuje en px por tick (Pac-Man avanza ≈1 px/tick). */
    speed: z.number().min(0.1).max(0.9),
    /** Si se indica, el sentido se invierte cada N segundos (con aviso parpadeante). */
    reverseEvery: z.number().int().min(3).max(60).optional(),
    /** ¿También arrastran a los fantasmas? */
    ghosts: z.boolean().default(false),
    /** Sentidos alternos en tramos contiguos (líneas de montaje). */
    chain: z.boolean().default(false),
  }),
  /** Bombas: al acercarse Pac-Man se arman y estallan, derribando paredes y matando lo que pillen. */
  z.object({
    type: z.literal('bomb'),
    count: z.number().int().min(1).max(6),
    fuseSeconds: z.number().min(1.5).max(8).default(3),
    radius: z.number().int().min(1).max(3).default(2),
  }),
  /** Sierras que patrullan un pasillo de punta a punta. */
  z.object({
    type: z.literal('sawblade'),
    count: z.number().int().min(1).max(6),
    speed: z.number().min(0.3).max(1.4),
  }),
  /** Torretas en la pared que disparan de lado a lado de un pasillo, avisando antes. */
  z.object({
    type: z.literal('turret'),
    count: z.number().int().min(1).max(4),
    periodSeconds: z.number().min(2).max(12),
  }),
  /** Puertas que se abren y se cierran solas. */
  z.object({
    type: z.literal('gate'),
    count: z.number().int().min(1).max(6),
    openSeconds: z.number().min(2).max(10),
    closedSeconds: z.number().min(1).max(8),
  }),
  /** Portales por parejas: Pac-Man sale por el otro. */
  z.object({
    type: z.literal('teleport'),
    pairs: z.number().int().min(1).max(3),
  }),
  /** Pinchos que salen del suelo con ritmo (avisan antes de subir). */
  z.object({
    type: z.literal('spikes'),
    count: z.number().int().min(1).max(8),
    periodSeconds: z.number().min(2).max(8),
  }),
  /** Setas tóxicas: al comerlas dan un efecto al azar (visión, mando, giro, espejo, oscuridad, turbo). */
  z.object({
    type: z.literal('mushroom'),
    count: z.number().int().min(1).max(6),
    effects: z.array(z.enum(ALL_EFFECTS as [string, ...string[]])).min(1).default([...ALL_EFFECTS]),
    effectSeconds: z.number().min(3).max(20).default(8),
  }),
  /** Fenómeno periódico del nivel: el laberinto gira, se refleja, se oscurece o confunde el mando. */
  z.object({
    type: z.literal('phenomenon'),
    effect: z.enum(ALL_EFFECTS as [string, ...string[]]),
    everySeconds: z.number().min(6).max(90),
    durationSeconds: z.number().min(3).max(40),
  }),
  /** Rayos de supervelocidad: Pac-Man corre a toda máquina unos segundos. */
  z.object({
    type: z.literal('boost'),
    count: z.number().int().min(1).max(4),
    seconds: z.number().min(3).max(12).default(6),
  }),
  /** Charcos de barro que frenan a todos. */
  z.object({
    type: z.literal('puddle'),
    count: z.number().int().min(1).max(6),
  }),
]);

export const levelSchema = z.object({
  level: z.number().int().min(1).max(100),
  world: z.number().int().min(1).max(10),
  stage: z.number().int().min(1).max(10),
  name: z.string().min(1),
  /** Nivel equivalente del arcade que indexa las tablas de velocidad y tiempos. */
  arcadeLevel: z.number().int().min(1).max(40),
  maze: z.array(z.string().length(28)).length(31),
  wallColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  mission: missionSchema,
  mechanics: z.array(mechanicSchema),
});

export type MissionDef = z.infer<typeof missionSchema>;
export type MechanicDef = z.infer<typeof mechanicSchema>;
export type LevelDef = z.infer<typeof levelSchema>;
