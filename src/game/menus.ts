import { ALBUM } from '../data/album';
import { FAMILY } from '../data/family';
import { LEVELS_PER_WORLD, TOTAL_LEVELS, WORLD_NAMES } from '../data/worlds';
import { drawText, drawTextCentered, drawTextRight } from '../engine/font';
import { COLORS, Dir, SCREEN_H, SCREEN_W } from './constants';
import { buildLevel } from './level/levels';
import { isLevelUnlocked, isWorldUnlocked, lastSelectableLevel, starsOf, totalStars, worldStars, type Progress, type Settings } from './progress';
import { DIFFICULTIES, DIFFICULTY_PRESETS, type Difficulty } from './rules';
import { drawEmblem } from './theme/emblems';
import { themeOfWorld } from './theme/worldThemes';
import type { Checkpoint } from './checkpoint';

export type Screen = 'main' | 'worlds' | 'levels' | 'album' | 'settings';

/** Lo que los menús necesitan del juego (así se pueden probar sin canvas ni audio). */
export interface MenuHost {
  progress: Progress;
  settings: Settings;
  checkpoint: Checkpoint | null;
  difficulty: Difficulty;
  muted: boolean;
  high: number;
  frame: number;
  startAt(level: number): void;
  continueGame(): void;
  setDifficulty(d: Difficulty): void;
  toggleMute(): void;
  setParticles(on: boolean): void;
  setDevSkip(on: boolean): void;
  resetProgress(): void;
}

/** Una pulsación de navegación: dirección nueva, confirmar o volver atrás. */
export interface MenuInput {
  dir: Dir | null;
  confirm: boolean;
  back: boolean;
}

const MISSION_LABEL: Record<string, string> = {
  CLEAR: 'COMER TODO',
  COLLECT: 'RECOGER OBJETOS',
  REACH: 'LLEGAR A LA META',
  RESCUE: 'RESCATAR AL AMIGO',
  HUNT: 'CAZAR FANTASMAS',
  SURVIVE: 'SOBREVIVIR',
};

/** Nombres cortos para las tarjetas del mapa de mundos. */
const SHORT_NAMES = ['ARCADE', 'BOSQUE', 'FABRICA', 'POLO HELADO', 'PIRAMIDES', 'MARINO', 'VOLCAN', 'ESPACIO', 'CASTILLO', 'GLITCH'];

const DIM = '#6f759c';
const HINT = '#7fa0ff';

export class Menus {
  screen: Screen = 'main';
  private mainIndex = 0;
  private world = 1;
  private levelIndex = 0;
  private albumIndex = 0;
  private settingsIndex = 0;
  private confirmReset = false;

  constructor(private readonly host: MenuHost) {}

  /** Vuelve al menú principal con "Continuar" preseleccionado si hay checkpoint. */
  reset(): void {
    this.screen = 'main';
    this.mainIndex = this.host.checkpoint ? 1 : 0;
    this.confirmReset = false;
  }

  /** Abre una pantalla concreta (parámetro de depuración `?menu=`). */
  open(screen: string, world = 1): void {
    if (screen === 'worlds' || screen === 'levels' || screen === 'album' || screen === 'settings') this.screen = screen;
    this.world = Math.min(10, Math.max(1, world));
  }

  /** Opciones del menú principal (dependen de si hay checkpoint). */
  mainItems(): { label: string; action: () => void }[] {
    const h = this.host;
    const items: { label: string; action: () => void }[] = [{ label: 'NUEVA PARTIDA', action: () => h.startAt(1) }];
    if (h.checkpoint) items.push({ label: `CONTINUAR  NIVEL ${h.checkpoint.level}`, action: () => h.continueGame() });
    items.push({ label: 'SELECCIONAR NIVEL', action: () => (this.screen = 'worlds') });
    items.push({ label: `ALBUM  ${h.progress.album.length}/${ALBUM.length}`, action: () => (this.screen = 'album') });
    items.push({ label: 'AJUSTES', action: () => (this.screen = 'settings') });
    return items;
  }

  update(inp: MenuInput): void {
    switch (this.screen) {
      case 'main':
        return this.updateMain(inp);
      case 'worlds':
        return this.updateWorlds(inp);
      case 'levels':
        return this.updateLevels(inp);
      case 'album':
        return this.updateAlbum(inp);
      case 'settings':
        return this.updateSettings(inp);
    }
  }

