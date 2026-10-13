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
    icon: z.enum(['letters', 'nut', 'glyph', 'pearl', 'cell', 'gem', 'shell', 'ember', 'star', 'key', 'chip']),
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
    /** Dónde caen las bombas: en todo el laberinto o solo en su mitad de abajo. */
    area: z.enum(['any', 'bottom']).default('any'),
  }),
  /** Sierras que patrullan un pasillo de punta a punta. */
  z.object({
    type: z.literal('sawblade'),
    count: z.number().int().min(1).max(6),
    speed: z.number().min(0.3).max(1.4),
    /** Filas [desde, hasta] por las que no puede pasar este peligro (zona que se deja libre). */
    clearRows: z.tuple([z.number().int(), z.number().int()]).optional(),
  }),
  /** Torretas en la pared que disparan de lado a lado de un pasillo, avisando antes. */
  z.object({
    type: z.literal('turret'),
    count: z.number().int().min(1).max(4),
    periodSeconds: z.number().min(2).max(12),
    /** Filas [desde, hasta] por las que no puede pasar este peligro (zona que se deja libre). */
    clearRows: z.tuple([z.number().int(), z.number().int()]).optional(),
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
    /** 'topBottom': cada pareja une la mitad de arriba del laberinto con la de abajo. */
    link: z.enum(['any', 'topBottom']).default('any'),
  }),
  /** Erupciones de lava al azar: el aviso muestra el área y la salpicadura mata a Pac-Man. */
  z.object({
    type: z.literal('lava'),
    /** Erupciones simultáneas. */
    count: z.number().int().min(1).max(3),
    /** Segundos medios entre erupciones. */
    everySeconds: z.number().min(4).max(30),
    /** Radio de la salpicadura en casillas. */
    splash: z.number().int().min(1).max(3).default(1),
  }),
  /** Manto glitch: Pac-Man invisible unos segundos (los fantasmas pierden su rastro). */
  z.object({
    type: z.literal('cloak'),
    count: z.number().int().min(1).max(2),
    seconds: z.number().min(3).max(20).default(8),
  }),
  /** Agujeros de datos: te escupen a una casilla cualquiera del laberinto. */
  z.object({
    type: z.literal('hole'),
    count: z.number().int().min(1).max(3),
  }),
  /** Zonas corruptas: mientras las pisas, el mando se gira. */
  z.object({
    type: z.literal('corrupt'),
    count: z.number().int().min(1).max(4),
  }),
  /** Fantasma gigante: atraviesa paredes y persigue a Pac-Man; se paraliza si Pac-Man lo mira. Se va al rato. */
  z.object({
    type: z.literal('boo'),
    /** Segundos medios entre visitas. */
    everySeconds: z.number().min(8).max(40),
    /** Segundos que persigue cada vez. */
    staySeconds: z.number().min(5).max(30).default(12),
  }),
  /** Platillo volante: visita el laberinto, vuela sobre las paredes y dispara a Pac-Man; bombas y pistola lo derriban. */
  z.object({
    type: z.literal('ufo'),
    /** Segundos medios entre visitas. */
    everySeconds: z.number().min(8).max(40),
    /** Segundos que se queda cada vez. */
    staySeconds: z.number().min(4).max(20).default(9),
    /** Segundos entre disparos. */
    fireSeconds: z.number().min(1.2).max(6).default(2.4),
  }),
  /** Medusas que patrullan un pasillo y paralizan un momento a Pac-Man si lo rozan. */
  z.object({
    type: z.literal('jellyfish'),
    count: z.number().int().min(1).max(4),
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
  /** Anj (☥): al cogerlo destruye a todos los fantasmas. */
  z.object({
    type: z.literal('ankh'),
    count: z.number().int().min(1).max(2),
  }),
  /** Blaster: Pac-Man puede disparar a los fantasmas (1 minuto por defecto). */
  z.object({
    type: z.literal('blaster'),
    count: z.number().int().min(1).max(3),
    seconds: z.number().min(10).max(120).default(60),
  }),
  /** Insignias de Aleix o Aina: invocan una miniatura que caza fantasmas unos segundos. */
  z.object({
    type: z.literal('companion'),
    who: z.enum(['aleix', 'aina']),
    count: z.number().int().min(1).max(3),
    seconds: z.number().min(4).max(30).optional(),
  }),
  /** Trampa de furia: al pisarla, un fantasma al azar corre a supervelocidad unos segundos. */
  z.object({
    type: z.literal('rage'),
    count: z.number().int().min(1).max(4),
    seconds: z.number().min(3).max(12).default(6),
  }),
  /** Zapatillas rojas de supervelocidad: Pac-Man corre a toda máquina (1 minuto por defecto). */
  z.object({
    type: z.literal('boost'),
    count: z.number().int().min(1).max(4),
    seconds: z.number().min(3).max(90).default(60),
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
  /** Distribución especial ("Sala sin paredes"…); se muestra en la tarjeta de inicio. */
  subtitle: z.string().optional(),
  maze: z.array(z.string().length(28)).length(31),
  wallColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  mission: missionSchema,
  mechanics: z.array(mechanicSchema),
});

export type MissionDef = z.infer<typeof missionSchema>;
export type MechanicDef = z.infer<typeof mechanicSchema>;
export type LevelDef = z.infer<typeof levelSchema>;
