import { Dir } from '../game/constants';

const KEY_MAP: Record<string, Dir> = {
  ArrowUp: Dir.Up,
  KeyW: Dir.Up,
  ArrowLeft: Dir.Left,
  KeyA: Dir.Left,
  ArrowDown: Dir.Down,
  KeyS: Dir.Down,
  ArrowRight: Dir.Right,
  KeyD: Dir.Right,
};

/** Distancia mínima (px de pantalla) para considerar un gesto como swipe. */
const SWIPE_MIN = 18;

/**
 * Unifica teclado, táctil (swipe en toda la pantalla) y gamepad en una
 * "intención" de dirección más una pulsación de acción (start/confirmar).
 */
export class Input {
  /** Última dirección pedida; se mantiene hasta que el juego la consume. */
  direction: Dir | null = null;
  private pressed = false;
  private pauseRequested = false;
  private muteRequested = false;
  private touchStart: { id: number; x: number; y: number } | null = null;
  private padWasDown = false;
  private padStartWasDown = false;

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code in KEY_MAP) {
        this.direction = KEY_MAP[e.code];
        e.preventDefault();
      }
      if (e.code === 'Enter' || e.code === 'Space') this.pressed = true;
      if (e.code === 'KeyP' || e.code === 'Escape') this.pauseRequested = true;
      if (e.code === 'KeyM') this.muteRequested = true;
      this.pressed = true;
    });

    target.addEventListener('pointerdown', (e) => {
      this.pressed = true;
      if (e.pointerType === 'mouse') return;
      this.touchStart = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    target.addEventListener('pointermove', (e) => {
      const s = this.touchStart;
      if (!s || s.id !== e.pointerId) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
      this.direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? Dir.Right : Dir.Left) : dy > 0 ? Dir.Down : Dir.Up;
      // Reinicia el origen para encadenar giros sin levantar el dedo.
      this.touchStart = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    const end = (e: PointerEvent) => {
      if (this.touchStart?.id === e.pointerId) this.touchStart = null;
    };
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  }

  /** Debe llamarse una vez por tick lógico. */
  poll(): void {
    const pad = navigator.getGamepads?.().find((g) => g && g.connected);
    if (!pad) return;
    const b = (i: number) => pad.buttons[i]?.pressed ?? false;
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    if (b(12) || ay < -0.5) this.direction = Dir.Up;
    else if (b(13) || ay > 0.5) this.direction = Dir.Down;
    else if (b(14) || ax < -0.5) this.direction = Dir.Left;
    else if (b(15) || ax > 0.5) this.direction = Dir.Right;

    const a = b(0);
    if (a && !this.padWasDown) this.pressed = true;
    this.padWasDown = a;
    const start = b(9);
    if (start && !this.padStartWasDown) {
      this.pressed = true;
      this.pauseRequested = true;
    }
    this.padStartWasDown = start;
  }

  /** ¿Se pulsó algo desde la última consulta? (para pantallas de título) */
  consumePress(): boolean {
    const p = this.pressed;
    this.pressed = false;
    return p;
  }

  consumeMute(): boolean {
    const m = this.muteRequested;
    this.muteRequested = false;
    return m;
  }

  consumePause(): boolean {
    const p = this.pauseRequested;
    this.pauseRequested = false;
    return p;
  }
}