  private updateMain(inp: MenuInput): void {
    const items = this.mainItems();
    this.mainIndex = Math.min(this.mainIndex, items.length - 1);
    if (inp.dir === Dir.Up) this.mainIndex = (this.mainIndex + items.length - 1) % items.length;
    else if (inp.dir === Dir.Down) this.mainIndex = (this.mainIndex + 1) % items.length;
    else if (inp.dir === Dir.Left || inp.dir === Dir.Right) this.cycleDifficulty(inp.dir === Dir.Right ? 1 : -1);
    else if (inp.confirm) items[this.mainIndex].action();
  }

  private cycleDifficulty(step: number): void {
    const i = DIFFICULTIES.indexOf(this.host.difficulty);
    this.host.setDifficulty(DIFFICULTIES[(i + step + DIFFICULTIES.length) % DIFFICULTIES.length]);
  }

  // ── Mapa de mundos: 5 filas × 2 columnas ──
  private updateWorlds(inp: MenuInput): void {
    if (inp.back) return void (this.screen = 'main');
    const row = (this.world - 1) % 5;
    const col = Math.floor((this.world - 1) / 5);
    let r = row;
    let c = col;
    if (inp.dir === Dir.Up) r = (row + 4) % 5;
    else if (inp.dir === Dir.Down) r = (row + 1) % 5;
    else if (inp.dir === Dir.Left || inp.dir === Dir.Right) c = 1 - col;
    this.world = c * 5 + r + 1;
    if (inp.confirm && !inp.dir && isWorldUnlocked(this.host.progress, this.world)) {
      this.screen = 'levels';
      // Empieza seleccionando el último nivel desbloqueado del mundo.
      const first = (this.world - 1) * LEVELS_PER_WORLD + 1;
      this.levelIndex = Math.min(LEVELS_PER_WORLD - 1, Math.max(0, lastSelectableLevel(this.host.progress) - first));
    }
  }

  // ── Niveles de un mundo: 5 columnas × 2 filas ──
  private updateLevels(inp: MenuInput): void {
    if (inp.back) return void (this.screen = 'worlds');
    const col = this.levelIndex % 5;
    const row = Math.floor(this.levelIndex / 5);
    let c = col;
    let r = row;
    if (inp.dir === Dir.Left) c = (col + 4) % 5;
    else if (inp.dir === Dir.Right) c = (col + 1) % 5;
    else if (inp.dir === Dir.Up || inp.dir === Dir.Down) r = 1 - row;
    this.levelIndex = r * 5 + c;
    const level = this.selectedLevel;
    if (inp.confirm && !inp.dir && isLevelUnlocked(this.host.progress, level)) this.host.startAt(level);
  }

  get selectedLevel(): number {
    return (this.world - 1) * LEVELS_PER_WORLD + this.levelIndex + 1;
  }

  get selectedWorld(): number {
    return this.world;
  }

  // ── Álbum ──
  private updateAlbum(inp: MenuInput): void {
    if (inp.back) return void (this.screen = 'main');
    if (inp.dir === Dir.Up) this.albumIndex = (this.albumIndex + ALBUM.length - 1) % ALBUM.length;
    else if (inp.dir === Dir.Down) this.albumIndex = (this.albumIndex + 1) % ALBUM.length;
    else if (inp.dir === Dir.Left) this.albumIndex = (this.albumIndex + ALBUM.length - 10) % ALBUM.length;
    else if (inp.dir === Dir.Right) this.albumIndex = (this.albumIndex + 10) % ALBUM.length;
    else if (inp.confirm) this.screen = 'main';
  }

  // ── Ajustes ──
  private readonly settingLabels = ['DIFICULTAD', 'SONIDO', 'PARTICULAS', 'S SALTA NIVEL', 'BORRAR PROGRESO', 'VOLVER'];

