/**
 * Cada mundo tiene su propio aspecto: estilo y color de las paredes, fondo, textura del suelo,
 * partículas ambientales, forma de los puntos y emblema. Todo es datos, así que ajustar o crear un
 * mundo no toca el motor.
 */
export type WallStyle = 'neon' | 'solid' | 'brick' | 'wavy' | 'jagged' | 'dashed' | 'crystal' | 'glitch';
export type FloorPattern = 'none' | 'grass' | 'metal' | 'ice' | 'sand' | 'water' | 'lava' | 'grid' | 'stone' | 'glitch';
export type ParticleKind = 'none' | 'fireflies' | 'sparks' | 'snow' | 'dust' | 'bubbles' | 'embers' | 'stars' | 'wisps' | 'glitch';
export type PelletShape = 'dot' | 'seed' | 'bolt' | 'snowflake' | 'grain' | 'pearl' | 'ember' | 'star' | 'coin' | 'pixel';
export type EmblemKind = 'pacman' | 'leaf' | 'gear' | 'snowflake' | 'pyramid' | 'wave' | 'flame' | 'planet' | 'castle' | 'glitch';

export interface WorldTheme {
  id: number;
  /** Color de la línea de las paredes (y del resplandor). */
  wall: string;
  /** Relleno de las paredes (estilos sólidos); null = interior vacío. */
  wallFill: string | null;
  wallStyle: WallStyle;
  /** Tamaño del ladrillo en estilo 'brick' (unidades lógicas). */
  brick: number;
  /** Degradado de fondo (arriba, abajo). */
  bg: [string, string];
  /** Color (con alpha) del suelo de los pasillos y su textura. */
  floor: string;
  floorPattern: FloorPattern;
  particles: { kind: ParticleKind; color: string; count: number };
  pellet: { shape: PelletShape; color: string };
  energizer: string;
  emblem: EmblemKind;
}

export const WORLD_THEMES: readonly WorldTheme[] = [
  {
    id: 1,
    wall: '#3d5bff',
    wallFill: null,
    wallStyle: 'neon',
    brick: 0,
    bg: ['#000000', '#000000'],
    floor: 'rgba(0,0,0,0)',
    floorPattern: 'none',
    particles: { kind: 'none', color: '#ffffff', count: 0 },
    pellet: { shape: 'dot', color: '#ffb8ae' },
    energizer: '#ffb8ae',
    emblem: 'pacman',
  },
  {
    id: 2,
    wall: '#4be37a',
    wallFill: '#12441f',
    wallStyle: 'solid',
    brick: 0,
    bg: ['#031208', '#0b2a12'],
    floor: 'rgba(60,150,60,0.24)',
    floorPattern: 'grass',
    particles: { kind: 'fireflies', color: '#dfff6a', count: 26 },
    pellet: { shape: 'seed', color: '#ffe29a' },
    energizer: '#a6ff4a',
    emblem: 'leaf',
  },
  {
    id: 3,
    wall: '#ff9a3d',
    wallFill: '#2b2e3b',
    wallStyle: 'solid',
    brick: 0,
    bg: ['#08080d', '#16120d'],
    floor: 'rgba(255,154,61,0.09)',
    floorPattern: 'metal',
    particles: { kind: 'sparks', color: '#ffb347', count: 18 },
    pellet: { shape: 'bolt', color: '#ffd9a0' },
    energizer: '#ffb347',
    emblem: 'gear',
  },
  {
    id: 4,
    wall: '#6fe8ff',
    wallFill: null,
    wallStyle: 'crystal',
    brick: 0,
    bg: ['#031a2c', '#0a3555'],
    floor: 'rgba(190,240,255,0.14)',
    floorPattern: 'ice',
    particles: { kind: 'snow', color: '#ffffff', count: 60 },
    pellet: { shape: 'snowflake', color: '#eafcff' },
    energizer: '#9be8ff',
    emblem: 'snowflake',
  },
  {
    id: 5,
    wall: '#ffd24a',
    wallFill: '#5c4510',
    wallStyle: 'brick',
    brick: 3,
    bg: ['#1c1204', '#3d280a'],
    floor: 'rgba(255,215,130,0.13)',
    floorPattern: 'sand',
    particles: { kind: 'dust', color: '#ecc67e', count: 42 },
    pellet: { shape: 'grain', color: '#ffe08a' },
    energizer: '#ffcf40',
    emblem: 'pyramid',
  },
  {
    id: 6,
    wall: '#20e0cf',
    wallFill: null,
    wallStyle: 'wavy',
    brick: 0,
    bg: ['#02121f', '#04334a'],
    floor: 'rgba(70,210,230,0.13)',
    floorPattern: 'water',
    particles: { kind: 'bubbles', color: '#c4f7ff', count: 34 },
    pellet: { shape: 'pearl', color: '#f4ffff' },
    energizer: '#7ff3ff',
    emblem: 'wave',
  },
  {
    id: 7,
    wall: '#ff5a3a',
    wallFill: '#2e0d08',
    wallStyle: 'jagged',
    brick: 0,
    bg: ['#150404', '#3d0f06'],
    floor: 'rgba(255,90,40,0.15)',
    floorPattern: 'lava',
    particles: { kind: 'embers', color: '#ff9a40', count: 40 },
    pellet: { shape: 'ember', color: '#ffb060' },
    energizer: '#ff7a30',
    emblem: 'flame',
  },
  {
    id: 8,
    wall: '#b98aff',
    wallFill: null,
    wallStyle: 'dashed',
    brick: 0,
    bg: ['#04010f', '#140a30'],
    floor: 'rgba(150,120,255,0.07)',
    floorPattern: 'grid',
    particles: { kind: 'stars', color: '#ffffff', count: 70 },
    pellet: { shape: 'star', color: '#eadfff' },
    energizer: '#d49bff',
    emblem: 'planet',
  },
  {
    id: 9,
    wall: '#a79bd0',
    wallFill: '#2b2545',
    wallStyle: 'brick',
    brick: 6,
    bg: ['#07050f', '#17102b'],
    floor: 'rgba(160,150,210,0.1)',
    floorPattern: 'stone',
    particles: { kind: 'wisps', color: '#b9a6ff', count: 14 },
    pellet: { shape: 'coin', color: '#ffe08a' },
    energizer: '#c9b7ff',
    emblem: 'castle',
  },
  {
    id: 10,
    wall: '#ff3df2',
    wallFill: null,
    wallStyle: 'glitch',
    brick: 0,
    bg: ['#05000a', '#14001f'],
    floor: 'rgba(0,255,230,0.07)',
    floorPattern: 'glitch',
    particles: { kind: 'glitch', color: '#00ffe5', count: 20 },
    pellet: { shape: 'pixel', color: '#ffffff' },
    energizer: '#00ffe5',
    emblem: 'glitch',
  },
];

