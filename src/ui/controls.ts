import type { AudioManager } from '../audio/audio';
import { Dir } from '../game/constants';
import { directionFromOffset, type Input } from '../input/input';

const MODE_KEY = 'pacman.controls';

const ICONS = {
  pause: '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 4V5L7 9zM15 8.5a5 5 0 0 1 0 7M17.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M3 9v6h4l5 4V5L7 9z"/></svg>',
  muted: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 4V5L7 9z"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>',
  dpad: '<svg viewBox="0 0 24 24"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/></svg>',
  swipe: '<svg viewBox="0 0 24 24"><path d="M9 11V5a1.5 1.5 0 0 1 3 0v5h1V8.5a1.5 1.5 0 0 1 3 0V11h1v-.5a1.5 1.5 0 0 1 3 0V16c0 3-2.5 6-6 6h-1.5c-2 0-3.3-.9-4.500-2.500L4 15c-.7-1 .5-2.300 1.600-1.600L9 15.500z"/></svg>',
  full: '<svg viewBox="0 0 24 24"><path d="M4 4h6v2H6v4H4zM14 4h6v6h-2V6h-4zM4 14h2v4h4v2H4zM18 14h2v6h-6v-2h4z"/></svg>',
  exit: '<svg viewBox="0 0 24 24"><path d="M8 4h2v6H4V8h4zM14 4h2v4h4v2h-6zM4 14h6v6H8v-4H4zM14 14h6v2h-4v4h-2z"/></svg>',
};

// ?touch fuerza el diseño táctil (pruebas en escritorio).
const isTouch = (): boolean =>
  window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || new URLSearchParams(location.search).has('touch');

type FullscreenDoc = Document & { webkitFullscreenElement?: Element; webkitFullscreenEnabled?: boolean; webkitExitFullscreen?: () => void };
type FullscreenEl = HTMLElement & { webkitRequestFullscreen?: () => void };

/**
 * Controles en pantalla: cruceta virtual, pausa, sonido, modo de control y pantalla completa.
 * Solo habla con `Input` y `AudioManager`; el juego no sabe que existen.
 */
export function setupControls(input: Input, audio: AudioManager): { update(): void } {
  const app = document.getElementById('app')!;
  const dpad = document.getElementById('dpad')!;
  const controls = document.getElementById('controls')!;
  const btnPause = document.getElementById('btn-pause')!;
  const btnMute = document.getElementById('btn-mute')!;
  const btnMode = document.getElementById('btn-mode')!;
  const btnFull = document.getElementById('btn-full')!;

  const touch = isTouch();
  app.classList.toggle('touch', touch);

  // Los botones no deben contar como "pulsar para empezar" ni lanzar gestos de swipe.
  controls.addEventListener('pointerdown', (e) => e.stopPropagation());
  controls.addEventListener('pointermove', (e) => e.stopPropagation());

  // ── Modo de control (cruceta o solo gestos) ──
  let mode: 'dpad' | 'swipe' = 'dpad';
  try {
    if (localStorage.getItem(MODE_KEY) === 'swipe') mode = 'swipe';
  } catch {
    /* sin almacenamiento */
  }
  const applyMode = () => {
    app.classList.toggle('dpad-on', touch && mode === 'dpad');
    btnMode.innerHTML = mode === 'dpad' ? ICONS.swipe : ICONS.dpad;
    btnMode.setAttribute('aria-label', mode === 'dpad' ? 'Usar gestos' : 'Usar cruceta');
    // El tamaño disponible para el juego cambia: avisa para recalcular el lienzo.
    window.dispatchEvent(new Event('resize'));
  };
  btnMode.addEventListener('click', () => {
    mode = mode === 'dpad' ? 'swipe' : 'dpad';
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* sin almacenamiento */
    }
    applyMode();
  });
  btnMode.hidden = !touch;
  applyMode();

  // ── Cruceta: se lee la posición del dedo respecto al centro (se puede arrastrar) ──
  const arrows = new Map<Dir, Element>([
    [Dir.Up, dpad.querySelector('[data-dir=up]')!],
    [Dir.Down, dpad.querySelector('[data-dir=down]')!],
    [Dir.Left, dpad.querySelector('[data-dir=left]')!],
    [Dir.Right, dpad.querySelector('[data-dir=right]')!],
  ]);
  let activePointer: number | null = null;
  const press = (e: PointerEvent) => {
    const r = dpad.getBoundingClientRect();
    const dir = directionFromOffset(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2), r.width * 0.08);
    if (dir === null) return;
    input.requestDirection(dir);
    for (const [d, el] of arrows) el.classList.toggle('on', d === dir);
    navigator.vibrate?.(8);
  };
  dpad.addEventListener('pointerdown', (e) => {
    activePointer = e.pointerId;
    dpad.setPointerCapture(e.pointerId);
    press(e);
    e.preventDefault();
  });
  dpad.addEventListener('pointermove', (e) => {
    if (e.pointerId === activePointer) press(e);
  });
  const release = (e: PointerEvent) => {
    if (e.pointerId !== activePointer) return;
    activePointer = null;
    for (const el of arrows.values()) el.classList.remove('on');
  };
  dpad.addEventListener('pointerup', release);
  dpad.addEventListener('pointercancel', release);

  // ── Pausa y sonido ──
  btnPause.addEventListener('click', () => input.requestPause());
  btnMute.addEventListener('click', () => input.requestMute());

  // ── Pantalla completa (no existe en iPhone Safari: el botón queda oculto) ──
  const doc = document as FullscreenDoc;
  const root = document.documentElement as FullscreenEl;
  const fsSupported = !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
  btnFull.hidden = !fsSupported;
  const inFullscreen = () => !!(doc.fullscreenElement ?? doc.webkitFullscreenElement);
  btnFull.addEventListener('click', () => {
    if (inFullscreen()) {
      void (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
    } else {
      void (root.requestFullscreen?.() ?? root.webkitRequestFullscreen?.());
    }
  });

  // ── Estado de los iconos ──
  let lastMuted: boolean | null = null;
  let lastFull: boolean | null = null;
  btnPause.innerHTML = ICONS.pause;
  return {
    update() {
      if (lastMuted !== audio.muted) {
        lastMuted = audio.muted;
        btnMute.innerHTML = audio.muted ? ICONS.muted : ICONS.sound;
        btnMute.setAttribute('aria-pressed', String(audio.muted));
      }
      const full = inFullscreen();
      if (lastFull !== full) {
        lastFull = full;
        btnFull.innerHTML = full ? ICONS.exit : ICONS.full;
        window.dispatchEvent(new Event('resize'));
      }
    },
  };
}
