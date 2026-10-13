import { FAMILY } from '../data/family';
import { MAZE_TOP } from './constants';
import { pickSpread, type TileXY } from './level/placement';
import type { Rng } from './random';
import { TAU, centerX, centerY, glow } from './mechanics/geometry';

/**
 * Misión de todo el juego: las letras A, L, E, I, X y N aparecen al azar en los laberintos. Cada una
 * rellena su hueco en AINA y en ALEIX (la A y la I valen para las dos palabras). Al completar una
 * palabra se gana una vida y esa palabra se reinicia; si se completan las dos a la vez, dos vidas.
 */
export type Word = 'aina' | 'aleix';

export const WORDS: Record<Word, string> = { aina: 'AINA', aleix: 'ALEIX' };
export const LETTERS = ['A', 'L', 'E', 'I', 'X', 'N'] as const;

export interface LetterSnapshot {
  aina: boolean[];
  aleix: boolean[];
}

const empty = (): LetterSnapshot => ({ aina: [false, false, false, false], aleix: [false, false, false, false, false] });

export class LetterCollection {
  slots: LetterSnapshot = empty();

  reset(): void {
    this.slots = empty();
  }

  snapshot(): LetterSnapshot {
    return { aina: [...this.slots.aina], aleix: [...this.slots.aleix] };
  }

  /** Recupera lo guardado (si es válido); si no, empieza vacío. */
  restore(saved: LetterSnapshot | undefined): void {
    const ok = saved && saved.aina?.length === 4 && saved.aleix?.length === 5 && [...saved.aina, ...saved.aleix].every((b) => typeof b === 'boolean');
    this.slots = ok ? { aina: [...saved.aina], aleix: [...saved.aleix] } : empty();
  }

  /** Letras que aún rellenan algún hueco de alguna de las dos palabras. */
  needed(): string[] {
    return LETTERS.filter((l) => (Object.keys(WORDS) as Word[]).some((w) => [...WORDS[w]].some((c, i) => c === l && !this.slots[w][i])));
  }

  /**
   * Recoge una letra: rellena el primer hueco libre de cada palabra que la lleve. Devuelve las palabras
   * que han quedado completas (que se reinician al instante).
   */
  collect(letter: string): Word[] {
    const done: Word[] = [];
    for (const w of Object.keys(WORDS) as Word[]) {
      const i = [...WORDS[w]].findIndex((c, k) => c === letter && !this.slots[w][k]);
      if (i < 0) continue;
      this.slots[w][i] = true;
      if (this.slots[w].every(Boolean)) done.push(w);
    }
    for (const w of done) this.slots[w] = this.slots[w].map(() => false);
    return done;
  }
}

interface Token {
  tile: TileXY;
  letter: string;
  taken: boolean;
}

/** Probabilidad de que un nivel traiga una letra, y de que traiga una segunda. */
const ONE_CHANCE = 0.6;
const TWO_CHANCE = 0.2;

/** Las letras que hay sueltas en el nivel actual. */
export class LetterTokens {
  private tokens: Token[] = [];

  constructor(lines: readonly string[], rng: Rng, collection: LetterCollection, avoid: readonly TileXY[]) {
    const count = rng.chance(ONE_CHANCE) ? (rng.chance(TWO_CHANCE) ? 2 : 1) : 0;
    if (count === 0) return;
    const pool = collection.needed();
    const tiles = pickSpread(lines, count, rng, undefined, avoid);
    for (const tile of tiles) this.tokens.push({ tile, letter: pool[rng.int(pool.length)], taken: false });
  }

  get tiles(): TileXY[] {
    return this.tokens.filter((t) => !t.taken).map((t) => t.tile);
  }

  get letters(): string[] {
    return this.tokens.filter((t) => !t.taken).map((t) => t.letter);
  }

  /** Letras que recoge Pac-Man en este tick. */
  update(pac: { col: number; row: number }): string[] {
    const got: string[] = [];
    for (const t of this.tokens) {
      if (t.taken || t.tile.col !== pac.col || t.tile.row !== pac.row) continue;
      t.taken = true;
      got.push(t.letter);
    }
    return got;
  }

  draw(ctx: CanvasRenderingContext2D, frame: number): void {
    for (const t of this.tokens) {
      if (t.taken) continue;
      const x = centerX(t.tile.col);
      const y = MAZE_TOP + centerY(t.tile.row) + Math.sin(frame / 10 + t.tile.col) * 0.8;
      // Color: celeste (solo AINA), naranja (solo ALEIX) o blanco (vale para las dos).
      const inAina = WORDS.aina.includes(t.letter);
      const inAleix = WORDS.aleix.includes(t.letter);
      const color = inAina && inAleix ? '#ffffff' : inAina ? FAMILY.aina.color : FAMILY.aleix.color;
      const pulse = 1 + 0.06 * Math.sin(frame / 6);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(pulse, pulse);
      glow(ctx, color, 4);
      ctx.fillStyle = '#10122a';
      ctx.beginPath();
      ctx.arc(0, 0, 4.9, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = color;
      ctx.font = "800 6.6px 'Trebuchet MS', Arial, sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText(t.letter, 0, 2.4);
      ctx.restore();
    }
  }
}

/** Dibuja las dos palabras del HUD con las letras ya conseguidas encendidas. */
export function drawLetterHud(ctx: CanvasRenderingContext2D, collection: LetterCollection, x: number, y: number): void {
  ctx.save();
  ctx.font = "800 6.4px 'Trebuchet MS', Arial, sans-serif";
  ctx.textAlign = 'center';
  let cx = x;
  for (const w of Object.keys(WORDS) as Word[]) {
    const color = FAMILY[w].color;
    [...WORDS[w]].forEach((c, i) => {
      const on = collection.slots[w][i];
      ctx.fillStyle = on ? color : '#3a3d55';
      if (on) {
        ctx.shadowColor = color;
        ctx.shadowBlur = ctx.getTransform().a * 1.5;
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.fillText(c, cx + 2.6, y);
      cx += 5.4;
    });
    cx += 3.5;
  }
  ctx.restore();
}