  private updateSettings(inp: MenuInput): void {
    const h = this.host;
    if (inp.back) return void (this.screen = 'main');
    const n = this.settingLabels.length;
    if (inp.dir === Dir.Up || inp.dir === Dir.Down) {
      this.settingsIndex = (this.settingsIndex + (inp.dir === Dir.Down ? 1 : n - 1)) % n;
      this.confirmReset = false;
      return;
    }
    const step = inp.dir === Dir.Right ? 1 : inp.dir === Dir.Left ? -1 : 0;
    const act = inp.confirm || step !== 0;
    if (!act) return;
    switch (this.settingsIndex) {
      case 0:
        this.cycleDifficulty(step || 1);
        break;
      case 1:
        h.toggleMute();
        break;
      case 2:
        h.setParticles(!h.settings.particles);
        break;
      case 3:
        h.setDevSkip(!h.settings.devSkip);
        break;
      case 4:
        // Doble confirmación: la primera pulsación avisa, la segunda borra.
        if (this.confirmReset) {
          h.resetProgress();
          this.confirmReset = false;
        } else if (inp.confirm) {
          this.confirmReset = true;
        }
        break;
      case 5:
        if (inp.confirm) this.screen = 'main';
        break;
    }
  }

  // ───────────────────────── Dibujo ─────────────────────────

  draw(ctx: CanvasRenderingContext2D): void {
    switch (this.screen) {
      case 'main':
        return this.drawMain(ctx);
      case 'worlds':
        return this.drawWorlds(ctx);
      case 'levels':
        return this.drawLevels(ctx);
      case 'album':
        return this.drawAlbum(ctx);
      case 'settings':
        return this.drawSettings(ctx);
    }
  }

  private blink(): boolean {
    return Math.floor(this.host.frame / 30) % 2 === 0;
  }

  private drawMain(ctx: CanvasRenderingContext2D): void {
    const cx = SCREEN_W / 2;
    drawEmblem(ctx, 'pacman', cx - 62, 63, 9, COLORS.ready);
    drawTextCentered(ctx, 'PAC-MAN', cx + 6, 59, COLORS.ready);
    drawTextCentered(ctx, '100 NIVELES  10 MUNDOS', cx, 80, HINT);
    drawTextCentered(ctx, 'CON CELY  AINA  Y ALEIX', cx, 93, FAMILY.cely.color);

    const items = this.mainItems();
    items.forEach((it, i) => {
      const on = i === this.mainIndex;
      drawTextCentered(ctx, on ? `> ${it.label} <` : it.label, cx, 126 + i * 15, on ? (this.blink() ? COLORS.ready : COLORS.text) : DIM);
    });

    drawTextCentered(ctx, 'DIFICULTAD', cx, 214, HINT);
    drawTextCentered(ctx, `< ${DIFFICULTY_PRESETS[this.host.difficulty].label} >`, cx, 227, COLORS.ready);
    drawTextCentered(ctx, `ESTRELLAS ${totalStars(this.host.progress)}/${TOTAL_LEVELS * 3}`, cx, 245, '#ffd24a');
    drawTextCentered(ctx, 'Z AINA  X ALEIX  ESPACIO FUEGO', cx, 262, '#ffb347');
    drawTextCentered(ctx, this.host.muted ? 'SOUND OFF  M' : 'SOUND ON  M', cx, 274, HINT);
  }

  private drawHeader(ctx: CanvasRenderingContext2D, title: string, sub?: string): void {
    drawTextCentered(ctx, title, SCREEN_W / 2, 8, COLORS.ready);
    if (sub) drawTextCentered(ctx, sub, SCREEN_W / 2, 21, HINT);
  }

  private drawBackHint(ctx: CanvasRenderingContext2D): void {
    drawTextCentered(ctx, 'ATRAS: P  O  BOTON PAUSA', SCREEN_W / 2, SCREEN_H - 14, DIM);
  }

  private drawWorlds(ctx: CanvasRenderingContext2D): void {
    this.drawHeader(ctx, 'MAPA DE MUNDOS', `ESTRELLAS ${totalStars(this.host.progress)}/${TOTAL_LEVELS * 3}`);
    for (let w = 1; w <= 10; w++) {
      const col = Math.floor((w - 1) / 5);
      const row = (w - 1) % 5;
      const x = 6 + col * 110;
      const y = 40 + row * 44;
      const theme = themeOfWorld(w);
      const open = isWorldUnlocked(this.host.progress, w);
      const on = w === this.world;
      ctx.save();
      ctx.fillStyle = on ? 'rgba(40,50,130,0.65)' : 'rgba(10,12,40,0.7)';
      ctx.beginPath();
      ctx.roundRect(x, y, 106, 38, 5);
      ctx.fill();
      ctx.strokeStyle = on ? (this.blink() ? '#ffffff' : theme.wall) : open ? theme.wall : '#2a2e4d';
      ctx.lineWidth = on ? 1.6 : 1;
      ctx.globalAlpha = open ? 1 : 0.55;
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = open ? 1 : 0.35;
      drawEmblem(ctx, theme.emblem, x + 14, y + 19, 8, theme.wall);
      ctx.restore();
      drawText(ctx, `MUNDO ${w}`, x + 28, y + 4, open ? theme.wall : DIM);
      drawText(ctx, SHORT_NAMES[w - 1], x + 28, y + 15, open ? COLORS.text : DIM);
      if (open) drawStars(ctx, x + 29, y + 30, worldStars(this.host.progress, w), 30, '#ffd24a', 3.2, `${worldStars(this.host.progress, w)}/30`);
      else drawText(ctx, 'BLOQUEADO', x + 28, y + 26, DIM);
    }
    this.drawBackHint(ctx);
  }

