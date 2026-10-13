import { Dir, TICK_RATE, opposite } from './constants';

/**
 * Efectos de estado que alteran cómo se ve o se controla el juego. Los provocan las setas tóxicas
 * y los "fenómenos" de algunos niveles. Todos son temporales.
 */
export type EffectKind = 'wobble' | 'invert' | 'scramble' | 'rotate' | 'mirror' | 'dark' | 'turbo' | 'boost' | 'gun';

export const EFFECT_INFO: Record<EffectKind, { label: string; color: string }> = {
  wobble: { label: 'VISION BORROSA', color: '#c58bff' },
  invert: { label: 'CONTROLES AL REVES', color: '#ff6f91' },
  scramble: { label: 'CONTROLES GIRADOS', color: '#ff9a3d' },
  rotate: { label: 'LABERINTO GIRADO', color: '#27e8ff' },
  mirror: { label: 'MUNDO EN ESPEJO', color: '#7fd7ff' },
  dark: { label: 'OSCURIDAD', color: '#8a8fb5' },
  turbo: { label: 'TURBO', color: '#3fdc6a' },
  boost: { label: 'SUPERVELOCIDAD', color: '#ffe94a' },
  gun: { label: 'DISPARO', color: '#ff9a45' },
};

/** Efectos que pueden salir de una seta o de un fenómeno (la supervelocidad es un objeto aparte). */
/** Efectos que perjudican a Pac-Man: mientras duran, se le tiñe de verde (envenenado). */
export const NEGATIVE_EFFECTS: readonly EffectKind[] = ['wobble', 'invert', 'scramble', 'mirror', 'dark']; // el giro del laberinto no envenena

export const ALL_EFFECTS: EffectKind[] = ['wobble', 'invert', 'scramble', 'rotate', 'mirror', 'dark', 'turbo'];

/** Giro de 90° en sentido horario / antihorario (el orden de Dir es antihorario: arriba, izquierda, abajo, derecha). */
const cw = (d: Dir): Dir => ((d + 3) % 4) as Dir;
const ccw = (d: Dir): Dir => ((d + 1) % 4) as Dir;
const mirrorDir = (d: Dir): Dir => (d === Dir.Left ? Dir.Right : d === Dir.Right ? Dir.Left : d);

export class ViewEffects {
  private left = new Map<EffectKind, number>();
  /** Ángulo actual de la vista (se acerca suavemente al objetivo). */
  private angle = 0;
  /** Escala horizontal de la vista: 1 normal, −1 espejo (pasa por 0 al girarse, como una moneda). */
  private flip = 1;
  private wobble = 0;
  private dark = 0;

  add(kind: EffectKind, seconds: number): void {
    const ticks = Math.round(seconds * TICK_RATE);
    this.left.set(kind, Math.max(ticks, this.left.get(kind) ?? 0));
  }

  /** Quita todos los efectos y devuelve la vista a la normalidad al instante (sin desvanecerse). */
  clear(): void {
    this.left.clear();
    this.angle = 0;
    this.flip = 1;
    this.wobble = 0;
    this.dark = 0;
  }

  has(kind: EffectKind): boolean {
    return (this.left.get(kind) ?? 0) > 0;
  }

  /** ¿Sufre Pac-Man algún efecto negativo? (se dibuja de verde) */
  get poisoned(): boolean {
    return NEGATIVE_EFFECTS.some((k) => this.has(k));
  }

  secondsLeft(kind: EffectKind): number {
    return Math.ceil((this.left.get(kind) ?? 0) / TICK_RATE);
  }

  /** Efectos activos, del que menos tiempo le queda al que más (para el aviso en pantalla). */
  active(): { kind: EffectKind; seconds: number }[] {
    return [...this.left.entries()]
      .filter(([, t]) => t > 0)
      .map(([kind, t]) => ({ kind, seconds: Math.ceil(t / TICK_RATE) }))
      .sort((a, b) => a.seconds - b.seconds);
  }

  update(): void {
    for (const [k, t] of this.left) {
      if (t <= 1) this.left.delete(k);
      else this.left.set(k, t - 1);
    }
    const ease = (v: number, target: number, rate: number) => (Math.abs(target - v) < 0.002 ? target : v + (target - v) * rate);
    this.angle = ease(this.angle, this.has('rotate') ? Math.PI / 2 : 0, 0.1);
    this.flip = ease(this.flip, this.has('mirror') ? -1 : 1, 0.14);
    this.wobble = ease(this.wobble, this.has('wobble') ? 1 : 0, 0.08);
    this.dark = ease(this.dark, this.has('dark') ? 1 : 0, 0.06);
  }

  /**
   * Convierte lo que pulsa el jugador (relativo a lo que ve en pantalla) en la dirección del laberinto:
   * primero los efectos de mando (al revés / girado) y luego deshace el giro y el espejo de la vista.
   */
  mapInput(dir: Dir): Dir {
    let d = dir;
    if (this.has('invert')) d = opposite(d);
    if (this.has('scramble')) d = cw(d);
    if (this.has('mirror')) d = mirrorDir(d);
    if (this.has('rotate')) d = ccw(d);
    return d;
  }

  /** 1 = vista rotada del todo (para escalar el laberinto y que siga cabiendo). */
  private fit(w: number, h: number): number {
    const c = Math.abs(Math.cos(this.angle));
    const s = Math.abs(Math.sin(this.angle));
    return Math.min(w / (c * w + s * h), h / (s * w + c * h));
  }

  /** Aplica el giro y el espejo al lienzo, alrededor del centro (cx, cy) de un área w×h. */
  applyMazeTransform(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number): void {
    if (this.angle === 0 && this.flip === 1) return;
    const f = this.fit(w, h);
    ctx.translate(cx, cy);
    ctx.scale(this.flip * f, f);
    ctx.rotate(this.angle);
    ctx.translate(-cx, -cy);
  }

  /** Dónde cae en pantalla un punto del laberinto con la vista actual (para texto que no debe girar). */
  toScreen(x: number, y: number, cx: number, cy: number, w: number, h: number): { x: number; y: number } {
    const f = this.fit(w, h);
    const dx = x - cx;
    const dy = y - cy;
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    return { x: cx + this.flip * f * (dx * cos - dy * sin), y: cy + f * (dx * sin + dy * cos) };
  }

  /** Intensidad de la visión borrosa (0–1) y de la oscuridad (0–1). */
  get wobbleAmount(): number {
    return this.wobble;
  }

  get darkAmount(): number {
    return this.dark;
  }

  /** Multiplicador de la velocidad de Pac-Man. */
  get speedFactor(): number {
    if (this.has('boost')) return 1.45;
    return this.has('turbo') ? 1.3 : 1;
  }
}
