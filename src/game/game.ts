import type { AudioManager } from '../audio/audio';
import { levelPosition } from '../data/worlds';
import { drawText, drawTextCentered, drawTextRight } from '../engine/font';
import type { Input } from '../input/input';
import { ORIGINAL_MAZE, ORIGINAL_PAC_SPAWN } from '../data/mazes/original';
import { HOUSE_DOOR_TILE, SCATTER_TARGETS, chaseTarget, type GhostName, type Tile } from './actors/ai';
import { Ghost, type MoveEnv } from './actors/ghost';
import { PacMan } from './actors/pacman';
import { BASE_SPEED, COLORS, MAZE_TOP, SCREEN_H, SCREEN_W, TICK_RATE, TILE } from './constants';
import { Maze } from './maze/maze';
import { renderWalls } from './maze/render';
import { createRng, type Rng } from './random';
import { FRUIT_POINTS, GHOST_POINTS, GLOBAL_RELEASE, fruitForLevel, getLevelRules, type LevelRules } from './rules';
import { drawFruit, drawGhost, drawPac, drawPacDeath, type GhostLook } from './sprites';

type State = 'title' | 'ready' | 'play' | 'ghostEaten' | 'dying' | 'clear' | 'gameover' | 'paused';

const READY_TICKS = 2 * TICK_RATE;
const CLEAR_TICKS = 2 * TICK_RATE;
const GHOST_EATEN_TICKS = TICK_RATE;
const DEATH_FREEZE = 45;
const DEATH_FRAME_TICKS = 8;
const DEATH_FRAMES = 11;
const GAMEOVER_TICKS = 3 * TICK_RATE;
const FLASH_PERIOD = 14;
const HOUSE_SPEED = 0.5;
const EATEN_SPEED = (BASE_SPEED * 1.6) / TICK_RATE;
const HIGH_KEY = 'pacman.highscore';
const FRUIT_TILE = { col: 13, row: 17 };
const FRUIT_X = 112;
const FRUIT_Y = 17 * TILE + 4;
const FRUIT_SPAWN_AT = [70, 170];
const FRUIT_TICKS = 9 * TICK_RATE + 30;
/** Fila de pantalla (con el HUD) donde el arcade escribe READY!, justo bajo la casa de fantasmas. */
const MESSAGE_Y = 20 * TILE + 1;

const GHOST_NAMES: GhostName[] = ['blinky', 'pinky', 'inky', 'clyde'];
const HOUSE_ORDER: Exclude<GhostName, 'blinky'>[] = ['pinky', 'inky', 'clyde'];

