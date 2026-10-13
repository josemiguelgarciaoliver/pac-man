import type { AudioManager } from '../audio/audio';
import { ALBUM } from '../data/album';
import { FAMILY, levelPhrase } from '../data/family';
import { ORIGINAL_PAC_SPAWN } from '../data/mazes/original';
import { LEVELS_PER_WORLD, TOTAL_LEVELS, worldLabel } from '../data/worlds';
import { CHAR_W, drawText, drawTextCentered, drawTextRight } from '../engine/font';
import type { Input } from '../input/input';
import { HOUSE_DOOR_TILE, SCATTER_TARGETS, chaseTarget, type GhostName, type Tile } from './actors/ai';
import { Ghost, type MoveEnv } from './actors/ghost';
import { PacMan } from './actors/pacman';
import { BASE_SPEED, COLORS, DIRS, Dir, MAZE_TOP, SCREEN_H, SCREEN_W, TICK_RATE, TILE } from './constants';
import { CHECKPOINT_MIN_LIVES, clearCheckpoint, isCheckpointLevel, loadCheckpoint, saveCheckpoint, type Checkpoint } from './checkpoint';
import { CUTSCENE_SKIP_AFTER, CUTSCENE_TICKS, drawCutscene } from './cutscene';
import { FamilyHelpers } from './familyHelpers';
import { arcadeEquivalent } from './level/curve';
import { buildLevel } from './level/levels';
import type { LevelDef } from './level/schema';
import { Maze } from './maze/maze';
import { WallRenderer } from './maze/render';
import { createMechanics, pickupTiles, type Mechanic, type MechanicEnv } from './mechanics';
import { LetterCollection, LetterTokens, WORDS, drawLetterHud } from './letters';
import { drawParticles, renderBackground } from './theme/background';
import { drawEmblem } from './theme/emblems';
import { drawPelletShape } from './theme/pelletShapes';
import { themeOfWorld, type WorldTheme } from './theme/worldThemes';
import { Menus, drawStars, formatTime, type MenuHost } from './menus';
import { Mission } from './missions';
import { clearProgress, emptyProgress, loadProgress, loadSettings, parSeconds, recordLevel, saveProgress, saveSettings, type Progress, type RecordOutcome, type Settings } from './progress';
import { Projectiles } from './projectiles';
import { createRng, type Rng } from './random';
import { DIFFICULTY_PRESETS, FRUIT_POINTS, GHOST_POINTS, GLOBAL_RELEASE, fruitForLevel, getLevelRules, type Difficulty, type LevelRules } from './rules';
import { drawFruit, drawGhost, drawPac, drawPacDeath, drawPistol, type GhostLook } from './sprites';
import { EFFECT_INFO, NEGATIVE_EFFECTS, ViewEffects } from './viewEffects';

type State = 'title' | 'cutscene' | 'ready' | 'play' | 'ghostEaten' | 'dying' | 'clear' | 'gameover' | 'victory' | 'paused';

const READY_TICKS = 2 * TICK_RATE;
/** La tarjeta de nivel se ve antes del "READY!" final. */
const CARD_TICKS = 270;
/** Tiempo (ticks) antes de poder saltarse la tarjeta de nivel con una pulsación. */
const CARD_SKIP_AFTER = 75;
const CLEAR_TICKS = 3 * TICK_RATE;
const GHOST_EATEN_TICKS = TICK_RATE;
const DEATH_FREEZE = 45;
const DEATH_FRAME_TICKS = 8;
const DEATH_FRAMES = 11;
const GAMEOVER_TICKS = 3 * TICK_RATE;
const VICTORY_TICKS = 10 * TICK_RATE;
const FLASH_PERIOD = 14;
const HOUSE_SPEED = 0.5;
/** Velocidad de los ojos que vuelven a casa: algo más rápida que un fantasma normal, no el doble. */
const EATEN_SPEED = (BASE_SPEED * 0.95) / TICK_RATE;
const HIGH_KEY = 'pacman.highscore';
/** Con un amigo rescatado a cuestas, Pac-Man se mueve a la mitad de velocidad. */
const CARRYING_SPEED = 0.5;
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
/** Bomba de Aina: alcance (px), distancia a la que lanza a los fantasmas y distancia mínima de caída a Pac-Man. */
const AINA_BLAST_RADIUS = 120;
const AINA_THROW = 100;
const AINA_MIN_LANDING = 88;

const MAZE_AREA = { w: SCREEN_W, h: 31 * TILE };
const MAZE_CENTER = { x: SCREEN_W / 2, y: MAZE_TOP + (31 * TILE) / 2 };

