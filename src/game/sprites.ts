import { COLORS, Dir } from './constants';

const SIZE = 16;

/** Semi-ángulo de la boca en cada fotograma de la animación (cerrada → abierta). */
const MOUTH = [0, 0.45, 0.9];
/** Secuencia de fotogramas del arcade: cerrada, media, abierta, media… */
const CYCLE = [0, 1, 2, 1];

const FACING: Record<Dir, number> = {
  [Dir.Right]: 0,
  [Dir.Down]: Math.PI / 2,
  [Dir.Left]: Math.PI,
  [Dir.Up]: -Math.PI / 2,
};

function makeFrame(dir: Dir, mouth: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(SIZE, SIZE);
  const n = parseInt(COLORS.pac.slice(1), 16);
  const facing = FACING[dir];
  const radius = 6.6;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x + 0.5 - SIZE / 2;
      const dy = y + 0.5 - SIZE / 2;
      if (dx * dx + dy * dy > radius * radius) continue;
      if (mouth > 0) {
        let diff = Math.atan2(dy, dx) - facing;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        if (Math.abs(diff) < mouth) continue;
      }
      const i = (y * SIZE + x) * 4;
      img.data[i] = (n >> 16) & 255;
      img.data[i + 1] = (n >> 8) & 255;
      img.data[i + 2] = n & 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

let frames: HTMLCanvasElement[][] | null = null;

/** Sprite de Pac-Man (16×16, centrado en la posición del actor). */
export function pacSprite(dir: Dir, anim: number): HTMLCanvasElement {
  frames ??= [Dir.Up, Dir.Left, Dir.Down, Dir.Right].map((d) => MOUTH.map((m) => makeFrame(d, m)));
  // `anim` avanza 1 por tick; cada fotograma del ciclo dura 2 ticks.
  return frames[dir][CYCLE[Math.floor(anim / 2) % CYCLE.length]];
}

export const SPRITE_SIZE = SIZE;