export const themeOfWorld = (world: number): WorldTheme => WORLD_THEMES[Math.min(Math.max(world, 1), WORLD_THEMES.length) - 1];

/** Parámetros del generador de laberintos de cada mundo: así los laberintos también se distinguen. */
export interface MazeStyle {
  /** Probabilidad de cortar tramos del esqueleto (más alta = más orgánico y abierto). */
  removeProb: [number, number];
  /** Líneas verticales interiores (más líneas = más manzanas pequeñas). */
  vLines: [number, number];
  /** Probabilidad de añadir la línea horizontal opcional de cada zona. */
  optionalH: number;
}

export const MAZE_STYLES: Record<number, MazeStyle> = {
  1: { removeProb: [0.25, 0.5], vLines: [3, 5], optionalH: 0.7 }, // el estilo base del arcade
  2: { removeProb: [0.38, 0.55], vLines: [4, 5], optionalH: 0.8 }, // bosque: orgánico y enmarañado
  3: { removeProb: [0.0, 0.1], vLines: [3, 4], optionalH: 1 }, // fábrica: rejilla de largos pasillos rectos
  4: { removeProb: [0.3, 0.45], vLines: [2, 3], optionalH: 0.4 }, // polo: grandes bloques de hielo
  5: { removeProb: [0.05, 0.15], vLines: [5, 5], optionalH: 1 }, // pirámides: cámaras pequeñas y regulares
  6: { removeProb: [0.42, 0.6], vLines: [3, 4], optionalH: 0.6 }, // mar: corrientes abiertas
  7: { removeProb: [0.2, 0.32], vLines: [3, 4], optionalH: 0.9 }, // volcán: tramos largos y quebrados
  8: { removeProb: [0.0, 0.06], vLines: [4, 5], optionalH: 1 }, // espacio: circuito ordenado
  9: { removeProb: [0.22, 0.34], vLines: [3, 4], optionalH: 0.8 }, // castillo: laberinto de bucles
  10: { removeProb: [0.0, 0.6], vLines: [2, 5], optionalH: 0.5 }, // glitch: caos
};
