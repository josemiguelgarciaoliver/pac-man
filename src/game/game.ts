import { drawText, drawTextCentered, drawTextRight } from '../engine/font';
import type { Input } from '../input/input';
import { ORIGINAL_MAZE, ORIGINAL_PAC_SPAWN } from '../data/mazes/original';
import { PacMan } from './actors/pacman';
import { BASE_SPEED, COLORS, MAZE_TOP, SCREEN_H, SCREEN_W, TICK_RATE, TILE } from './constants';
import { Maze } from './maze/maze';
import { renderWalls } from './maze/render';
import { SPRITE_SIZE, pacSprite } from './sprites';

type State = 'title' | 'ready' | 'play' | 'clear' | 'paused';

const READY_TICKS = 2 * TICK_RATE;
const CLEAR_TICKS = 2 * TICK_RATE;
const HIGH_KEY = 'pacman.highscore';

const readHighScore = (): number => {
  try {
    return Number(localStorage.getItem(HIGH_KEY)) || 0;
  } catch {
    return 0;
  }
};

export class Game {
  private maze = new Maze(ORIGINAL_MAZE, ORIGINAL_PAC_SPAWN);
  private pac = new PacMan(ORIGINAL_PAC_SPAWN.x, ORIGINAL_PAC_SPAWN.y);
  private wallsBlue = renderWalls(this.maze, COLORS.wall);
  private wallsWhite = renderWalls(this.maze, COLORS.wallFlash);

  private state: State = 'title';
  private resumeState: State = 'play';
  private timer = 0;
  private frame = 0;
  /** Ticks que Pac-Man se queda quieto tras comer (1 por punto, 3 por energizer). */
  private eatPause = 0;

  private score = 0;
  private high = readHighScore();
  private lives = 3;
  private level = 1;

  constructor(private readonly input: Input) {
    // ?autostart salta la pantalla de título (útil para pruebas E2E y capturas).
    if (new URLSearchParams(location.search).has('autostart')) this.startGame();
  }

  update(): void {
    this.frame++;
    this.input.poll();
    const pressed = this.input.consumePress();

    switch (this.state) {
      case 'title':
        if (pressed) this.startGame();
        break;
      case 'ready':
        if (--this.timer <= 0) this.state = 'play';
        break;
      case 'play':
        if (this.input.consumePause()) {
          this.resumeState = 'play';
          this.state = 'paused';
          break;
        }
        this.updatePlay();
        break;
      case 'clear':
        if (--this.timer <= 0) this.nextLevel();
        break;
      case 'paused':
        if (this.input.consumePause()) this.state = this.resumeState;
        break;
    }
  }

  private startGame(): void {
    this.score = 0;
    this.lives = 3;
    this.level = 1;
    this.maze.resetPellets();
    this.beginReady();
  }

  private beginReady(): void {
    this.pac.reset();
    this.input.direction = null;
    this.eatPause = 0;
    this.state = 'ready';
    this.timer = READY_TICKS;
  }

  private nextLevel(): void {
    this.level++;
    this.maze.resetPellets();
    this.beginReady();
  }

  /** Velocidad de Pac-Man en px/tick: 80 % en el nivel 1, 90 % del 2 al 4, 100 % después (tabla arcade). */
  private pacSpeed(): number {
    const pct = this.level === 1 ? 0.8 : this.level <= 4 ? 0.9 : 1;
    return (BASE_SPEED * pct) / TICK_RATE;
  }

  private updatePlay(): void {
    if (this.input.direction !== null) this.pac.want = this.input.direction;

    if (this.eatPause > 0) {
      this.eatPause--;
    } else {
      this.pac.move(this.maze, this.pacSpeed());
      this.eat();
    }

    if (this.maze.pelletsLeft === 0) {
      this.state = 'clear';
      this.timer = CLEAR_TICKS;
    }
  }

  private eat(): void {
    const kind = this.maze.eatPellet(this.pac.col, this.pac.row);
    if (!kind) return;
    this.addScore(kind === 'dot' ? 10 : 50);
    this.eatPause = kind === 'dot' ? 1 : 3;
  }

