/**
 * Temática familiar: Cely (esposa), Aina (12 años) y Aleix (8 años) acompañan a Pac-Man
 * durante los 100 niveles. Todo el texto vive aquí para poder editarlo sin tocar el motor.
 */
export type FamilyMember = 'cely' | 'aina' | 'aleix';

export const FAMILY: Record<FamilyMember, { name: string; color: string; role: string }> = {
  cely: { name: 'CELY', color: '#ff5fa8', role: 'Esposa secuestrada por el Fantasma Rey' },
  aina: { name: 'AINA', color: '#7fd7ff', role: 'Navegante: marca el camino (Pista)' },
  aleix: { name: 'ALEIX', color: '#ffb347', role: 'Travieso: despista a los fantasmas (Señuelo)' },
};

export interface Phrase {
  who: FamilyMember;
  /** Dos líneas de como mucho 26 caracteres cada una. */
  lines: [string, string];
}

/** Tres frases por mundo; el nivel dentro del mundo elige una. */
const PHRASES: Phrase[][] = [
  [
    { who: 'aina', lines: ['PAPA, ESTE SITIO ES UNA', 'RECREATIVA DE LAS ANTIGUAS'] },
    { who: 'aleix', lines: ['QUE GRANDES SON LOS', 'FANTASMAS, PAPA!'] },
    { who: 'cely', lines: ['SE QUE VENDRAS A POR MI.', 'CUIDA DE LOS NINOS'] },
  ],
  [
    { who: 'aleix', lines: ['AQUI HAY SETAS GIGANTES!', 'PUEDO COGER UNA?'] },
    { who: 'aina', lines: ['LA NIEBLA NO ME DA MIEDO.', 'SIGUE MI PISTA, PAPA'] },
    { who: 'cely', lines: ['HUELO A BOSQUE DESDE', 'AQUI. AGUANTA, CARINO'] },
  ],
  [
    { who: 'aina', lines: ['ESAS CINTAS ME MAREAN.', 'CUIDADO CON LAS PRENSAS'] },
    { who: 'aleix', lines: ['PAPA, QUE RUIDO HACEN', 'ESTAS MAQUINAS!'] },
    { who: 'cely', lines: ['NO TE DES PRISA, PAC.', 'LLEGAR ENTERO IMPORTA'] },
  ],
  [
    { who: 'aleix', lines: ['TENGO FRIO, PAPA. UN', 'ABRAZO CUANDO ACABEMOS'] },
    { who: 'aina', lines: ['EL HIELO RESBALA. FRENA', 'ANTES DE LAS ESQUINAS'] },
    { who: 'cely', lines: ['LA NIEVE ES BONITA SI', 'SE VE DESDE CASA'] },
  ],
  [
    { who: 'aina', lines: ['ESTAS PIRAMIDES TIENEN', 'MUCHAS TRAMPAS'] },
    { who: 'aleix', lines: ['VOY A BUSCAR UN TESORO', 'ESCONDIDO!'] },
    { who: 'cely', lines: ['ME ACUERDO DE NUESTRO', 'VIAJE. SIGUE ADELANTE'] },
  ],
  [
    { who: 'aleix', lines: ['HAY PECES DE COLORES!', 'MIRA, PAPA, MIRA'] },
    { who: 'aina', lines: ['VIGILA EL AIRE: LAS', 'BURBUJAS SON TU AMIGAS'] },
    { who: 'cely', lines: ['TE ESPERO CON LA CENA', 'CALIENTE, PAC'] },
  ],
  [
    { who: 'aina', lines: ['ESE VOLCAN SE VA A', 'ENFADAR. DATE PRISA'] },
    { who: 'aleix', lines: ['LA LAVA QUEMA! NO LA', 'TOQUES, PAPA'] },
    { who: 'cely', lines: ['ESTAS HACIENDO ALGO', 'ENORME. ESTOY ORGULLOSA'] },
  ],
  [
    { who: 'aleix', lines: ['SOMOS ASTRONAUTAS!', 'MI CASCO ES DE PAC-MAN'] },
    { who: 'aina', lines: ['SIN GRAVEDAD HAY QUE', 'PENSAR CADA GIRO'] },
    { who: 'cely', lines: ['MIRA LAS ESTRELLAS Y', 'ACUERDATE DE MI'] },
  ],
  [
    { who: 'aina', lines: ['EL CASTILLO ESTA LLENO', 'DE ESPEJOS Y LLAVES'] },
    { who: 'aleix', lines: ['AQUI VIVEN LOS', 'FANTASMAS DE VERDAD'] },
    { who: 'cely', lines: ['YA CASI ESTAMOS. UN', 'ULTIMO ESFUERZO'] },
  ],
  [
    { who: 'aleix', lines: ['TODO SE ESTA ROMPIENDO,', 'PAPA. NO TENGO MIEDO'] },
    { who: 'aina', lines: ['ESTE ES EL FINAL. LO', 'HEMOS APRENDIDO TODO'] },
    { who: 'cely', lines: ['AQUI ESTOY, PAC. VEN', 'A BUSCARME'] },
  ],
];

/** Frase para la tarjeta de inicio del nivel (1–100). */
export function levelPhrase(level: number): Phrase {
  const n = Math.min(Math.max(Math.floor(level), 1), 100);
  const world = Math.ceil(n / 10);
  const stage = ((n - 1) % 10) + 1;
  const list = PHRASES[world - 1];
  return list[(stage - 1) % list.length];
}
