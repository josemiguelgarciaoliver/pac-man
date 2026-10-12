import type { AudioManager } from '../audio/audio';
import { FAMILY, levelPhrase } from '../data/family';
import { ORIGINAL_PAC_SPAWN } from '../data/mazes/original';
import { TOTAL_LEVELS } from '../data/worlds';
import { CHAR_W, drawText, drawTextCentered, drawTextRight } from '../engine/font';
import type { Input } from '../input/input';
import { HOUSE_DOOR_TILE, SCATTER_TARGETS, chaseTarget, type GhostName, type Tile } from './actors/ai';
import { Ghost, type MoveEnv } from './actors/ghost';
import { PacMan } from './actors/pacman';
import { BASE_SPEED, COLORS, Dir, MAZE_TOP, SCREEN_H, SCREEN_W, TICK_RATE, TILE } from './constants';
import { CHECKPOINT_MIN_LIVES, clearCheckpoint, isCheckpointLevel, loadCheckpoint, saveCheckpoint, type Checkpoint } from './checkpoint';
import { FamilyHelpers } from './familyHelpers';
import { arcadeEquivalent } from './level/curve';
import { buildLevel } from './level/levels';
import { nearestTile } from './level/placement';
import type { LevelDef } from './level/schema';
import { Maze } from './maze/maze';
import { renderWalls } from './maze/render';
import { createMechanics, type Mechanic } from './mechanics';
import { Mission } from './missions';
import { createRng, type Rng } from './random';
import { DIFFICULTIES, DIFFICULTY_PRESETS, FRUIT_POINTS, GHOST_POINTS, GLOBAL_RELEASE, fruitForLevel, getLevelRules, type Difficulty, type LevelRules } from './rules';
import { drawFruit, drawGhost, drawPac, drawPacDeath, type GhostLook } from './sprites';

type State = 'title' | 'ready' | 'play' | 'ghostEaten' | 'dying' | 'clear' | 'gameover' | 'victory' | 'paused';

const READY_TICKS = 2 * TICK_RATE;
/** La tarjeta de nivel se ve antes del "READY!" final. */
const CARD_TICKS = 150;
const CLEAR_TICKS = 2 * TICK_RATE;
const GHOST_EATEN_TICKS = TICK_RATE;
const DEATH_FREEZE = 45;
const DEATH_FRAME_TICKS = 8;
const DEATH_FRAMES = 11;
const GAMEOVER_TICKS = 3 * TICK_RATE;
const VICTORY_TICKS = 10 * TICK_RATE;
const FLASH_PERIOD = 14;
const HOUSE_SPEED = 0.5;
const EATEN_SPEED = (BASE_SPEED * 1.6) / TICK_RATE;
const HIGH_KEY = 'pacman.highscore';
const DIFFICULTY_KEY = 'pacman.difficulty';
const FRUIT_TILE = { col: 13, row: 17 };
const FRUIT_X = 112;
const FRUIT_Y = 17 * TILE + 4;
const FRUIT_SPAWN_AT = [70, 170];
const FRUIT_TICKS = 9 * TICK_RATE + 30;
/** Fila de pantalla (con el HUD) donde el arcade escribe READY!, justo bajo la casa de fantasmas. */
const MESSAGE_Y = 20 * TILE + 1;
const MAX_FRUITS_SHOWN = 4;
const MAX_LIVES_SHOWN = 4;

const GHOST_NAMES: GhostName[] = ['blinky', 'pinky', 'inky', 'clyde'];
const HOUSE_ORDER: Exclude<GhostName, 'blinky'>[] = ['pinky', 'inky', 'clyde'];

interface Popup {
  x: number;
  y: number;
  text: string;
  ticks: number;
}

const readDifficulty = (): Difficulty => {
  try {
    const v = localStorage.getItem(DIFFICULTY_KEY);
    if (v === 'easy' || v === 'normal' || v === 'arcade') return v;
  } catch {
    /* sin almacenamiento */
  }
  return 'easy';
};

const readHighScore = (): number => {
  try {
    return Number(localStorage.getItem(HIGH_KEY)) || 0;
  } catch {
    return 0;
  }
};

