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

/** Traduce una tecla en dirección (flechas y WASD); null si no es de movimiento. */
export function interpretKey(code: string): Dir | null {
  return KEY_MAP[code] ?? null;
}

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
/** Lo mínimo que se lee de un mando (compatible con el `Gamepad` del navegador). */
export interface PadLike {
  buttons: ReadonlyArray<{ pressed: boolean }>;
  axes: ReadonlyArray<number>;
}

export interface PadActions {
  /** Dirección nueva (se repite al mantener) o null. */
  dir: Dir | null;
  press: boolean;
  pause: boolean;
  aina: boolean;
  aleix: boolean;
  fire: boolean;
}

/**
 * Traduce el estado del mando en acciones (solo en el flanco de pulsación):
 * cruceta o stick → dirección · A → aceptar · Start → pausa · X (2) → Aina (bomba) · Y (3) → Aleix (señuelo)
 * B (1) o gatillo derecho (7) → disparar. Los botones L1/R1 (4, 5) también lanzan a Aina y a Aleix.
 */
export class PadReader {
  private held: Dir | null = null;
  private heldTicks = 0;
  private aDown = false;
  private startDown = false;
  private helperDown = [false, false];
  private fireDown = false;

  read(pad: PadLike): PadActions {
    const b = (i: number) => pad.buttons[i]?.pressed ?? false;
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    let held: Dir | null = null;
    if (b(12) || ay < -0.5) held = Dir.Up;
    else if (b(13) || ay > 0.5) held = Dir.Down;
    else if (b(14) || ax < -0.5) held = Dir.Left;
    else if (b(15) || ax > 0.5) held = Dir.Right;
    // Una dirección mantenida se repite cada 14 ticks (así los menús no saltan 60 veces por segundo).
    let dir: Dir | null = null;
    if (held === null) this.heldTicks = 0;
    else if (held !== this.held || this.heldTicks % 14 === 0) dir = held;
    if (held !== null) this.heldTicks++;
    this.held = held;

    const a = b(0);
    const press = a && !this.aDown;
    this.aDown = a;
    const start = b(9);
    const pause = start && !this.startDown;
    this.startDown = start;
    const helpers = [b(2) || b(4), b(3) || b(5)];
    const aina = helpers[0] && !this.helperDown[0];
    const aleix = helpers[1] && !this.helperDown[1];
    this.helperDown = helpers;
    const fire = b(1) || b(7);
    const shoot = fire && !this.fireDown;
    this.fireDown = fire;
    return { dir, press: press || pause, pause, aina, aleix, fire: shoot };
  }
}

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
  private readonly pad = new PadReader();
  private touchStart: { id: number; x: number; y: number } | null = null;

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      const dir = interpretKey(e.code);
      if (dir !== null) {
        this.direction = dir;
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
    const act = this.pad.read(pad);
    if (act.dir !== null) this.direction = act.dir;
    if (act.press) this.pressed = true;
    if (act.pause) this.pauseRequested = true;
    if (act.aina) this.ainaRequested = true;
    if (act.aleix) this.aleixRequested = true;
    if (act.fire) this.fireRequested = true;
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
