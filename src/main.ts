import { startLoop } from './engine/loop';
import { fitCanvas } from './engine/screen';
import { SCREEN_H, SCREEN_W, TICK_RATE } from './game/constants';
import { Game } from './game/game';
import { Input } from './input/input';

const canvas = document.getElementById('game') as HTMLCanvasElement;
canvas.width = SCREEN_W;
canvas.height = SCREEN_H;
const ctx = canvas.getContext('2d', { alpha: false })!;
ctx.imageSmoothingEnabled = false;

fitCanvas(canvas);
const game = new Game(new Input(document.body));
startLoop(TICK_RATE, () => game.update(), () => game.render(ctx));
