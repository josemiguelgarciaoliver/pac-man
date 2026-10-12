import { z } from 'zod';

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