  private addScore(points: number): void {
    const before = this.score;
    this.score += points;
    if (before < 10000 && this.score >= 10000) this.lives++;
    if (this.score > this.high) {
      this.high = this.score;
      try {
        localStorage.setItem(HIGH_KEY, String(this.high));
      } catch {
        /* sin almacenamiento: se ignora */
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    this.drawHud(ctx);

    if (this.state === 'title') {
      this.drawTitle(ctx);
      return;
    }

    const flashWhite = this.state === 'clear' && Math.floor(this.timer / 15) % 2 === 0;
    ctx.drawImage(flashWhite ? this.wallsWhite : this.wallsBlue, 0, MAZE_TOP);
    if (this.state !== 'clear') this.drawPellets(ctx);
    this.drawPac(ctx);

    if (this.state === 'ready') drawTextCentered(ctx, 'READY!', SCREEN_W / 2, MAZE_TOP + 20 * TILE + 1, COLORS.ready);
    if (this.state === 'paused') drawTextCentered(ctx, 'PAUSE', SCREEN_W / 2, MAZE_TOP + 20 * TILE + 1, COLORS.ready);
    this.drawFooter(ctx);
  }

  private drawHud(ctx: CanvasRenderingContext2D): void {
    const blink = Math.floor(this.frame / 30) % 2 === 0;
    if (this.state === 'title' || blink) drawText(ctx, '1UP', 3 * TILE, 0, COLORS.text);
    drawText(ctx, 'HIGH SCORE', 9 * TILE, 0, COLORS.text);
    drawTextRight(ctx, this.state === 'title' ? '00' : String(this.score).padStart(2, '0'), 7 * TILE, TILE, COLORS.text);
    drawTextRight(ctx, String(this.high).padStart(2, '0'), 17 * TILE, TILE, COLORS.text);
  }

  private drawTitle(ctx: CanvasRenderingContext2D): void {
    drawTextCentered(ctx, 'PAC-MAN', SCREEN_W / 2, 10 * TILE, COLORS.ready);
    if (Math.floor(this.frame / 30) % 2 === 0) {
      drawTextCentered(ctx, 'PUSH START', SCREEN_W / 2, 18 * TILE, COLORS.text);
    }
    drawTextCentered(ctx, 'TAP  KEY  BUTTON', SCREEN_W / 2, 21 * TILE, COLORS.dot);
  }

  private drawPellets(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = COLORS.dot;
    const energizerOn = Math.floor(this.frame / 10) % 2 === 0;
    for (const p of this.maze.pelletTiles()) {
      const x = p.c * TILE;
      const y = MAZE_TOP + p.r * TILE;
      if (p.kind === 'dot') {
        ctx.fillRect(x + 3, y + 3, 2, 2);
      } else if (energizerOn) {
        ctx.fillRect(x + 2, y, 4, 8);
        ctx.fillRect(x, y + 2, 8, 4);
        ctx.fillRect(x + 1, y + 1, 6, 6);
      }
    }
  }

  private drawPac(ctx: CanvasRenderingContext2D): void {
    const sprite = pacSprite(this.pac.dir, this.pac.moving ? this.pac.anim : 0);
    ctx.drawImage(sprite, Math.round(this.pac.x - SPRITE_SIZE / 2), Math.round(MAZE_TOP + this.pac.y - SPRITE_SIZE / 2));
  }

  private drawFooter(ctx: CanvasRenderingContext2D): void {
    const y = MAZE_TOP + 31 * TILE + 1;
    const lives = this.state === 'ready' ? this.lives - 1 : this.lives;
    const icon = pacSprite(1, 2);
    for (let i = 0; i < Math.min(lives, 5); i++) ctx.drawImage(icon, 16 + i * 16, y);
    drawTextRight(ctx, `LV${this.level}`, SCREEN_W - 8, y + 4, COLORS.text);
  }
}
