import { AudioManager } from './audio/audio';
import { startLoop } from './engine/loop';
import { fitCanvas } from './engine/screen';
import { SCREEN_H, SCREEN_W, TICK_RATE } from './game/constants';
import { Game } from './game/game';
import { Input } from './input/input';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: false })!;

fitCanvas(canvas, SCREEN_W, SCREEN_H);
const audio = new AudioManager();
// Los navegadores solo permiten sonido tras un gesto del usuario.
for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, () => audio.unlock());
const game = new Game(new Input(document.body), audio);

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
  },
);
