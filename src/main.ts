import { AudioManager } from './audio/audio';
import { startLoop } from './engine/loop';
import { fitCanvas } from './engine/screen';
import { SCREEN_H, SCREEN_W, TICK_RATE } from './game/constants';
import { Game } from './game/game';
import { Input } from './input/input';
import { setupControls } from './ui/controls';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: false })!;

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
    controls.update();
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