  private drawLevels(ctx: CanvasRenderingContext2D): void {
    const w = this.world;
    const theme = themeOfWorld(w);
    this.drawHeader(ctx, `MUNDO ${w}`, WORLD_NAMES[w - 1].toUpperCase());
    drawEmblem(ctx, theme.emblem, 20, 20, 8, theme.wall);
    drawEmblem(ctx, theme.emblem, SCREEN_W - 20, 20, 8, theme.wall);

    for (let i = 0; i < LEVELS_PER_WORLD; i++) {
      const level = (w - 1) * LEVELS_PER_WORLD + i + 1;
      const col = i % 5;
      const row = Math.floor(i / 5);
      const x = 8 + col * 42;
      const y = 44 + row * 58;
      const open = isLevelUnlocked(this.host.progress, level);
      const on = i === this.levelIndex;
      ctx.save();
      ctx.fillStyle = on ? 'rgba(40,50,130,0.7)' : 'rgba(10,12,40,0.7)';
      ctx.beginPath();
      ctx.roundRect(x, y, 38, 50, 5);
      ctx.fill();
      ctx.strokeStyle = on ? (this.blink() ? '#ffffff' : theme.wall) : open ? theme.wall : '#2a2e4d';
      ctx.lineWidth = on ? 1.6 : 1;
      ctx.globalAlpha = open ? 1 : 0.55;
      ctx.stroke();
      ctx.restore();
      drawTextCentered(ctx, String(i + 1), x + 19, y + 7, open ? COLORS.text : DIM);
      if (open) drawStars(ctx, x + 19 - 11.7, y + 32, starsOf(this.host.progress, level), 3, '#ffd24a', 3.4);
      else drawTextCentered(ctx, 'X', x + 19, y + 28, DIM);
    }

    // Ficha del nivel seleccionado.
    const level = this.selectedLevel;
    const def = buildLevel(level);
    const open = isLevelUnlocked(this.host.progress, level);
    const rec = this.host.progress.levels[String(level)];
    const y0 = 168;
    drawTextCentered(ctx, `NIVEL ${w}-${this.levelIndex + 1}`, SCREEN_W / 2, y0, COLORS.ready);
    if (def.subtitle) drawTextCentered(ctx, def.subtitle, SCREEN_W / 2, y0 + 12, '#ff9ae8');
    drawTextCentered(ctx, open ? MISSION_LABEL[def.mission.type] : 'BLOQUEADO', SCREEN_W / 2, y0 + 25, open ? COLORS.text : DIM);
    if (open && rec) {
      drawTextCentered(ctx, `MEJOR  ${rec.bestScore}`, SCREEN_W / 2, y0 + 40, '#cfd8ff');
      if (rec.bestSeconds !== null) drawTextCentered(ctx, `TIEMPO  ${formatTime(rec.bestSeconds)}`, SCREEN_W / 2, y0 + 52, '#cfd8ff');
    } else if (open) {
      drawTextCentered(ctx, 'SIN JUGAR', SCREEN_W / 2, y0 + 40, DIM);
    }
    drawTextCentered(ctx, '* COMPLETAR  ** SIN PERDER VIDAS', SCREEN_W / 2, 238, DIM);
    drawTextCentered(ctx, '*** ADEMAS RAPIDO', SCREEN_W / 2, 250, DIM);
    this.drawBackHint(ctx);
  }

