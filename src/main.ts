import { AudioManager } from './audio/audio';
import { startLoop } from './engine/loop';
import { fitCanvas } from './engine/screen';
import { SCREEN_H, SCREEN_W, TICK_RATE } from './game/constants';
import { Game } from './game/game';
import { Input } from './input/input';
import { setupControls } from './ui/controls';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: false })!;

/** Visión borrosa: se redibuja la imagen en franjas horizontales desplazadas con una onda. */
let scratch: HTMLCanvasElement | null = null;
function applyWobble(amount: number, now: number): void {
  if (!scratch) scratch = document.createElement('canvas');
  if (scratch.width !== canvas.width || scratch.height !== canvas.height) {
    scratch.width = canvas.width;
    scratch.height = canvas.height;
  }
  const sctx = scratch.getContext('2d')!;
  sctx.drawImage(canvas, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const k = canvas.width / SCREEN_W;
  const strip = Math.max(2, Math.round(k * 1.5));
  const t = now / 1000;
  for (let y = 0; y < canvas.height; y += strip) {
    const dx = Math.sin(y / (k * 11) + t * 4.2) * amount * k * 3.2 + Math.sin(y / (k * 4.5) - t * 2.6) * amount * k * 1.2;
    ctx.drawImage(scratch, 0, y, canvas.width, strip, dx, y, canvas.width, strip);
  }
}

const input = new Input(document.body);
const audio = new AudioManager();
const controls = setupControls(input, audio);
fitCanvas(canvas, document.getElementById('stage')!, SCREEN_W, SCREEN_H);
const game = new Game(input, audio);

// Los navegadores solo permiten sonido tras un gesto del usuario (fase de captura: antes que los botones).
for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, () => audio.unlock(), true);

// Mantiene la pantalla encendida mientras se juega.
let wakeLock: WakeLockSentinel | null = null;
const keepAwake = async () => {
  try {
    if (!wakeLock || wakeLock.released) wakeLock = (await navigator.wakeLock?.request('screen')) ?? null;
  } catch {
    /* no disponible o denegado */
  }
};
window.addEventListener('pointerdown', () => void keepAwake(), { capture: true });
window.addEventListener('keydown', () => void keepAwake(), { capture: true });

// Al salir de la pestaña o app, el juego se pausa solo.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.pauseIfPlaying();
  else void keepAwake();
});
window.addEventListener('blur', () => game.pauseIfPlaying());

startLoop(
  TICK_RATE,
  () => game.update(),
  () => {
    // El juego dibuja en coordenadas lógicas (224×288); aquí se escala a la resolución real.
    const k = canvas.width / SCREEN_W;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    game.render(ctx);
    if (game.wobbleAmount > 0.01) applyWobble(game.wobbleAmount, performance.now());
    controls.update(game.helperState());
  },
);

// PWA: instalable y jugable sin conexión (solo en producción).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* sin service worker el juego funciona igual, solo que no offline */
    });
  });
}