const GHOST_NAMES: GhostName[] = ['blinky', 'pinky', 'inky', 'clyde'];
const HOUSE_ORDER: Exclude<GhostName, 'blinky'>[] = ['pinky', 'inky', 'clyde'];
/** Al empezar cada vida, los fantasmas hacen más "locuras" durante este tiempo (ticks). */
const EARLY_CHAOS_TICKS = 15 * TICK_RATE;

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
  private theme!: WorldTheme;
  private background!: HTMLCanvasElement;
  private wallRenderer!: WallRenderer;
  private walls!: HTMLCanvasElement;
  /** Versión del laberinto con la que se dibujaron las paredes (cambia al explotar una bomba). */
  private wallsVersion = 0;
  private wallsWhite: HTMLCanvasElement | null = null;
  private mission!: Mission;
  private mechanics: Mechanic[] = [];
  private helpers = new FamilyHelpers();
  private view = new ViewEffects();
  private projectiles = new Projectiles();
  private seenDirectionSeq = 0;
  /** Últimas posiciones de Pac-Man (para la estela de la supervelocidad). */
  private pacTrail: { x: number; y: number }[] = [];
  /** Retroceso de la pistola tras un disparo (ticks). */
  private gunRecoil = 0;
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
  /** Duración total (ticks) con la que empezó el "ready" actual. */
  private readyStart = 0;
  private timeUp = false;
  /** ?quick: sin tarjeta de nivel ni espera de la melodía (pruebas y capturas). */
  private quick = false;
  /** Último checkpoint guardado (se carga al abrir el juego). */
  private checkpoint: Checkpoint | null = loadCheckpoint();
  /** El nivel que se acaba de completar guardó un checkpoint (para avisar en pantalla). */
  private checkpointJustSaved = false;
  /** Progreso guardado (estrellas, récords, álbum) y ajustes. */
  private progress: Progress = loadProgress();
  private settings: Settings = loadSettings();
  private menus!: Menus;
  private menuSeenSeq = 0;
  private pauseIndex = 0;
  /** Estadísticas del nivel en curso, para las estrellas y los récords. */
  private levelStartScore = 0;
  private levelLivesLost = 0;
  private levelPlayTicks = 0;
  /** Letras de AINA y ALEIX: duran todo el juego. */
  private readonly letters = new LetterCollection();
  private letterTokens: LetterTokens | null = null;
  private lastOutcome: RecordOutcome | null = null;
  private lastSeconds = 0;
  private cutsceneUnlocked: string[] = [];

  // Modos de los fantasmas
  private modeIndex = 0;
  private modeTimer = 0;
  /** Orden en que salen de la casa (se baraja en cada vida) y esquina de dispersión de cada uno. */
  private houseOrder: Exclude<GhostName, 'blinky'>[] = [...HOUSE_ORDER];
  private corners: Record<GhostName, Tile> = { ...SCATTER_TARGETS };
  /** Ticks que quedan de "arranque caótico" en la vida actual. */
  private earlyTicks = 0;
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
    this.menus = new Menus(this.menuHost());
    this.menus.reset();
    this.syncMenuInput();
    const params = new URLSearchParams(location.search);
    this.quick = params.has('quick');
    // Depuración: ?menu=worlds|levels|album|settings (&world=N) y ?cutscene=<tick> abren esas pantallas directamente.
    const menu = params.get('menu');
    if (menu) this.menus.open(menu, Number(params.get('world')) || 1);
    if (params.has('cutscene')) {
      this.loadLevel((Number(params.get('world')) || 1) * 10);
      this.cutsceneUnlocked = ['CARTA DE CELY 1', 'RECUERDO 1: PICNIC'];
      this.state = 'cutscene';
      this.timer = Number(params.get('cutscene')) || 0;
    }
    // ?autostart salta la pantalla de título; ?level=N empieza en ese nivel (pruebas y capturas).
    if (params.has('autostart')) this.startGame(Number(params.get('level')) || 1);
    // Depuración: ?fx=gun,invert,boost… activa efectos durante 60 s (solo con ?autostart).
    for (const name of (params.get('fx') ?? '').split(',').filter(Boolean)) if (name in EFFECT_INFO) this.view.add(name as keyof typeof EFFECT_INFO, 60);
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
    const fireRequested = this.input.consumeFire();

    switch (this.state) {
      case 'title':
        this.audio.setAmbient(null);
        this.menus.update(this.menuInput(pressed, pauseRequested));
        break;
      case 'ready':
        // La tarjeta de nivel se puede saltar con una pulsación pasado un momento.
        if (pressed && this.cardActive && this.timer > READY_TICKS && this.readyStart - this.timer >= CARD_SKIP_AFTER) this.timer = READY_TICKS;
        if (--this.timer <= 0) this.state = 'play';
        break;
      case 'play':
        if (pauseRequested) {
          this.pause();
          break;
        }
        if (ainaRequested) this.useAina();
        if (aleixRequested) this.useAleix();
        if (fireRequested && this.view.has('gun') && this.projectiles.tryFire(this.pac.x, this.pac.y, this.pac.dir)) {
          this.audio.sfx('shoot');
          this.gunRecoil = 6;
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
        if (--this.timer <= 0) this.toMenu();
        break;
      case 'cutscene':
        this.timer++;
        if (this.timer >= CUTSCENE_TICKS || (pressed && this.timer >= CUTSCENE_SKIP_AFTER)) {
          this.level++;
          this.startLevel();
        }
        break;
      case 'victory':
        if (--this.timer <= 0 || (pressed && this.timer < VICTORY_TICKS - 120)) this.toMenu();
        break;
      case 'paused':
        this.updatePauseMenu(pressed, pauseRequested);
        break;
    }
  }

  /** Estado de las habilidades de los hijos (para los botones en pantalla). */
  helperState(): { aina: boolean; aleix: boolean; fire: boolean } {
    return { aina: this.helpers.ainaReady, aleix: this.helpers.aleixReady, fire: this.view.has('gun') };
  }

  /** Lo que ven los menús del juego (con getters, para que siempre lean el valor actual). */
  private menuHost(): MenuHost {
    const self = this;
    return {
      get progress() {
        return self.progress;
      },
      get settings() {
        return self.settings;
      },
      get checkpoint() {
        return self.checkpoint;
      },
      get difficulty() {
        return self.difficulty;
      },
      get muted() {
        return self.audio.muted;
      },
      get high() {
        return self.high;
      },
      get frame() {
        return self.frame;
      },
      startAt: (level) => this.startGame(level),
      continueGame: () => {
        if (this.checkpoint) this.continueGame(this.checkpoint);
      },
      setDifficulty: (d) => {
        this.difficulty = d;
        try {
          localStorage.setItem(DIFFICULTY_KEY, d);
        } catch {
          /* sin almacenamiento */
        }
      },
      toggleMute: () => this.audio.toggleMute(),
      setParticles: (on) => {
        this.settings = { ...this.settings, particles: on };
        saveSettings(this.settings);
      },
      resetProgress: () => {
        clearProgress();
        clearCheckpoint();
        this.progress = emptyProgress();
        this.checkpoint = null;
        this.menus.reset();
      },
    };
  }

  /** Descarta las pulsaciones de dirección anteriores: los menús solo reaccionan a las nuevas. */
  private syncMenuInput(): void {
    this.menuSeenSeq = this.input.directionSeq;
  }

  /** Convierte las pulsaciones en una entrada de menú (cada dirección cuenta una sola vez). */
  private menuInput(pressed: boolean, back: boolean): { dir: Dir | null; confirm: boolean; back: boolean } {
    let dir: Dir | null = null;
    if (this.input.directionSeq !== this.menuSeenSeq) {
      this.menuSeenSeq = this.input.directionSeq;
      dir = this.input.direction;
    }
    return { dir, confirm: pressed && dir === null && !back, back };
  }

  /** Vuelve al menú principal. */
  private toMenu(): void {
    this.audio.setAmbient(null);
    this.menus.reset();
    this.syncMenuInput();
    this.state = 'title';
  }

  private updatePauseMenu(pressed: boolean, back: boolean): void {
    const inp = this.menuInput(pressed, back);
    if (inp.back) {
      this.state = this.resumeState;
      this.audio.resume();
      return;
    }
    const n = 3;
    if (inp.dir === Dir.Up) this.pauseIndex = (this.pauseIndex + n - 1) % n;
    else if (inp.dir === Dir.Down) this.pauseIndex = (this.pauseIndex + 1) % n;
    else if (inp.confirm) {
      this.audio.resume();
      if (this.pauseIndex === 0) this.state = this.resumeState;
      else if (this.pauseIndex === 1) this.retryLevel();
      else this.toMenu();
    }
  }

  /** Reintenta el nivel actual desde el principio, con la puntuación que traía. */
  private retryLevel(): void {
    this.score = this.levelStartScore;
    this.startLevel();
  }

  /** Pausa automática al perder el foco (no hace nada si no se está jugando). */
  pauseIfPlaying(): void {
    if (this.state === 'play') this.pause();
  }

  private pause(): void {
    this.resumeState = 'play';
    this.state = 'paused';
    this.pauseIndex = 0;
    this.syncMenuInput();
    this.audio.suspend();
  }

  private startGame(level: number): void {
    this.score = 0;
    this.letters.reset();
    this.lives = DIFFICULTY_PRESETS[this.difficulty].lives;
    this.level = Math.min(Math.max(Math.floor(level), 1), TOTAL_LEVELS);
    this.introJingle = true;
    this.startLevel();
  }

  /** Reanuda desde el último checkpoint: mismo nivel, puntuación y dificultad. */
  private continueGame(cp: Checkpoint): void {
    this.score = cp.score;
    this.letters.restore(cp.letters);
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
    // Al completar el nivel se acaban de golpe la oscuridad, el giro y demás efectos de vista.
    this.view.clear();
    this.checkpointJustSaved = false;
    const done = this.levelDef.level;
    const mission = this.levelDef.mission;
    this.lastSeconds = this.levelPlayTicks / TICK_RATE;
    this.lastOutcome = recordLevel(this.progress, done, {
      score: this.score - this.levelStartScore,
      livesLost: this.levelLivesLost,
      seconds: this.lastSeconds,
      par: parSeconds(mission.type, mission.type === 'SURVIVE' ? mission.seconds : undefined),
    });
    saveProgress(this.progress);
    this.cutsceneUnlocked = this.lastOutcome.album.map((id) => ALBUM.find((e) => e.id === id)?.title ?? id);
    if (isCheckpointLevel(done)) {
      this.checkpoint = { level: done + 1, score: this.score, lives: this.lives, difficulty: this.difficulty, letters: this.letters.snapshot() };
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
      this.wallRenderer = new WallRenderer(this.maze);
      this.theme = themeOfWorld(def.world);
      this.walls = this.wallRenderer.render(this.theme.wall, this.wallLook());
      this.background = renderBackground(this.maze, this.theme);
      this.wallsWhite = null;
      this.wallsVersion = this.maze.version;
    } else {
      // Mismo laberinto otra vez (reinicio): se devuelven las paredes que derribaron las bombas.
      this.maze.resetDynamic();
    }
    this.levelDef = def;
    this.view.clear();
    this.syncWalls();
    this.rules = getLevelRules(def.arcadeLevel, this.difficulty, def.level);
    this.mission = new Mission(def.mission, def.maze, createRng(def.level * 7919));
    this.mechanics = createMechanics(def.mechanics, def.maze, createRng((Math.random() * 2 ** 31) | 0), this.mission.occupied);
    this.letterTokens = new LetterTokens(def.maze, createRng((Math.random() * 2 ** 31) | 0), this.letters, [...this.mission.occupied, ...pickupTiles(this.mechanics)]);
    this.helpers.reset();
  }

  /** Redibuja las paredes si una explosión (o un reinicio) las ha cambiado. */
  private syncWalls(): void {
    if (this.maze.version === this.wallsVersion) return;
    this.wallRenderer.refresh(this.maze.consumeChanged());
    this.walls = this.wallRenderer.render(this.theme.wall, this.wallLook());
    this.background = renderBackground(this.maze, this.theme);
    this.wallsWhite = null;
    this.wallsVersion = this.maze.version;
  }

  /** Estilo de las paredes del mundo actual. */
  private wallLook() {
    return { style: this.theme.wallStyle, fill: this.theme.wallFill, brick: this.theme.brick };
  }

  private mechanicEnv(): MechanicEnv {
    return {
      maze: this.maze,
      pac: this.pac,
      ghosts: this.ghosts,
      view: this.view,
      rng: this.rng,
      killGhost: (g) => this.killGhostByHazard(g),
      eatDot: (c, r) => this.helperEatsDot(c, r),
      blast: (x, y, radius) => {
        const env = this.mechanicEnv();
        for (const m of this.mechanics) m.onBlast?.(x, y, radius, env);
      },
      sfx: (kind) => this.audio.sfx(kind),
      popup: (text, x, y) => this.popups.push({ x, y, text, ticks: 110 }),
    };
  }

  /** Pac-Man recoge una letra: si completa AINA y/o ALEIX, gana una vida por palabra. */
  private collectLetter(letter: string): void {
    const done = this.letters.collect(letter);
    this.popups.push({ x: this.pac.x, y: this.pac.y - 10, text: letter, ticks: 70 });
    if (done.length === 0) {
      this.audio.sfx('collect');
      return;
    }
    this.lives += done.length;
    this.audio.play('extra_life');
    const names = done.map((w) => WORDS[w]).join(' Y ');
    this.popups.push({ x: Math.min(150, Math.max(70, this.pac.x)), y: Math.max(20, this.pac.y - 22), text: `${names}: +${done.length} ${done.length > 1 ? 'VIDAS' : 'VIDA'}`, ticks: 150 });
  }

  /** Aina y Aleix se comen los puntos por los que pasan: Pac-Man ya no tiene que recogerlos. */
  private helperEatsDot(c: number, r: number): boolean {
    if (this.maze.pelletAt(c, r) !== 'dot') return false;
    this.maze.eatPellet(c, r);
    this.addScore(10);
    const eaten = this.maze.totalPellets - this.maze.pelletsLeft;
    if (FRUIT_SPAWN_AT.includes(eaten)) this.fruitTicks = FRUIT_TICKS;
    return true;
  }

  /** Un peligro del nivel (bomba…) mata a un fantasma: se convierte en ojos y da puntos. */
  private killGhostByHazard(g: Ghost): void {
    if (g.state !== 'active' && g.state !== 'leaving') return;
    g.state = 'eaten';
    g.frightened = false;
    this.addScore(200);
    this.mission.onGhostEaten();
    this.popups.push({ x: g.x, y: g.y, text: '200', ticks: GHOST_EATEN_TICKS });
  }

  /** Un peligro del nivel mata a Pac-Man. */
  private killPac(): void {
    this.audio.setAmbient(null);
    this.state = 'dying';
    this.timer = 0;
  }

  private startLevel(): void {
    this.loadLevel(this.level);
    // Cada mundo nuevo empieza con las vidas recargadas.
    if (this.levelDef.stage === 1 && this.levelDef.level > 1) this.lives = Math.max(this.lives, DIFFICULTY_PRESETS[this.difficulty].lives);
    this.levelStartScore = this.score;
    this.levelLivesLost = 0;
    this.levelPlayTicks = 0;
    this.lastOutcome = null;
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
    // Cada vida arranca distinta: orden de salida, esquinas y duración de las fases al azar.
    this.houseOrder = this.rng.shuffle(HOUSE_ORDER);
    this.corners = this.shuffledCorners();
    this.earlyTicks = EARLY_CHAOS_TICKS;
    this.modeTimer = this.jitter(this.rules.schedule[0]);
    this.frightTicks = 0;
    this.idleTicks = 0;
    this.fruitTicks = 0;
    this.popups = [];
    this.eatenGhost = null;
    this.timeUp = false;
    this.view.clear();
    this.projectiles.clear();
    if (!newLevel) for (const m of this.mechanics) m.onRespawn?.(this.mechanicEnv());
    this.initBlinky();
    this.audio.setAmbient(null);
    this.state = 'ready';
    this.cardActive = newLevel && !this.quick;
    this.timer = this.quick ? 10 : newLevel ? CARD_TICKS + READY_TICKS : READY_TICKS;
    if (this.introJingle) {
      this.introJingle = false;
      if (this.quick) {
        this.readyStart = this.timer;
        return;
      }
      this.audio.play('start');
      // Si la melodía ya cargó, la espera dura lo que ella (≈4 s en el arcade).
      this.timer = Math.max(this.timer, Math.round(this.audio.duration('start') * TICK_RATE));
    }
    this.readyStart = this.timer;
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
    if (this.level % LEVELS_PER_WORLD === 0) {
      this.state = 'cutscene';
      this.timer = 0;
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
    return { maze: this.maze, target: this.targetFor(g), rng: this.rng, houseSpeed: HOUSE_SPEED, chaos: this.chaosLevel() };
  }

  /** Reparte al azar las cuatro esquinas de dispersión entre los cuatro fantasmas. */
  private shuffledCorners(): Record<GhostName, Tile> {
    const shuffled = this.rng.shuffle(Object.values(SCATTER_TARGETS));
    return { blinky: shuffled[0], pinky: shuffled[1], inky: shuffled[2], clyde: shuffled[3] };
  }

  /** Varía hasta un ±15 % la duración de una fase (las infinitas o muy cortas se dejan como están). */
  private jitter(ticks: number): number {
    return Number.isFinite(ticks) && ticks > 90 ? Math.round(ticks * (0.85 + this.rng.float() * 0.3)) : ticks;
  }

  /**
   * Probabilidad de que un fantasma se desvíe en un cruce: algo siempre y bastante más en los primeros
   * segundos de cada vida. Se desvanece con el avance del juego: en el último nivel son cazadores perfectos.
   */
  private chaosLevel(): number {
    const progress = Math.min(1, (this.levelDef.level - 1) / 99);
    return (0.08 + (this.earlyTicks > 0 ? 0.3 : 0)) * (1 - progress);
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
    // Invisible, Pac-Man no tiene rastro: los fantasmas se van a sus esquinas (salvo el señuelo de Aleix).
    if (!decoy && this.view.has('invisible')) return this.corners[g.name];
    if (!decoy && this.isScatter() && !(g.name === 'blinky' && g.elroy > 0)) return this.corners[g.name];
    const blinky = this.ghost('blinky');
    const quarry = decoy ? { col: decoy.col, row: decoy.row, dir: Dir.Left } : { col: this.pac.col, row: this.pac.row, dir: this.pac.dir };
    return chaseTarget(g.name, { col: g.col, row: g.row }, quarry, { col: blinky.col, row: blinky.row }, this.corners.clyde);
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
    let factor = this.view.speedFactor;
    for (const m of this.mechanics) factor *= m.pacSpeedFactor?.(this.pac) ?? 1;
    if (this.mission.carrying) factor *= CARRYING_SPEED;
    return (BASE_SPEED * pct * factor) / TICK_RATE;
  }

  private updatePlay(): void {
    this.levelPlayTicks++;
    if (this.earlyTicks > 0) this.earlyTicks--;
    // Solo las pulsaciones nuevas se traducen: así un efecto de mando no reinterpreta lo ya pulsado.
    if (this.input.directionSeq !== this.seenDirectionSeq) {
      this.seenDirectionSeq = this.input.directionSeq;
      if (this.input.direction !== null) this.pac.want = this.view.mapInput(this.input.direction);
    }
    this.view.update();
    if (this.gunRecoil > 0) this.gunRecoil--;
    this.pacTrail.push({ x: this.pac.x, y: this.pac.y });
    if (this.pacTrail.length > 10) this.pacTrail.shift();

    if (this.eatPause > 0) {
      this.eatPause--;
    } else {
      this.pac.move(this.maze, this.pacSpeed());
      this.eat();
    }

    const env = this.mechanicEnv();
    for (const m of this.mechanics) m.update(env);
    this.syncWalls();
    {
      const env = this.mechanicEnv();
      this.projectiles.update(
        this.maze,
        this.ghosts,
        (gh) => this.killGhostByHazard(gh),
        (x, y) => this.mechanics.some((m) => m.shotAt?.(x, y, env)),
      );
    }
    if (this.mechanics.some((m) => m.hitsPac?.(this.pac))) {
      this.killPac();
      return;
    }
    for (const letter of this.letterTokens?.update(this.pac) ?? []) this.collectLetter(letter);
    const picked = this.mission.update(this.pac);
    if (picked.item) this.audio.sfx('collect');
    if (picked.freed) {
      this.audio.sfx('rescue');
      this.popups.push({ x: this.pac.x, y: this.pac.y - 10, text: 'AMIGO A CUESTAS: MITAD DE VELOCIDAD', ticks: 150 });
    }
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
    this.modeTimer = this.jitter(this.rules.schedule[this.modeIndex]);
    for (const g of this.ghosts) g.requestReverse();
  }

  private updateElroy(): void {
    const blinky = this.ghost('blinky');
    const left = this.maze.pelletsLeft;
    blinky.elroy = !this.elroyEnabled ? 0 : left <= this.rules.elroy2Dots ? 2 : left <= this.rules.elroy1Dots ? 1 : 0;
  }

  // ───────────────────────── Ayudantes de la familia ─────────────────────────

  /** Aina: bomba que lanza por los aires a los fantasmas cercanos, alejándolos de Pac-Man (sobre las paredes). */
  private useAina(): void {
    if (!this.helpers.useAina(this.pac.x, this.pac.y)) return;
    this.audio.sfx('explosion');
    this.launchGhosts();
  }

  private launchGhosts(): void {
    const lines = this.levelDef.maze;
    for (const g of this.ghosts) {
      if (g.state !== 'active' || g.flight) continue;
      const dx = g.x - this.pac.x;
      const dy = g.y - this.pac.y;
      const d = Math.hypot(dx, dy);
      if (d > AINA_BLAST_RADIUS) continue;
      const ang = d < 1 ? this.rng.int(360) * (Math.PI / 180) : Math.atan2(dy, dx);
      // Punto de caída ideal: más allá del fantasma, en línea desde Pac-Man; luego, la casilla libre más cercana.
      const wantX = Math.min(this.maze.cols * TILE - 12, Math.max(12, g.x + Math.cos(ang) * AINA_THROW));
      const wantY = Math.min(this.maze.rows * TILE - 12, Math.max(12, g.y + Math.sin(ang) * AINA_THROW));
      let best: { col: number; row: number } | null = null;
      let bestScore = Infinity;
      for (let row = 1; row < this.maze.rows - 1; row++) {
        for (let col = 1; col < this.maze.cols - 1; col++) {
          if (lines[row][col] === '#' || !this.maze.isWalkable(col, row)) continue;
          if (col >= 9 && col <= 18 && row >= 12 && row <= 18) continue; // casa de los fantasmas
          const cx = col * TILE + TILE / 2;
          const cy = row * TILE + TILE / 2;
          if (Math.hypot(cx - this.pac.x, cy - this.pac.y) < AINA_MIN_LANDING) continue;
          const score = Math.hypot(cx - wantX, cy - wantY);
          if (score < bestScore) {
            bestScore = score;
            best = { col, row };
          }
        }
      }
      if (best) g.launch(best.col, best.row);
    }
  }

  private useAleix(): void {
    if (this.helpers.useAleix({ col: this.pac.col, row: this.pac.row })) this.audio.sfx('decoy');
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
    for (const name of this.houseOrder) {
      const g = this.ghost(name);
      // Los fantasmas que se están regenerando salen por su cuenta, no por los contadores de puntos.
      if (g.state === 'house' && g.reviveTicks === 0) return g;
    }
    return undefined;
  }

  private releaseOnDot(): void {
    const g = this.nextInHouse();
    if (!g) return;
    if (this.globalMode) {
      this.globalCounter++;
      // Los umbrales (7, 17, 32) se asignan por posición en la cola de salida, sea cual sea el fantasma.
      const thresholds = [GLOBAL_RELEASE.pinky, GLOBAL_RELEASE.inky, GLOBAL_RELEASE.clyde];
      for (const [pos, name] of this.houseOrder.entries()) {
        const gh = this.ghost(name);
        if (gh.state === 'house' && this.globalCounter === thresholds[pos]) {
          this.releaseGhost(gh);
          // Sale el último de la cola: se vuelve a los contadores personales.
          if (pos === this.houseOrder.length - 1) this.globalMode = false;
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
    // Los límites de puntos (0, 30, 60…) se asignan por posición en la cola de salida.
    const limits = [this.rules.houseLimits.pinky, this.rules.houseLimits.inky, this.rules.houseLimits.clyde];
    if (!this.globalMode && this.personal[g.name] >= limits[this.houseOrder.indexOf(g.name as 'pinky' | 'inky' | 'clyde')]) {
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
      if (g.flight) continue; // por los aires no toca a nadie
      if (g.col !== this.pac.col || g.row !== this.pac.row) continue;
      if (g.frightened) {
        this.eatGhost(g);
        return true;
      }
      this.killPac();
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
    this.levelLivesLost++;
    this.mission.onPacDeath();
    this.globalMode = true;
    this.globalCounter = 0;
    this.elroyEnabled = false; // tras morir, Blinky no vuelve a acelerar en lo que queda de nivel: se reinicia como al empezar
    if (this.timeUp) this.mission = new Mission(this.levelDef.mission, this.levelDef.maze, createRng(this.levelDef.level * 7919));
    this.beginReady();
  }

  // ───────────────────────── Dibujo ─────────────────────────

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    if (this.state === 'cutscene') {
      drawCutscene(ctx, this.levelDef.world, this.timer, this.cutsceneUnlocked);
      return;
    }
    // Los submenús (mapa, niveles, álbum, ajustes) tienen su propia cabecera: no llevan el marcador.
    if (this.state !== 'title' || this.menus.screen === 'main') this.drawHud(ctx);

    if (this.state === 'title') {
      this.menus.draw(ctx);
      return;
    }
    if (this.state === 'victory') {
      this.drawVictory(ctx);
      return;
    }

    // Capa del laberinto: es la que giran el espejo y los fenómenos; el HUD y los textos no se mueven.
    ctx.save();
    this.view.applyMazeTransform(ctx, MAZE_CENTER.x, MAZE_CENTER.y, MAZE_AREA.w, MAZE_AREA.h);
    const flashWhite = this.state === 'clear' && Math.floor(this.timer / 15) % 2 === 0;
    if (flashWhite) this.wallsWhite ??= this.wallRenderer.render('#ffffff', { style: this.theme.wallStyle });
    ctx.drawImage(this.background, 0, MAZE_TOP, this.maze.cols * TILE, this.maze.rows * TILE);
    if (this.state !== 'clear' && this.settings.particles) drawParticles(ctx, this.theme, this.frame);
    ctx.drawImage(flashWhite ? this.wallsWhite! : this.walls, 0, MAZE_TOP, this.maze.cols * TILE, this.maze.rows * TILE);
    if (this.state !== 'clear') {
      for (const m of this.mechanics) m.draw(ctx, this.frame);
      this.mission.draw(ctx, this.frame);
      this.drawPellets(ctx);
      this.letterTokens?.draw(ctx, this.frame);
    }
    if (this.fruitTicks > 0 && this.state !== 'clear') drawFruit(ctx, this.rules.fruit, FRUIT_X, MAZE_TOP + FRUIT_Y);
    this.helpers.draw(ctx, this.frame);
    if (this.state !== 'clear') for (const m of this.mechanics) m.drawOver?.(ctx, this.frame);
    this.projectiles.draw(ctx);

    const hideGhosts = this.state === 'clear' || (this.state === 'dying' && this.timer >= DEATH_FREEZE);
    if (!hideGhosts) this.drawGhosts(ctx);
    this.drawPac(ctx);
    this.drawPistolInHand(ctx);
    this.drawDarkness(ctx);
    ctx.restore();
    this.drawPopups(ctx);

    const cardVisible = this.state === 'ready' && this.cardActive && this.timer > READY_TICKS;
    if (this.state === 'ready' && !cardVisible) drawTextCentered(ctx, 'READY!', SCREEN_W / 2, MESSAGE_Y, COLORS.ready);
    if (this.state === 'paused') this.drawPauseMenu(ctx);
    if (this.state === 'clear') this.drawResult(ctx);
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
      const lift = g.lift;
      if (lift > 0) {
        // Sombra en el suelo mientras vuela.
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(g.x, MAZE_TOP + g.y + 5, 5 - lift * 0.06, 1.8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      drawGhost(ctx, g.x, MAZE_TOP + g.y - lift, g.name, g.dir, g.anim, this.ghostLook(g));
    }
  }

  private drawPac(ctx: CanvasRenderingContext2D): void {
    if (this.state === 'ghostEaten') return;
    const y = MAZE_TOP + this.pac.y;
    // Envenenado (efecto negativo de una seta): Pac-Man se tiñe de verde mientras dura.
    const palette = this.view.poisoned ? 'green' : 'yellow';
    if (this.state === 'dying' && this.timer >= DEATH_FREEZE) {
      const progress = (this.timer - DEATH_FREEZE) / (DEATH_FRAMES * DEATH_FRAME_TICKS);
      if (progress < 1) drawPacDeath(ctx, this.pac.x, y, progress, palette);
      return;
    }
    const anim = this.pac.moving && this.state === 'play' ? this.pac.anim : 0;
    if (this.view.has('invisible') && this.state === 'play') {
      // Casi transparente, con parpadeos y un desplazamiento de "interferencia".
      const flick = Math.floor(this.frame / 4) % 6 === 0;
      ctx.save();
      ctx.globalAlpha = flick ? 0.55 : 0.22;
      drawPac(ctx, this.pac.x + (flick ? 1.5 : 0), y, this.pac.dir, anim, palette);
      ctx.restore();
      return;
    }
    if (this.view.has('boost') && this.state === 'play') {
      // Estela: copias cada vez más tenues de dónde estuvo Pac-Man.
      for (const [back, alpha] of [[8, 0.1], [5, 0.2], [3, 0.3]] as const) {
        const p = this.pacTrail[this.pacTrail.length - 1 - back];
        if (!p) continue;
        ctx.save();
        ctx.globalAlpha = alpha;
        drawPac(ctx, p.x, MAZE_TOP + p.y, this.pac.dir, anim, palette);
        ctx.restore();
      }
      ctx.save();
      ctx.shadowColor = '#ffe94a';
      ctx.shadowBlur = ctx.getTransform().a * 5;
      drawPac(ctx, this.pac.x, y, this.pac.dir, anim, palette);
      ctx.restore();
    } else {
      drawPac(ctx, this.pac.x, y, this.pac.dir, anim, palette);
    }
    if (this.view.poisoned) this.drawFumes(ctx, y);
  }

  /** Vapores verdes que suben de Pac-Man mientras está envenenado. */
  private drawFumes(ctx: CanvasRenderingContext2D, y: number): void {
    ctx.save();
    ctx.shadowColor = '#7dff4a';
    ctx.shadowBlur = ctx.getTransform().a * 2;
    for (let i = 0; i < 4; i++) {
      const life = ((this.frame * 0.04 + i * 0.25) % 1);
      ctx.globalAlpha = (1 - life) * 0.8;
      ctx.fillStyle = '#9cff6a';
      ctx.beginPath();
      ctx.arc(this.pac.x + Math.sin(this.frame / 9 + i * 2) * 3.5, y - 6 - life * 9, 1.6 - life * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Efecto "oscuridad": solo se ve un círculo alrededor de Pac-Man. */
  private drawDarkness(ctx: CanvasRenderingContext2D): void {
    const a = this.view.darkAmount;
    if (a < 0.01) return;
    const x = this.pac.x;
    const y = MAZE_TOP + this.pac.y;
    const g = ctx.createRadialGradient(x, y, 16, x, y, 56);
    g.addColorStop(0, 'rgba(0,0,8,0)');
    g.addColorStop(1, `rgba(0,0,8,${0.97 * a})`);
    ctx.fillStyle = g;
    ctx.fillRect(-20, MAZE_TOP - 20, SCREEN_W + 40, MAZE_AREA.h + 40);
  }

  /** Intensidad de la visión borrosa (0–1) para el postproceso del lienzo. */
  get wobbleAmount(): number {
    return this.view.wobbleAmount;
  }

  /** Mientras dura el efecto de disparo, Pac-Man lleva la pistola apuntando hacia donde mira. */
  private drawPistolInHand(ctx: CanvasRenderingContext2D): void {
    if (!this.view.has('gun') || (this.state !== 'play' && this.state !== 'paused')) return;
    // En los últimos 3 segundos parpadea para avisar de que se acaba.
    if (this.view.secondsLeft('gun') <= 3 && Math.floor(this.frame / 6) % 2 === 0) return;
    const d = DIRS[this.pac.dir];
    drawPistol(ctx, this.pac.x + d.x * 7, MAZE_TOP + this.pac.y + d.y * 7 + 1, this.pac.dir, this.gunRecoil / 6);
  }

  private drawPopups(ctx: CanvasRenderingContext2D): void {
    for (const p of this.popups) {
      const w = p.text.length * CHAR_W;
      const at = this.view.toScreen(p.x, MAZE_TOP + p.y, MAZE_CENTER.x, MAZE_CENTER.y, MAZE_AREA.w, MAZE_AREA.h);
      // Sin salirse de la pantalla (los avisos de efecto son largos).
      const x = Math.min(Math.max(at.x - w / 2, 2), SCREEN_W - w - 2);
      drawText(ctx, p.text, Math.round(x), Math.round(at.y - 4), p.text.length > 5 ? '#e6b8ff' : '#27e8ff');
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D): void {
    const blink = Math.floor(this.frame / 30) % 2 === 0;
    if (this.state === 'title' || blink) drawText(ctx, '1UP', 3 * TILE, 0, COLORS.text);
    drawText(ctx, 'HIGH SCORE', 9 * TILE, 0, COLORS.text);
    drawTextRight(ctx, this.state === 'title' ? '00' : String(this.score).padStart(2, '0'), 7 * TILE, TILE, COLORS.text);
    drawTextRight(ctx, String(this.high).padStart(2, '0'), 17 * TILE, TILE, COLORS.text);

    if (this.state === 'title' || this.state === 'victory') return;
    drawTextRight(ctx, `MUNDO ${worldLabel(this.levelDef.world)}`, SCREEN_W - 4, 0, this.levelDef.wallColor);
    drawTextRight(ctx, `NIVEL ${this.levelDef.stage}`, SCREEN_W - 4, TILE, COLORS.text);
    // Si hay varios efectos a la vez, el aviso muestra primero el que perjudica (el veneno).
    const active = this.view.active();
    const effect = active.find((e) => NEGATIVE_EFFECTS.includes(e.kind)) ?? active[0];
    if (effect) {
      const info = EFFECT_INFO[effect.kind];
      const blink = effect.seconds > 2 || Math.floor(this.frame / 8) % 2 === 0;
      const label = `${info.label} ${effect.seconds}`;
      if (blink) {
        // Sobre la fila de muro de arriba del laberinto, con fondo oscuro, para no pisar las letras de AINA y ALEIX.
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(Math.round((SCREEN_W - label.length * 6.6) / 2) - 3, MAZE_TOP, label.length * 6.6 + 6, 9);
        drawTextCentered(ctx, label, SCREEN_W / 2, MAZE_TOP + 1, info.color);
      }
    }
    drawLetterHud(ctx, this.letters, SCREEN_W / 2, 22);
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
    const h = 136;
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
    drawEmblem(ctx, this.theme.emblem, x + 22, y + 22, 9, this.theme.wall);
    drawEmblem(ctx, this.theme.emblem, x + w - 22, y + 22, 9, this.theme.wall);
    drawTextCentered(ctx, `MUNDO ${worldLabel(def.world)}`, cx, y + 9, def.wallColor);
    drawTextCentered(ctx, def.name.toUpperCase(), cx, y + 21, COLORS.text);
    drawTextCentered(ctx, `NIVEL ${def.stage}`, cx, y + 34, COLORS.ready);
    if (def.subtitle) drawTextCentered(ctx, def.subtitle, cx, y + 46, '#ff9ae8');
    const special = def.mission.type !== 'CLEAR';
    drawTextCentered(ctx, g1, cx, y + 61, special ? '#ffee22' : '#cfd8ff');
    if (g2) drawTextCentered(ctx, g2, cx, y + 72, special ? '#ffee22' : '#cfd8ff');
    drawTextCentered(ctx, `${who.name}:`, cx, y + 93, who.color);
    drawTextCentered(ctx, phrase.lines[0], cx, y + 105, COLORS.text);
    drawTextCentered(ctx, phrase.lines[1], cx, y + 117, COLORS.text);
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

  /** Panel de fin de nivel: estrellas, récord y tiempo. */
  private drawResult(ctx: CanvasRenderingContext2D): void {
    const o = this.lastOutcome;
    if (!o) return;
    const cx = SCREEN_W / 2;
    const y = 74;
    ctx.save();
    ctx.fillStyle = 'rgba(2,3,28,0.92)';
    ctx.beginPath();
    ctx.roundRect(24, y, SCREEN_W - 48, 70, 7);
    ctx.fill();
    ctx.strokeStyle = this.theme.wall;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
    drawTextCentered(ctx, 'NIVEL COMPLETADO', cx, y + 8, COLORS.ready);
    drawStars(ctx, cx - 20, y + 31, o.stars, 3, '#ffd24a', 6);
    drawTextCentered(ctx, `TIEMPO ${formatTime(this.lastSeconds)}`, cx, y + 45, '#cfd8ff');
    if (o.newBestScore) drawTextCentered(ctx, 'NUEVO RECORD', cx, y + 57, '#27e8ff');
  }

  /** Menú de pausa: continuar, reintentar el nivel o volver al menú. */
  private drawPauseMenu(ctx: CanvasRenderingContext2D): void {
    const cx = SCREEN_W / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(2,3,28,0.93)';
    ctx.beginPath();
    ctx.roundRect(32, 92, SCREEN_W - 64, 84, 7);
    ctx.fill();
    ctx.strokeStyle = this.theme.wall;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
    drawTextCentered(ctx, 'PAUSA', cx, 100, COLORS.ready);
    ['CONTINUAR', 'REINTENTAR NIVEL', 'SALIR AL MENU'].forEach((label, i) => {
      const on = i === this.pauseIndex;
      drawTextCentered(ctx, on ? `> ${label} <` : label, cx, 120 + i * 16, on ? COLORS.text : '#6f759c');
    });
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
    const { shape, color } = this.theme.pellet;
    const energizers: { x: number; y: number }[] = [];
    if (shape === 'dot') ctx.beginPath();
    for (const p of this.maze.pelletTiles()) {
      const x = p.c * TILE + TILE / 2;
      const y = MAZE_TOP + p.r * TILE + TILE / 2;
      if (p.kind === 'energizer') {
        energizers.push({ x, y });
      } else if (shape === 'dot') {
        ctx.moveTo(x + 1.2, y);
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
      } else {
        drawPelletShape(ctx, shape, color, x, y, this.frame, p.c, p.r);
      }
    }
    if (shape === 'dot') {
      ctx.fillStyle = color;
      ctx.fill();
    }

    // Los energizers laten y brillan con el color del mundo.
    const pulse = 3.5 + 0.5 * Math.sin(this.frame / 5);
    const blinkOn = Math.floor(this.frame / 10) % 2 === 0 || this.state !== 'play';
    if (!blinkOn) return;
    ctx.save();
    ctx.shadowColor = this.theme.energizer;
    ctx.shadowBlur = ctx.getTransform().a * 3;
    for (const e of energizers) {
      const g = ctx.createRadialGradient(e.x - 1, e.y - 1, 0.4, e.x, e.y, pulse);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.5, this.theme.energizer);
      g.addColorStop(1, this.theme.wall);
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
