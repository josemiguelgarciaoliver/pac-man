import type { SpecialKind } from '../game/maze/special';

/**
 * Niveles "raros": su laberinto no sale del generador de pasillos sino de una distribución
 * especial (ver `game/maze/special.ts`). `title` se muestra en la tarjeta de inicio del nivel.
 */
export interface SpecialLayout {
  kind: SpecialKind;
  title: string;
  seed?: number;
}

export const SPECIAL_LAYOUTS: Record<number, SpecialLayout> = {
  9: { kind: 'arena', title: 'SALA SIN PAREDES' },
  18: { kind: 'ring', title: 'EL ANILLO' },
  27: { kind: 'pillars', title: 'LA NAVE DE POSTES' },
  34: { kind: 'lake', title: 'EL LAGO HELADO' },
  46: { kind: 'hall', title: 'LA SALA DE COLUMNAS' },
  50: { kind: 'pyramid', title: 'LA GRAN PIRAMIDE' },
  58: { kind: 'asteroids', title: 'EL ARRECIFE ABIERTO', seed: 58 },
  66: { kind: 'crater', title: 'EL CRATER' },
  77: { kind: 'asteroids', title: 'CAMPO DE ASTEROIDES', seed: 77 },
  86: { kind: 'throne', title: 'EL SALON DEL TRONO' },
  93: { kind: 'grid', title: 'EL TABLERO ROTO' },
  99: { kind: 'asteroids', title: 'EL CAMPO VACIO', seed: 99 },
};
