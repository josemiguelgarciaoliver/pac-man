import type { GhostName } from './actors/ai';
import { COLORS, DIRS, Dir } from './constants';
import type { FruitKind } from './rules';

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

// ───────────────────────── Fantasmas ─────────────────────────

type Rgb = string;
const GHOST_COLOR: Record<GhostName, Rgb> = {
  blinky: '#ff0000',
  pinky: '#ffb8ff',
  inky: '#00ffff',
  clyde: '#ffb852',
};

function paint(fn: (x: number, y: number) => Rgb | null, size = SIZE): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = fn(x, y);
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}

function inBody(x: number, y: number, frame: number): boolean {
  const px = x + 0.5;
  const py = y + 0.5;
  if (y < 8) return (px - 8) ** 2 + (py - 8) ** 2 <= 7.6 ** 2;
  if (x < 1 || x > 14) return false;
  const phase = (x + frame * 2) % 4;
  if (y === 14) return phase !== 3;
  if (y === 15) return phase < 2;
  return true;
}

function eyes(x: number, y: number, dir: Dir): Rgb | null {
  const d = DIRS[dir];
  for (const ecx of [5.5, 10.5]) {
    const px = x + 0.5;
    const py = y + 0.5;
    const ecy = 6.5;
    if (((px - ecx) / 2.1) ** 2 + ((py - ecy) / 2.7) ** 2 > 1) continue;
    const pcx = ecx + d.x * 1.2;
    const pcy = ecy + d.y * 1.5;
    return Math.abs(px - pcx) <= 1 && Math.abs(py - pcy) <= 1 ? '#2121de' : '#ffffff';
  }
  return null;
}

const cache = new Map<string, HTMLCanvasElement>();
const cached = (key: string, make: () => HTMLCanvasElement) => {
  let c = cache.get(key);
  if (!c) cache.set(key, (c = make()));
  return c;
};

export type GhostLook = 'normal' | 'frightened' | 'flash' | 'eyes';

export function ghostSprite(name: GhostName, dir: Dir, anim: number, look: GhostLook): HTMLCanvasElement {
  const frame = Math.floor(anim / 6) % 2;
  if (look === 'eyes') {
    return cached(`eyes-${dir}`, () => paint((x, y) => eyes(x, y, dir)));
  }
  if (look === 'normal') {
    return cached(`${name}-${dir}-${frame}`, () =>
      paint((x, y) => eyes(x, y, dir) ?? (inBody(x, y, frame) ? GHOST_COLOR[name] : null)),
    );
  }
  const flash = look === 'flash';
  return cached(`fright-${flash}-${frame}`, () =>
    paint((x, y) => {
      if (!inBody(x, y, frame)) return null;
      const face = flash ? '#ff0000' : '#ffb8ae';
      if ((y === 6 || y === 7) && (x === 5 || x === 6 || x === 9 || x === 10)) return face;
      if (y === 11 && x >= 3 && x <= 12 && Math.floor((x - 3) / 2) % 2 === 0) return face;
      if (y === 10 && x >= 3 && x <= 12 && Math.floor((x - 3) / 2) % 2 === 1) return face;
      return flash ? '#ffffff' : '#2121de';
    }),
  );
}

const DEATH_FRAMES = 11;
export const PAC_DEATH_FRAMES = DEATH_FRAMES;

/** Fotograma i (0..10) de la animación de muerte: la boca se abre hasta que Pac-Man desaparece. */
export function pacDeathSprite(i: number): HTMLCanvasElement {
  return cached(`death-${i}`, () => makeFrame(Dir.Up, 0.15 + (i / (DEATH_FRAMES - 1)) * (Math.PI - 0.15)));
}

// ───────────────────────── Frutas ─────────────────────────

const FRUIT_COLOR: Record<FruitKind, [Rgb, Rgb]> = {
  cherry: ['#ff0000', '#00aa00'],
  strawberry: ['#ff2040', '#00cc00'],
  orange: ['#ffb852', '#00aa00'],
  apple: ['#ff0000', '#00aa00'],
  melon: ['#33cc33', '#ffffff'],
  galaxian: ['#ffff00', '#2121de'],
  bell: ['#ffff00', '#ffffff'],
  key: ['#00ffff', '#ffffff'],
};

export function fruitSprite(kind: FruitKind): HTMLCanvasElement {
  return cached(`fruit-${kind}`, () => {
    const [body, accent] = FRUIT_COLOR[kind];
    return paint((x, y) => {
      const px = x + 0.5;
      const py = y + 0.5;
      if (kind === 'cherry') {
        if ((px - 5) ** 2 + (py - 11) ** 2 <= 9 || (px - 11) ** 2 + (py - 11) ** 2 <= 9) return body;
        return x === 8 && y >= 2 && y <= 8 ? accent : null;
      }
      if ((px - 8) ** 2 + (py - 9.5) ** 2 <= 5.5 ** 2) return y < 8 && kind === 'galaxian' && x > 5 && x < 10 ? accent : body;
      if (y >= 2 && y <= 4 && x >= 7 && x <= 9) return accent;
      return null;
    });
  });
}