interface Popup {
  x: number;
  y: number;
  text: string;
  ticks: number;
}

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
  private ghosts = GHOST_NAMES.map((n) => new Ghost(n));
  private wallsBlue = renderWalls(this.maze, COLORS.wall);
  private wallsWhite = renderWalls(this.maze, COLORS.wallFlash);
  private rng: Rng = createRng(Date.now());

  private state: State = 'title';
  private resumeState: State = 'play';
  private timer = 0;
  private frame = 0;
  /** Ticks que Pac-Man se queda quieto tras comer (1 por punto, 3 por energizer). */
  private eatPause = 0;

  private score = 0;
  private high = readHighScore();
  /** Vidas extra restantes (las que se muestran abajo). */
  private lives = 2;
  private level = 1;
  private rules: LevelRules = getLevelRules(1);
  /** La primera partida espera a que acabe la melodía de inicio. */
  private introJingle = false;

  // Modos de los fantasmas
  private modeIndex = 0;
  private modeTimer = 0;
  private frightTicks = 0;
  private frightCombo = 0;
  private elroyEnabled = true;

  // Salida de la casa
  private personal: Record<string, number> = { pinky: 0, inky: 0, clyde: 0 };
  private globalMode = false;
  private globalCounter = 0;
  private idleTicks = 0;

  private fruitTicks = 0;
  private popups: Popup[] = [];
  private eatenGhost: Ghost | null = null;

  constructor(
    private readonly input: Input,
    private readonly audio: AudioManager,
  ) {
    // ?autostart salta la pantalla de título (útil para pruebas E2E y capturas).
    if (new URLSearchParams(location.search).has('autostart')) this.startGame();
  }

  // ───────────────────────── Ciclo de vida ─────────────────────────

  update(): void {
    this.frame++;
    this.input.poll();
    const pressed = this.input.consumePress();
    if (this.input.consumeMute()) this.audio.toggleMute();
    // Se consume siempre: una pausa pedida en pantalla de título no debe quedar pendiente.
    const pauseRequested = this.input.consumePause();

    switch (this.state) {
      case 'title':
        this.audio.setAmbient(null);
        if (pressed) this.startGame();
        break;
      case 'ready':
        if (--this.timer <= 0) this.state = 'play';
        break;
      case 'play':
        if (pauseRequested) {
          this.pause();
          break;
        }
        this.updatePlay();
        break;
      case 'ghostEaten':
        this.audio.setAmbient(null);
        this.updateGhostEaten();
        break;
      case 'dying':
        this.updateDying();
        break;
      case 'clear':
        if (--this.timer <= 0) this.nextLevel();
        break;
      case 'gameover':
        if (--this.timer <= 0) this.state = 'title';
        break;
      case 'paused':
        if (pauseRequested) {
          this.state = this.resumeState;
          this.audio.resume();
        }
        break;
    }
  }

  /** Pausa automática al perder el foco (no hace nada si no se está jugando). */
  pauseIfPlaying(): void {
    if (this.state === 'play') this.pause();
  }

  private pause(): void {
    this.resumeState = 'play';
    this.state = 'paused';
    this.audio.suspend();
  }

  private startGame(): void {
    this.score = 0;
    this.lives = 2;
    this.level = 1;
    this.introJingle = true;
    this.startLevel();
  }

  private startLevel(): void {
    this.rules = getLevelRules(this.level);
    this.maze.resetPellets();
    this.personal = { pinky: 0, inky: 0, clyde: 0 };
    this.globalMode = false;
    this.globalCounter = 0;
    this.elroyEnabled = true;
    this.beginReady();
  }

  /** Coloca a todos en su sitio de salida (nivel nuevo o tras perder una vida). */
  private beginReady(): void {
    this.pac.reset();
    for (const g of this.ghosts) g.reset();
    this.input.direction = null;
    this.eatPause = 0;
    this.modeIndex = 0;
    this.modeTimer = this.rules.schedule[0];
    this.frightTicks = 0;
    this.idleTicks = 0;
    this.fruitTicks = 0;
    this.popups = [];
    this.eatenGhost = null;
    this.initBlinky();
    this.audio.setAmbient(null);
    this.state = 'ready';
    this.timer = READY_TICKS;
    if (this.introJingle) {
      this.introJingle = false;
      this.audio.play('start');
      // Si la melodía ya cargó, READY! dura lo que ella (≈4 s en el arcade).
      this.timer = Math.max(READY_TICKS, Math.round(this.audio.duration('start') * TICK_RATE));
    }
  }

  private nextLevel(): void {
    this.level++;
    this.startLevel();
  }

  // ───────────────────────── Lógica de juego ─────────────────────────

  private ghost(name: GhostName): Ghost {
    return this.ghosts.find((g) => g.name === name)!;
  }

  private envFor(g: Ghost): MoveEnv {
    return { maze: this.maze, target: this.targetFor(g), rng: this.rng, houseSpeed: HOUSE_SPEED };
  }

  private initBlinky(): void {
    const b = this.ghost('blinky');
    b.initNav(this.envFor(b));
  }

  private isScatter(): boolean {
    return this.modeIndex % 2 === 0;
  }

  private targetFor(g: Ghost): Tile {
    if (g.state === 'eaten') return HOUSE_DOOR_TILE;
    if (this.isScatter() && !(g.name === 'blinky' && g.elroy > 0)) return SCATTER_TARGETS[g.name];
    const blinky = this.ghost('blinky');
    return chaseTarget(
      g.name,
      { col: g.col, row: g.row },
      { col: this.pac.col, row: this.pac.row, dir: this.pac.dir },
      { col: blinky.col, row: blinky.row },
    );
  }

  private ghostSpeed(g: Ghost): number {
    if (g.state === 'eaten' || g.state === 'entering') return EATEN_SPEED;
    const r = this.rules;
    const inTunnel = g.row === 14 && (g.col <= 5 || g.col >= 22);
    let pct = r.ghostSpeed;
    if (inTunnel) pct = r.ghostTunnelSpeed;
    else if (g.frightened) pct = r.ghostFrightSpeed;
    else if (g.elroy === 2) pct = r.elroy2Speed;
    else if (g.elroy === 1) pct = r.elroy1Speed;
    return (BASE_SPEED * pct) / TICK_RATE;
  }

  private pacSpeed(): number {
    const pct = this.frightTicks > 0 ? this.rules.pacFrightSpeed : this.rules.pacSpeed;
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

    this.updateModes();
    this.updateHouse();
    this.updateElroy();
    for (const g of this.ghosts) g.move(this.envFor(g), this.ghostSpeed(g));
    this.updateFruit();
    this.updatePopups();
    this.updateAmbient();

    if (this.checkCollisions()) return;
    if (this.maze.pelletsLeft === 0) {
      this.audio.setAmbient(null);
      this.state = 'clear';
      this.timer = CLEAR_TICKS;
    }
  }

  /** Sonido de fondo con la misma prioridad que el arcade: ojos > asustados > sirena. */
  private updateAmbient(): void {
    if (this.ghosts.some((g) => g.state === 'eaten' || g.state === 'entering')) {
      this.audio.setAmbient('eyes');
    } else if (this.frightTicks > 0) {
      this.audio.setAmbient('power');
    } else {
      const left = this.maze.pelletsLeft;
      const stage = left > 150 ? 0 : left > 100 ? 1 : left > 50 ? 2 : left > 20 ? 3 : 4;
      this.audio.setAmbient('siren', stage);
    }
  }

  private updateModes(): void {
    if (this.frightTicks > 0) {
      if (--this.frightTicks === 0) for (const g of this.ghosts) g.frightened = false;
      return;
    }
    if (--this.modeTimer > 0) return;
    this.modeIndex = Math.min(this.modeIndex + 1, this.rules.schedule.length - 1);
    this.modeTimer = this.rules.schedule[this.modeIndex];
    for (const g of this.ghosts) g.requestReverse();
  }

  private updateElroy(): void {
    const blinky = this.ghost('blinky');
    if (!this.elroyEnabled && this.ghost('clyde').state === 'active') this.elroyEnabled = true;
    const left = this.maze.pelletsLeft;
    blinky.elroy = !this.elroyEnabled ? 0 : left <= this.rules.elroy2Dots ? 2 : left <= this.rules.elroy1Dots ? 1 : 0;
  }

  // ───────────────────────── Comer ─────────────────────────

  private eat(): void {
    const kind = this.maze.eatPellet(this.pac.col, this.pac.row);
    if (!kind) return;
    this.audio.waka();
    this.addScore(kind === 'dot' ? 10 : 50);
    this.eatPause = kind === 'dot' ? 1 : 3;
    this.idleTicks = 0;
    this.releaseOnDot();
    if (kind === 'energizer') this.startFright();
    const eaten = this.maze.totalPellets - this.maze.pelletsLeft;
    if (FRUIT_SPAWN_AT.includes(eaten)) this.fruitTicks = FRUIT_TICKS;
  }

  private startFright(): void {
    this.frightCombo = 0;
    this.frightTicks = this.rules.frightTicks;
    for (const g of this.ghosts) {
      if (g.state === 'eaten' || g.state === 'entering') continue;
      if (this.frightTicks > 0) g.frightened = true;
      g.requestReverse();
    }
  }

  private updateFruit(): void {
    if (this.fruitTicks <= 0) return;
    this.fruitTicks--;
    if (this.pac.col === FRUIT_TILE.col || this.pac.col === FRUIT_TILE.col + 1) {
      if (this.pac.row === FRUIT_TILE.row && Math.abs(this.pac.x - FRUIT_X) < 6) {
        const points = FRUIT_POINTS[fruitForLevel(this.level)];
        this.addScore(points);
        this.audio.play('eat_fruit');
        this.popups.push({ x: FRUIT_X, y: FRUIT_Y, text: String(points), ticks: 2 * TICK_RATE });
        this.fruitTicks = 0;
      }
    }
  }

  private updatePopups(): void {
    for (const p of this.popups) p.ticks--;
    this.popups = this.popups.filter((p) => p.ticks > 0);
  }

  private addScore(points: number): void {
    const before = this.score;
    this.score += points;
    if (before < 10000 && this.score >= 10000) {
      this.lives++;
      this.audio.play('extra_life');
    }
    if (this.score > this.high) {
      this.high = this.score;
      try {
        localStorage.setItem(HIGH_KEY, String(this.high));
      } catch {
        /* sin almacenamiento: se ignora */
      }
    }
  }

  // ───────────────────────── Casa de fantasmas ─────────────────────────

  private releaseGhost(g: Ghost): void {
    g.state = 'leaving';
  }

  private nextInHouse(): Ghost | undefined {
    for (const name of HOUSE_ORDER) {
      const g = this.ghost(name);
      if (g.state === 'house') return g;
    }
    return undefined;
  }

  private releaseOnDot(): void {
    const g = this.nextInHouse();
    if (!g) return;
    if (this.globalMode) {
      this.globalCounter++;
      for (const name of HOUSE_ORDER) {
        const gh = this.ghost(name);
        if (gh.state === 'house' && this.globalCounter === GLOBAL_RELEASE[name]) {
          this.releaseGhost(gh);
          // Clyde sale: se vuelve a los contadores personales.
          if (name === 'clyde') this.globalMode = false;
          break;
        }
      }
    } else {
      this.personal[g.name]++;
    }
  }

  private updateHouse(): void {
    const g = this.nextInHouse();
    if (!g) return;
    this.idleTicks++;
    if (!this.globalMode && this.personal[g.name] >= this.rules.houseLimits[g.name as 'pinky' | 'inky' | 'clyde']) {
      this.releaseGhost(g);
      return;
    }
    if (this.idleTicks >= this.rules.idleReleaseTicks) {
      this.releaseGhost(g);
      this.idleTicks = 0;
    }
  }

  // ───────────────────────── Colisiones, muerte ─────────────────────────

  /** Devuelve true si la colisión cambió el estado de la partida. */
  private checkCollisions(): boolean {
    for (const g of this.ghosts) {
      if (g.state !== 'active' && g.state !== 'leaving') continue;
      if (g.col !== this.pac.col || g.row !== this.pac.row) continue;
      if (g.frightened) {
        this.eatGhost(g);
        return true;
      }
      this.audio.setAmbient(null);
      this.state = 'dying';
      this.timer = 0;
      return true;
    }
    return false;
  }

  private eatGhost(g: Ghost): void {
    const points = GHOST_POINTS[Math.min(this.frightCombo, 3)];
    this.frightCombo++;
    this.addScore(points);
    this.audio.play('eat_ghost');
    g.state = 'eaten';
    g.frightened = false;
    this.eatenGhost = g;
    this.popups.push({ x: g.x, y: g.y, text: String(points), ticks: GHOST_EATEN_TICKS });
    this.state = 'ghostEaten';
    this.timer = GHOST_EATEN_TICKS;
  }

  private updateGhostEaten(): void {
    // Todo se congela salvo los ojos del fantasma comido, que ya van hacia la casa al reanudar.
    if (--this.timer <= 0) {
      this.eatenGhost = null;
      this.state = 'play';
    }
  }

  private updateDying(): void {
    this.timer++;
    if (this.timer === DEATH_FREEZE) this.audio.play('death');
    const total = DEATH_FREEZE + DEATH_FRAMES * DEATH_FRAME_TICKS + 30;
    if (this.timer < total) return;
    if (this.lives <= 0) {
      this.state = 'gameover';
      this.timer = GAMEOVER_TICKS;
      return;
    }
    this.lives--;
    this.globalMode = true;
    this.globalCounter = 0;
    this.elroyEnabled = false;
    this.beginReady();
  }

  // ───────────────────────── Dibujo ─────────────────────────

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    this.drawHud(ctx);

    if (this.state === 'title') {
      this.drawTitle(ctx);
      return;
    }

    const flashWhite = this.state === 'clear' && Math.floor(this.timer / 15) % 2 === 0;
    ctx.drawImage(flashWhite ? this.wallsWhite : this.wallsBlue, 0, MAZE_TOP, this.maze.cols * TILE, this.maze.rows * TILE);
    if (this.state !== 'clear') this.drawPellets(ctx);
    if (this.fruitTicks > 0 && this.state !== 'clear') drawFruit(ctx, fruitForLevel(this.level), FRUIT_X, MAZE_TOP + FRUIT_Y);

    const hideGhosts = this.state === 'clear' || (this.state === 'dying' && this.timer >= DEATH_FREEZE);
    if (!hideGhosts) this.drawGhosts(ctx);
    this.drawPac(ctx);
    this.drawPopups(ctx);

    if (this.state === 'ready') drawTextCentered(ctx, 'READY!', SCREEN_W / 2, MESSAGE_Y, COLORS.ready);
    if (this.state === 'paused') drawTextCentered(ctx, 'PAUSE', SCREEN_W / 2, MESSAGE_Y, COLORS.ready);
    if (this.state === 'gameover') drawTextCentered(ctx, 'GAME  OVER', SCREEN_W / 2, MESSAGE_Y, '#ff2a2a');
    this.drawFooter(ctx);
  }

  private ghostLook(g: Ghost): GhostLook {
    if (g.state === 'eaten' || g.state === 'entering') return 'eyes';
    if (!g.frightened) return 'normal';
    const flashing = this.frightTicks <= this.rules.flashes * FLASH_PERIOD * 2 && Math.floor(this.frightTicks / FLASH_PERIOD) % 2 === 0;
    return flashing ? 'flash' : 'frightened';
  }

  private drawGhosts(ctx: CanvasRenderingContext2D): void {
    for (const g of this.ghosts) {
      if (this.state === 'ghostEaten' && g === this.eatenGhost) continue;
      drawGhost(ctx, g.x, MAZE_TOP + g.y, g.name, g.dir, g.anim, this.ghostLook(g));
    }
  }

  private drawPac(ctx: CanvasRenderingContext2D): void {
    if (this.state === 'ghostEaten') return;
    const y = MAZE_TOP + this.pac.y;
    if (this.state === 'dying' && this.timer >= DEATH_FREEZE) {
      const progress = (this.timer - DEATH_FREEZE) / (DEATH_FRAMES * DEATH_FRAME_TICKS);
      if (progress < 1) drawPacDeath(ctx, this.pac.x, y, progress);
      return;
    }
    const anim = this.pac.moving && this.state === 'play' ? this.pac.anim : 0;
    drawPac(ctx, this.pac.x, y, this.pac.dir, anim);
  }

  private drawPopups(ctx: CanvasRenderingContext2D): void {
    for (const p of this.popups) {
      const w = p.text.length * 8;
      drawText(ctx, p.text, Math.round(p.x - w / 2), Math.round(MAZE_TOP + p.y - 4), '#27e8ff');
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D): void {
    const blink = Math.floor(this.frame / 30) % 2 === 0;
    if (this.state === 'title' || blink) drawText(ctx, '1UP', 3 * TILE, 0, COLORS.text);
    drawText(ctx, 'HIGH SCORE', 9 * TILE, 0, COLORS.text);
    drawTextRight(ctx, this.state === 'title' ? '00' : String(this.score).padStart(2, '0'), 7 * TILE, TILE, COLORS.text);
    drawTextRight(ctx, String(this.high).padStart(2, '0'), 17 * TILE, TILE, COLORS.text);

    if (this.state !== 'title') {
      const pos = levelPosition(this.level);
      drawTextRight(ctx, `MUNDO ${pos.world}`, SCREEN_W - 4, 0, '#7fa0ff');
      drawTextRight(ctx, `NIVEL ${pos.stage}`, SCREEN_W - 4, TILE, COLORS.text);
    }
  }

  private drawTitle(ctx: CanvasRenderingContext2D): void {
    drawTextCentered(ctx, 'PAC-MAN', SCREEN_W / 2, 10 * TILE, COLORS.ready);
    if (Math.floor(this.frame / 30) % 2 === 0) {
      drawTextCentered(ctx, 'PUSH START', SCREEN_W / 2, 18 * TILE, COLORS.text);
    }
    drawTextCentered(ctx, 'TAP  KEY  BUTTON', SCREEN_W / 2, 21 * TILE, COLORS.dot);
    drawTextCentered(ctx, this.audio.muted ? 'SOUND OFF  M' : 'SOUND ON  M', SCREEN_W / 2, 31 * TILE, '#7fa0ff');
  }

  private drawPellets(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = COLORS.dot;
    ctx.beginPath();
    const energizers: { x: number; y: number }[] = [];
    for (const p of this.maze.pelletTiles()) {
      const x = p.c * TILE + TILE / 2;
      const y = MAZE_TOP + p.r * TILE + TILE / 2;
      if (p.kind === 'dot') {
        ctx.moveTo(x + 1.2, y);
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
      } else {
        energizers.push({ x, y });
      }
    }
    ctx.fill();

    // Los energizers laten y brillan.
    const pulse = 3.5 + 0.5 * Math.sin(this.frame / 5);
    const blinkOn = Math.floor(this.frame / 10) % 2 === 0 || this.state !== 'play';
    if (!blinkOn) return;
    ctx.save();
    ctx.shadowColor = '#ffb8ae';
    ctx.shadowBlur = ctx.getTransform().a * 3;
    for (const e of energizers) {
      const g = ctx.createRadialGradient(e.x - 1, e.y - 1, 0.4, e.x, e.y, pulse);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.5, '#ffd2c8');
      g.addColorStop(1, '#ff9a8a');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(e.x, e.y, pulse, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawFooter(ctx: CanvasRenderingContext2D): void {
    const y = MAZE_TOP + 31 * TILE + 9;
    for (let i = 0; i < Math.min(this.lives, 5); i++) drawPac(ctx, 24 + i * 16, y, 1, 2);
    // Últimas 7 frutas de los niveles jugados, la más reciente a la derecha.
    for (let k = 0; k < Math.min(this.level, 7); k++) {
      drawFruit(ctx, fruitForLevel(this.level - k), SCREEN_W - 16 - k * 16, y);
    }
  }
}