export class Game {
  private levelDef!: LevelDef;
  private maze!: Maze;
  private walls!: HTMLCanvasElement;
  private wallsWhite: HTMLCanvasElement | null = null;
  private mission!: Mission;
  private mechanics: Mechanic[] = [];
  private helpers = new FamilyHelpers();
  private pac = new PacMan(ORIGINAL_PAC_SPAWN.x, ORIGINAL_PAC_SPAWN.y);
  private ghosts = GHOST_NAMES.map((n) => new Ghost(n));
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
  private difficulty: Difficulty = readDifficulty();
  private rules!: LevelRules;
  /** La primera partida espera a que acabe la melodía de inicio. */
  private introJingle = false;
  /** Tarjeta de inicio de nivel visible durante el "ready". */
  private cardActive = false;
  private timeUp = false;
  /** Último checkpoint guardado (se carga al abrir el juego). */
  private checkpoint: Checkpoint | null = loadCheckpoint();
  /** Opción elegida en el título: 0 = nueva partida, 1 = continuar. */
  private titleChoice = this.checkpoint ? 1 : 0;
  /** El nivel que se acaba de completar guardó un checkpoint (para avisar en pantalla). */
  private checkpointJustSaved = false;

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
    this.loadLevel(1);
    const params = new URLSearchParams(location.search);
    // ?autostart salta la pantalla de título; ?level=N empieza en ese nivel (pruebas y capturas).
    if (params.has('autostart')) this.startGame(Number(params.get('level')) || 1);
  }

  // ───────────────────────── Ciclo de vida ─────────────────────────

  update(): void {
    this.frame++;
    this.input.poll();
    const pressed = this.input.consumePress();
    if (this.input.consumeMute()) this.audio.toggleMute();
    // Se consumen siempre: una petición hecha fuera de partida no debe quedar pendiente.
    const pauseRequested = this.input.consumePause();
    const ainaRequested = this.input.consumeAina();
    const aleixRequested = this.input.consumeAleix();

    switch (this.state) {
      case 'title':
        this.audio.setAmbient(null);
        this.updateTitle(pressed);
        break;
      case 'ready':
        if (--this.timer <= 0) this.state = 'play';
        break;
      case 'play':
        if (pauseRequested) {
          this.pause();
          break;
        }
        if (ainaRequested) this.useAina();
        if (aleixRequested) this.useAleix();
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
        if (--this.timer <= 0) {
          this.titleChoice = this.checkpoint ? 1 : 0;
          this.state = 'title';
        }
        break;
      case 'victory':
        if (--this.timer <= 0 || (pressed && this.timer < VICTORY_TICKS - 120)) this.state = 'title';
        break;
      case 'paused':
        if (pauseRequested) {
          this.state = this.resumeState;
          this.audio.resume();
        }
        break;
    }
  }

  /** Estado de las habilidades de los hijos (para los botones en pantalla). */
  helperState(): { aina: boolean; aleix: boolean } {
    return { aina: this.helpers.ainaReady, aleix: this.helpers.aleixReady };
  }

  /** Título: arriba/abajo eligen nueva partida o continuar; izquierda/derecha cambian la dificultad. */
  private updateTitle(pressed: boolean): void {
    const dir = this.input.direction;
    if (this.checkpoint && (dir === Dir.Up || dir === Dir.Down)) {
      this.titleChoice = this.titleChoice === 0 ? 1 : 0;
      this.input.direction = null;
      return;
    }
    if (dir === Dir.Left || dir === Dir.Right) {
      const i = DIFFICULTIES.indexOf(this.difficulty);
      const n = DIFFICULTIES.length;
      this.difficulty = DIFFICULTIES[(i + (dir === Dir.Right ? 1 : n - 1)) % n];
      this.input.direction = null;
      try {
        localStorage.setItem(DIFFICULTY_KEY, this.difficulty);
      } catch {
        /* sin almacenamiento */
      }
      return;
    }
    if (dir !== null) this.input.direction = null;
    if (pressed && dir === null) {
      if (this.checkpoint && this.titleChoice === 1) this.continueGame(this.checkpoint);
      else this.startGame(1);
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

  private startGame(level: number): void {
    this.score = 0;
    this.lives = DIFFICULTY_PRESETS[this.difficulty].lives;
    this.level = Math.min(Math.max(Math.floor(level), 1), TOTAL_LEVELS);
    this.introJingle = true;
    this.startLevel();
  }

  /** Reanuda desde el último checkpoint: mismo nivel, puntuación y dificultad. */
  private continueGame(cp: Checkpoint): void {
    this.score = cp.score;
    this.lives = Math.max(cp.lives, CHECKPOINT_MIN_LIVES);
    this.level = cp.level;
    this.difficulty = cp.difficulty;
    this.introJingle = true;
    this.startLevel();
  }

  /** Nivel superado: pasa a la pantalla de victoria del nivel y guarda checkpoint si toca. */
  private completeLevel(): void {
    this.audio.setAmbient(null);
    this.state = 'clear';
    this.timer = CLEAR_TICKS;
    this.checkpointJustSaved = false;
    const done = this.levelDef.level;
    if (isCheckpointLevel(done)) {
      this.checkpoint = { level: done + 1, score: this.score, lives: this.lives, difficulty: this.difficulty };
      saveCheckpoint(this.checkpoint);
      this.checkpointJustSaved = true;
      this.audio.play('extra_life');
    }
  }

  /** Carga laberinto, misión y mecánicas del nivel (el laberinto se reutiliza si no cambia). */
  private loadLevel(n: number): void {
    const def = buildLevel(n);
    if (!this.levelDef || this.levelDef.level !== def.level) {
      this.maze = new Maze(def.maze, ORIGINAL_PAC_SPAWN);
      this.walls = renderWalls(this.maze, def.wallColor);
      this.wallsWhite = null;
    }
    this.levelDef = def;
    this.rules = getLevelRules(def.arcadeLevel, this.difficulty);
    this.mission = new Mission(def.mission, def.maze, createRng(def.level * 7919));
    this.mechanics = createMechanics(def.mechanics, def.maze, createRng(def.level * 104729 + 1));
    this.helpers.reset();
  }

  private startLevel(): void {
    this.loadLevel(this.level);
    this.maze.resetPellets();
    this.personal = { pinky: 0, inky: 0, clyde: 0 };
    this.globalMode = false;
    this.globalCounter = 0;
    this.elroyEnabled = true;
    this.beginReady(true);
  }

  /** Coloca a todos en su sitio de salida (nivel nuevo o tras perder una vida). */
  private beginReady(newLevel = false): void {
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
    this.timeUp = false;
    this.initBlinky();
    this.audio.setAmbient(null);
    this.state = 'ready';
    this.cardActive = newLevel;
    this.timer = newLevel ? CARD_TICKS + READY_TICKS : READY_TICKS;
    if (this.introJingle) {
      this.introJingle = false;
      this.audio.play('start');
      // Si la melodía ya cargó, la espera dura lo que ella (≈4 s en el arcade).
      this.timer = Math.max(this.timer, Math.round(this.audio.duration('start') * TICK_RATE));
    }
  }

  private nextLevel(): void {
    if (this.level >= TOTAL_LEVELS) {
      this.state = 'victory';
      this.timer = VICTORY_TICKS;
      this.checkpoint = null;
      clearCheckpoint();
      this.audio.play('intermission');
      return;
    }
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
    const decoy = this.helpers.decoy;
    // El señuelo de Aleix obliga a los fantasmas a perseguirlo, también en dispersión.
    if (!decoy && this.isScatter() && !(g.name === 'blinky' && g.elroy > 0)) return SCATTER_TARGETS[g.name];
    const blinky = this.ghost('blinky');
    const quarry = decoy ? { col: decoy.col, row: decoy.row, dir: Dir.Left } : { col: this.pac.col, row: this.pac.row, dir: this.pac.dir };
    return chaseTarget(g.name, { col: g.col, row: g.row }, quarry, { col: blinky.col, row: blinky.row });
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

  /** Velocidad del fantasma más el efecto de cintas y similares (nunca menos de 0,1 px/tick). */
  private ghostSpeedWithMechanics(g: Ghost): number {
    let speed = this.ghostSpeed(g);
    for (const m of this.mechanics) speed += m.ghostSpeedDelta?.(g) ?? 0;
    return Math.max(0.1, speed);
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

    const env = { maze: this.maze, pac: this.pac, ghosts: this.ghosts };
    for (const m of this.mechanics) m.update(env);
    this.mission.update(this.pac);
    if (this.mission.consumeEnergizerRespawn()) this.maze.respawnEnergizers();

    this.updateModes();
    this.updateHouse();
    this.updateElroy();
    for (const g of this.ghosts) g.move(this.envFor(g), this.ghostSpeedWithMechanics(g));
    this.updateFruit();
    this.updatePopups();
    this.helpers.update();
    this.updateAmbient();

    if (this.checkCollisions()) return;
    if (this.mission.failed()) {
      this.timeUp = true;
      this.audio.setAmbient(null);
      this.state = 'dying';
      this.timer = 0;
      return;
    }
    if (this.mission.isComplete(this.pac, this.maze.pelletsLeft)) this.completeLevel();
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

  // ───────────────────────── Ayudantes de la familia ─────────────────────────

  /** A dónde debe apuntar la Pista de Aina según la misión. */
  private objectiveTarget(): Tile | null {
    const from = { col: this.pac.col, row: this.pac.row };
    const fromMission = this.mission.target(from);
    if (fromMission) return fromMission;
    const lines = this.levelDef.maze;
    if (this.mission.def.type === 'HUNT') {
      const scared = this.ghosts.find((g) => g.frightened && g.state === 'active');
      if (scared) return { col: Math.min(Math.max(scared.col, 0), 27), row: scared.row };
      return nearestTile(lines, from, (t) => this.maze.pelletAt(t.col, t.row) === 'energizer');
    }
    return nearestTile(lines, from, (t) => this.maze.pelletAt(t.col, t.row) !== undefined);
  }

  private useAina(): void {
    this.helpers.useAina(this.levelDef.maze, { col: this.pac.col, row: this.pac.row }, this.objectiveTarget());
  }

  private useAleix(): void {
    this.helpers.useAleix({ col: this.pac.col, row: this.pac.row });
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
        const points = FRUIT_POINTS[this.rules.fruit];
        this.addScore(points);
        this.audio.play('eat_fruit');
        this.helpers.rechargeAina();
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
    this.mission.onGhostEaten();
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
      // La misión puede completarse justo al comer al último fantasma.
      if (this.mission.isComplete(this.pac, this.maze.pelletsLeft)) this.completeLevel();
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
    if (this.timeUp) this.mission = new Mission(this.levelDef.mission, this.levelDef.maze, createRng(this.levelDef.level * 7919));
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
    if (this.state === 'victory') {
      this.drawVictory(ctx);
      return;
    }

    const flashWhite = this.state === 'clear' && Math.floor(this.timer / 15) % 2 === 0;
    if (flashWhite) this.wallsWhite ??= renderWalls(this.maze, '#ffffff');
    ctx.drawImage(flashWhite ? this.wallsWhite! : this.walls, 0, MAZE_TOP, this.maze.cols * TILE, this.maze.rows * TILE);
    if (this.state !== 'clear') {
      for (const m of this.mechanics) m.draw(ctx, this.frame);
      this.mission.draw(ctx, this.frame);
      this.drawPellets(ctx);
    }
    if (this.fruitTicks > 0 && this.state !== 'clear') drawFruit(ctx, this.rules.fruit, FRUIT_X, MAZE_TOP + FRUIT_Y);
    this.helpers.draw(ctx, this.frame);

    const hideGhosts = this.state === 'clear' || (this.state === 'dying' && this.timer >= DEATH_FREEZE);
    if (!hideGhosts) this.drawGhosts(ctx);
    this.drawPac(ctx);
    this.drawPopups(ctx);

    const cardVisible = this.state === 'ready' && this.cardActive && this.timer > READY_TICKS;
    if (this.state === 'ready' && !cardVisible) drawTextCentered(ctx, 'READY!', SCREEN_W / 2, MESSAGE_Y, COLORS.ready);
    if (this.state === 'paused') drawTextCentered(ctx, 'PAUSE', SCREEN_W / 2, MESSAGE_Y, COLORS.ready);
    if (this.state === 'gameover') drawTextCentered(ctx, 'GAME  OVER', SCREEN_W / 2, MESSAGE_Y, '#ff2a2a');
    if (this.state === 'clear' && this.checkpointJustSaved) this.drawCheckpointBanner(ctx);
    if (this.state === 'dying' && this.timeUp) drawTextCentered(ctx, 'TIME UP!', SCREEN_W / 2, MESSAGE_Y, '#ff2a2a');
    if (cardVisible) this.drawCard(ctx, Math.min(1, (this.timer - READY_TICKS) / 12));
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
      const w = p.text.length * CHAR_W;
      drawText(ctx, p.text, Math.round(p.x - w / 2), Math.round(MAZE_TOP + p.y - 4), '#27e8ff');
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D): void {
    const blink = Math.floor(this.frame / 30) % 2 === 0;
    if (this.state === 'title' || blink) drawText(ctx, '1UP', 3 * TILE, 0, COLORS.text);
    drawText(ctx, 'HIGH SCORE', 9 * TILE, 0, COLORS.text);
    drawTextRight(ctx, this.state === 'title' ? '00' : String(this.score).padStart(2, '0'), 7 * TILE, TILE, COLORS.text);
    drawTextRight(ctx, String(this.high).padStart(2, '0'), 17 * TILE, TILE, COLORS.text);

    if (this.state === 'title' || this.state === 'victory') return;
    drawTextRight(ctx, `MUNDO ${this.levelDef.world}`, SCREEN_W - 4, 0, this.levelDef.wallColor);
    drawTextRight(ctx, `NIVEL ${this.levelDef.stage}`, SCREEN_W - 4, TILE, COLORS.text);
    this.drawHelperBadge(ctx, 10, 20, 'A', FAMILY.aina.color, this.helpers.ainaReady);
    this.drawHelperBadge(ctx, 24, 20, 'L', FAMILY.aleix.color, this.helpers.aleixReady);
  }

  private drawHelperBadge(ctx: CanvasRenderingContext2D, x: number, y: number, letter: string, color: string, ready: boolean): void {
    ctx.save();
    if (ready) {
      ctx.shadowColor = color;
      ctx.shadowBlur = ctx.getTransform().a * 2;
    }
    ctx.fillStyle = ready ? color : '#3a3d55';
    ctx.beginPath();
    ctx.arc(x, y, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = ready ? '#10122a' : '#757a99';
    ctx.font = "800 5.6px 'Trebuchet MS', Arial, sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText(letter, x, y + 2);
    ctx.restore();
  }

  /** Tarjeta de inicio de nivel: mundo, nivel, misión y una frase de la familia. */
  private drawCard(ctx: CanvasRenderingContext2D, alpha: number): void {
    const def = this.levelDef;
    const [g1, g2] = this.mission.goalLines();
    const phrase = levelPhrase(def.level);
    const who = FAMILY[phrase.who];
    const x = 10;
    const y = 60;
    const w = SCREEN_W - 20;
    const h = 132;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = def.wallColor;
    ctx.shadowBlur = ctx.getTransform().a * 4;
    ctx.fillStyle = 'rgba(2,3,28,0.95)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 7);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = def.wallColor;
    ctx.lineWidth = 1.3;
    ctx.stroke();
    const cx = SCREEN_W / 2;
    drawTextCentered(ctx, `MUNDO ${def.world}`, cx, y + 9, def.wallColor);
    drawTextCentered(ctx, def.name.toUpperCase(), cx, y + 21, COLORS.text);
    drawTextCentered(ctx, `NIVEL ${def.stage}`, cx, y + 36, COLORS.ready);
    const special = def.mission.type !== 'CLEAR';
    drawTextCentered(ctx, g1, cx, y + 55, special ? '#ffee22' : '#cfd8ff');
    if (g2) drawTextCentered(ctx, g2, cx, y + 66, special ? '#ffee22' : '#cfd8ff');
    drawTextCentered(ctx, `${who.name}:`, cx, y + 88, who.color);
    drawTextCentered(ctx, phrase.lines[0], cx, y + 100, COLORS.text);
    drawTextCentered(ctx, phrase.lines[1], cx, y + 112, COLORS.text);
    ctx.restore();
  }

  /** Aviso de checkpoint guardado, con una bandera que ondea. */
  private drawCheckpointBanner(ctx: CanvasRenderingContext2D): void {
    const cx = SCREEN_W / 2;
    const y = MESSAGE_Y - 2;
    ctx.save();
    ctx.fillStyle = 'rgba(2,3,28,0.92)';
    ctx.beginPath();
    ctx.roundRect(cx - 62, y - 7, 124, 24, 6);
    ctx.fill();
    ctx.strokeStyle = '#27e8ff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    drawTextCentered(ctx, 'CHECKPOINT!', cx, y - 2, '#27e8ff');
    drawTextCentered(ctx, `PROXIMO NIVEL ${this.levelDef.level + 1}`, cx, y + 8, COLORS.text);
  }

  private drawTitle(ctx: CanvasRenderingContext2D): void {
    drawTextCentered(ctx, 'PAC-MAN', SCREEN_W / 2, 10 * TILE, COLORS.ready);
    drawTextCentered(ctx, '100 NIVELES  10 MUNDOS', SCREEN_W / 2, 12 * TILE, '#7fa0ff');
    drawTextCentered(ctx, 'CON CELY  AINA  Y ALEIX', SCREEN_W / 2, 14 * TILE, FAMILY.cely.color);
    const cp = this.checkpoint;
    const blink = Math.floor(this.frame / 30) % 2 === 0;
    if (cp) {
      const options = ['NUEVA PARTIDA', `CONTINUAR  NIVEL ${cp.level}`];
      options.forEach((text, i) => {
        const on = i === this.titleChoice;
        drawTextCentered(ctx, on ? `> ${text} <` : text, SCREEN_W / 2, (17 + i * 2) * TILE, on ? (blink ? COLORS.ready : COLORS.text) : '#7a80a8');
      });
      drawTextCentered(ctx, 'ARRIBA ABAJO ELIGE', SCREEN_W / 2, 21 * TILE, COLORS.dot);
    } else {
      if (blink) drawTextCentered(ctx, 'PUSH START', SCREEN_W / 2, 18 * TILE, COLORS.text);
      drawTextCentered(ctx, 'TAP  KEY  BUTTON', SCREEN_W / 2, 21 * TILE, COLORS.dot);
    }
    const continuing = !!cp && this.titleChoice === 1;
    const shown = continuing ? cp!.difficulty : this.difficulty;
    drawTextCentered(ctx, 'DIFICULTAD', SCREEN_W / 2, 24 * TILE, '#7fa0ff');
    drawTextCentered(ctx, continuing ? DIFFICULTY_PRESETS[shown].label : `< ${DIFFICULTY_PRESETS[shown].label} >`, SCREEN_W / 2, 26 * TILE, continuing ? '#7a80a8' : COLORS.ready);
    drawTextCentered(ctx, 'Z AINA  X ALEIX  P PAUSA', SCREEN_W / 2, 29 * TILE, '#ffb347');
    drawTextCentered(ctx, this.audio.muted ? 'SOUND OFF  M' : 'SOUND ON  M', SCREEN_W / 2, 31 * TILE, '#7fa0ff');
  }

  private drawVictory(ctx: CanvasRenderingContext2D): void {
    const cx = SCREEN_W / 2;
    const pulse = 0.7 + 0.3 * Math.sin(this.frame / 8);
    drawTextCentered(ctx, 'ENHORABUENA!', cx, 8 * TILE, COLORS.ready);
    drawTextCentered(ctx, 'CELY ESTA A SALVO', cx, 12 * TILE, FAMILY.cely.color);
    drawTextCentered(ctx, 'LA FAMILIA VUELVE A', cx, 15 * TILE, COLORS.text);
    drawTextCentered(ctx, 'ESTAR JUNTA', cx, 17 * TILE, COLORS.text);
    ctx.save();
    ctx.globalAlpha = pulse;
    drawTextCentered(ctx, 'AINA   ALEIX   CELY', cx, 21 * TILE, '#7fd7ff');
    ctx.restore();
    drawTextCentered(ctx, `PUNTOS ${this.score}`, cx, 25 * TILE, '#cfd8ff');
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
    for (let i = 0; i < Math.min(this.lives, MAX_LIVES_SHOWN); i++) drawPac(ctx, 24 + i * 16, y, 1, 2);
    const hud = this.mission.hud();
    if (hud) drawText(ctx, hud, 92, y - 4, '#ffee22');
    // Últimas frutas de los niveles jugados, la más reciente a la derecha.
    for (let k = 0; k < Math.min(this.level, MAX_FRUITS_SHOWN); k++) {
      drawFruit(ctx, fruitForLevel(arcadeEquivalent(this.level - k)), SCREEN_W - 16 - k * 16, y);
    }
  }
}