  private drawAlbum(ctx: CanvasRenderingContext2D): void {
    this.drawHeader(ctx, 'ALBUM FAMILIAR', `${this.host.progress.album.length}/${ALBUM.length} DESBLOQUEADOS`);
    // Lista con ventana de 8 entradas alrededor de la seleccionada.
    const start = Math.min(Math.max(0, this.albumIndex - 3), ALBUM.length - 8);
    for (let k = 0; k < 8; k++) {
      const i = start + k;
      const entry = ALBUM[i];
      const open = this.host.progress.album.includes(entry.id);
      const on = i === this.albumIndex;
      const color = on ? (this.blink() ? COLORS.ready : COLORS.text) : open ? '#cfd8ff' : DIM;
      drawText(ctx, `${on ? '>' : ' '} ${open ? entry.title : '???  BLOQUEADO'}`, 10, 38 + k * 12, color);
    }
    // Detalle.
    const entry = ALBUM[this.albumIndex];
    const open = this.host.progress.album.includes(entry.id);
    ctx.save();
    ctx.fillStyle = 'rgba(10,12,40,0.8)';
    ctx.beginPath();
    ctx.roundRect(8, 142, SCREEN_W - 16, 104, 6);
    ctx.fill();
    ctx.strokeStyle = open ? FAMILY[entry.from].color : '#2a2e4d';
    ctx.stroke();
    ctx.restore();
    if (open) {
      drawText(ctx, entry.title, 16, 150, FAMILY[entry.from].color);
      drawTextRight(ctx, `DE ${FAMILY[entry.from].name}`, SCREEN_W - 14, 150, FAMILY[entry.from].color);
      entry.lines.forEach((l, i) => drawText(ctx, l, 16, 170 + i * 13, COLORS.text));
    } else {
      drawTextCentered(ctx, `SE DESBLOQUEA AL COMPLETAR`, SCREEN_W / 2, 178, DIM);
      drawTextCentered(ctx, `EL MUNDO ${entry.world} (NIVEL ${entry.world * LEVELS_PER_WORLD})`, SCREEN_W / 2, 192, DIM);
    }
    this.drawBackHint(ctx);
  }

  private drawSettings(ctx: CanvasRenderingContext2D): void {
    const h = this.host;
    this.drawHeader(ctx, 'AJUSTES');
    const values = [`< ${DIFFICULTY_PRESETS[h.difficulty].label} >`, h.muted ? 'NO' : 'SI', h.settings.particles ? 'SI' : 'NO', h.settings.devSkip ? 'SI' : 'NO', this.confirmReset ? 'PULSA OTRA VEZ' : '', ''];
    this.settingLabels.forEach((label, i) => {
      const on = i === this.settingsIndex;
      const y = 52 + i * 21;
      drawText(ctx, `${on ? '>' : ' '} ${label}`, 18, y, on ? (this.blink() ? COLORS.ready : COLORS.text) : DIM);
      if (values[i]) drawTextRight(ctx, values[i], SCREEN_W - 16, y, i === 4 ? '#ff6f91' : COLORS.ready);
    });
    drawTextCentered(ctx, 'IZQUIERDA DERECHA CAMBIA', SCREEN_W / 2, 196, HINT);
    drawTextCentered(ctx, 'S SALTA NIVEL: AYUDA PARA REVISAR', SCREEN_W / 2, 210, DIM);
    drawTextCentered(ctx, `RECORD  ${h.high}`, SCREEN_W / 2, 228, '#cfd8ff');
    this.drawBackHint(ctx);
  }
}

export const formatTime = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/** Fila de estrellas: `n` llenas de `count`, con un texto opcional a la derecha. */
function drawStars(ctx: CanvasRenderingContext2D, x: number, y: number, filled: number, count: number, color: string, size: number, label?: string): void {
  // Para el resumen de mundo (count 30) se dibuja una sola estrella y el texto.
  const shown = count > 3 ? 1 : count;
  for (let i = 0; i < shown; i++) {
    const on = count > 3 ? filled > 0 : i < filled;
    const cx = x + i * (size * 2 + 1) + size;
    ctx.save();
    ctx.translate(cx, y);
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 === 0 ? size : size * 0.45;
      const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    if (on) {
      ctx.shadowColor = color;
      ctx.shadowBlur = ctx.getTransform().a * 2;
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      ctx.strokeStyle = '#4a4f78';
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
    ctx.restore();
  }
  if (label) drawText(ctx, label, x + shown * (size * 2 + 1) + 2, y - 4, '#cfd8ff');
}

export { drawStars };
