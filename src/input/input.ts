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

/** Dirección dominante de un desplazamiento (d-pad virtual); null dentro de la zona muerta. */
export function directionFromOffset(dx: number, dy: number, dead: number): Dir | null {
  if (Math.hypot(dx, dy) < dead) return null;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? Dir.Right : Dir.Left) : dy > 0 ? Dir.Down : Dir.Up;
}

/** Distancia mínima (px de pantalla) para considerar un gesto como swipe. */
const SWIPE_MIN = 18;

/**
 * Unifica teclado, táctil (swipe en toda la pantalla) y gamepad en una
 * "intención" de dirección más una pulsación de acción (start/confirmar).
 */
export class Input {
  private dir: Dir | null = null;
  /** Sube con cada petición de dirección: permite distinguir una pulsación nueva de una antigua. */
  directionSeq = 0;

  /** Última dirección pedida; se mantiene hasta que el juego la consume. */
  get direction(): Dir | null {
    return this.dir;
  }

  set direction(d: Dir | null) {
    this.dir = d;
    if (d !== null) this.directionSeq++;
  }
  private pressed = false;
  private pauseRequested = false;
  private muteRequested = false;
  private ainaRequested = false;
  private aleixRequested = false;
  private fireRequested = false;
  private padFireDown = false;
  private padHeld: Dir | null = null;
  private padHeldTicks = 0;
  private padHelperDown = [false, false];
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
      if (e.code === 'KeyZ') this.ainaRequested = true;
      if (e.code === 'KeyX') this.aleixRequested = true;
      if (e.code === 'Space' || e.code === 'KeyF') this.fireRequested = true;
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
    let held: Dir | null = null;
    if (b(12) || ay < -0.5) held = Dir.Up;
    else if (b(13) || ay > 0.5) held = Dir.Down;
    else if (b(14) || ax < -0.5) held = Dir.Left;
    else if (b(15) || ax > 0.5) held = Dir.Right;
    // Una dirección mantenida se repite cada 14 ticks (así los menús no saltan 60 veces por segundo).
    if (held === null) this.padHeldTicks = 0;
    else if (held !== this.padHeld || this.padHeldTicks % 14 === 0) this.direction = held;
    if (held !== null) this.padHeldTicks++;
    this.padHeld = held;

    const a = b(0);
    if (a && !this.padWasDown) this.pressed = true;
    this.padWasDown = a;
    const start = b(9);
    if (start && !this.padStartWasDown) {
      this.pressed = true;
      this.pauseRequested = true;
    }
    this.padStartWasDown = start;
    // X → Aina (pista), Y → Aleix (señuelo)
    const helpers = [b(2), b(3)];
    if (helpers[0] && !this.padHelperDown[0]) this.ainaRequested = true;
    if (helpers[1] && !this.padHelperDown[1]) this.aleixRequested = true;
    this.padHelperDown = helpers;
    // B o gatillo derecho → disparar
    const fire = b(1) || b(7);
    if (fire && !this.padFireDown) this.fireRequested = true;
    this.padFireDown = fire;
  }

  /** ¿Se pulsó algo desde la última consulta? (para pantallas de título) */
  /** Acciones desde botones en pantalla. */
  requestDirection(dir: Dir): void {
    this.direction = dir;
    this.pressed = true;
  }

  requestPause(): void {
    this.pauseRequested = true;
  }

  requestFire(): void {
    this.fireRequested = true;
  }

  consumeFire(): boolean {
    const f = this.fireRequested;
    this.fireRequested = false;
    return f;
  }

  requestAina(): void {
    this.ainaRequested = true;
  }

  requestAleix(): void {
    this.aleixRequested = true;
  }

  consumeAina(): boolean {
    const r = this.ainaRequested;
    this.ainaRequested = false;
    return r;
  }

  consumeAleix(): boolean {
    const r = this.aleixRequested;
    this.aleixRequested = false;
    return r;
  }

  requestMute(): void {
    this.muteRequested = true;
  }

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
