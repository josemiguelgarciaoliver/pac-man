import { MAZE_TOP, TICK_RATE, TILE } from './constants';
import { PAC_SPAWN_TILE } from './maze/generator';
import { farthestFromSpawn, pickSpread, type TileXY } from './level/placement';
import type { MissionDef } from './level/schema';
import type { Rng } from './random';

type CollectIcon = Extract<MissionDef, { type: 'COLLECT' }>['icon'];

const LETTERS = ['P', 'A', 'C', '★'];
/** Segundos entre reapariciones de los energizers en las misiones de caza. */
const HUNT_RESPAWN_SECONDS = 25;
/** Ticks de retraso con que el amigo rescatado sigue a Pac-Man. */
const FOLLOW_LAG = 22;
const TAU = Math.PI * 2;

interface Item {
  col: number;
  row: number;
  label: string;
  taken: boolean;
}

const center = (t: TileXY) => ({ x: t.col * TILE + TILE / 2, y: MAZE_TOP + t.row * TILE + TILE / 2 });

/**
 * Estado de la misión de un nivel. Las posiciones de objetos, meta y rehén salen del laberinto
 * y de una semilla, así que son deterministas y siempre alcanzables.
 */
export class Mission {
  private items: Item[] = [];
  private goal: TileXY | null = null;
  private captive: (TileXY & { freed: boolean }) | null = null;
  private huntCount = 0;
  private ticks = 0;
  private trail: { x: number; y: number }[] = [];
  private respawnNeeded = false;

  constructor(
    readonly def: MissionDef,
    lines: readonly string[],
    rng: Rng,
  ) {
    switch (def.type) {
      case 'COLLECT':
        this.items = pickSpread(lines, def.count, rng).map((t, i) => ({ ...t, label: def.icon === 'letters' ? LETTERS[i % LETTERS.length] : '', taken: false }));
        break;
      case 'REACH':
        this.goal = farthestFromSpawn(lines);
        break;
      case 'RESCUE': {
        const far = farthestFromSpawn(lines);
        this.captive = { ...far, freed: false };
        this.goal = { ...PAC_SPAWN_TILE };
        break;
      }
      default:
        break;
    }
  }

  // ───────────────────────── Estado ─────────────────────────

  /** Una vez por tick de juego. Devuelve lo que ha ocurrido (para los sonidos). */
  update(pac: { x: number; y: number; col: number; row: number }): { item: boolean; freed: boolean } {
    const events = { item: false, freed: false };
    this.ticks++;
    this.trail.push({ x: pac.x, y: pac.y });
    if (this.trail.length > FOLLOW_LAG + 1) this.trail.shift();
    if (this.def.type === 'HUNT' && this.ticks % (HUNT_RESPAWN_SECONDS * TICK_RATE) === 0) this.respawnNeeded = true;

    for (const it of this.items) {
      if (!it.taken && it.col === pac.col && it.row === pac.row) {
        it.taken = true;
        events.item = true;
      }
    }
    if (this.captive && !this.captive.freed && this.captive.col === pac.col && this.captive.row === pac.row) {
      this.captive.freed = true;
      events.freed = true;
    }
    return events;
  }

  onGhostEaten(): void {
    this.huntCount++;
  }

  /** ¿Hay que devolver los energizers al laberinto? (se consume al leer) */
  consumeEnergizerRespawn(): boolean {
    const r = this.respawnNeeded;
    this.respawnNeeded = false;
    return r;
  }

  private get timeLimit(): number | undefined {
    return this.def.type === 'COLLECT' || this.def.type === 'REACH' ? this.def.timeLimit : undefined;
  }

  get collected(): number {
    return this.items.filter((i) => i.taken).length;
  }

  /** Segundos que quedan (undefined si la misión no tiene límite). */
  get secondsLeft(): number | undefined {
    if (this.def.type === 'SURVIVE') return Math.max(0, this.def.seconds - Math.floor(this.ticks / TICK_RATE));
    const limit = this.timeLimit;
    return limit === undefined ? undefined : Math.max(0, limit - Math.floor(this.ticks / TICK_RATE));
  }

  failed(): boolean {
    return this.def.type !== 'SURVIVE' && this.timeLimit !== undefined && this.ticks >= this.timeLimit * TICK_RATE;
  }

  isComplete(pac: TileXY, pelletsLeft: number): boolean {
    switch (this.def.type) {
      case 'CLEAR':
        return pelletsLeft === 0;
      case 'COLLECT':
        return this.collected >= this.def.count;
      case 'REACH':
        return !!this.goal && pac.col === this.goal.col && pac.row === this.goal.row;
      case 'RESCUE':
        return !!this.captive?.freed && !!this.goal && pac.col === this.goal.col && pac.row === this.goal.row;
      case 'HUNT':
        return this.huntCount >= this.def.ghosts;
      case 'SURVIVE':
        return this.ticks >= this.def.seconds * TICK_RATE;
    }
  }

  // ───────────────────────── Texto ─────────────────────────

  /** Objetivo para la tarjeta de inicio (máx. 2 líneas de 26 caracteres). */
  goalLines(): [string, string] {
    const d = this.def;
    switch (d.type) {
      case 'CLEAR':
        return ['COME TODOS LOS PUNTOS', ''];
      case 'COLLECT': {
        const what: Record<CollectIcon, string> = {
          letters: `REUNE LAS ${d.count} LETRAS`,
          nut: `RECOGE ${d.count} TUERCAS`,
          glyph: `ENCUENTRA ${d.count} JEROGLIFICOS`,
          pearl: `RECOGE ${d.count} PERLAS`,
          cell: `RECOGE ${d.count} CELULAS`,
          gem: `RECOGE ${d.count} GEMAS`,
        };
        return [what[d.icon], d.timeLimit ? `ANTES DE ${d.timeLimit} SEGUNDOS` : ''];
      }
      case 'REACH':
        return ['LLEGA A LA META', d.timeLimit ? `EN MENOS DE ${d.timeLimit} S` : ''];
      case 'RESCUE':
        return ['LIBERA AL AMIGO Y', 'LLEVALO A LA SALIDA'];
      case 'HUNT':
        return [`COME ${d.ghosts} FANTASMAS`, 'LOS ENERGIZERS VUELVEN'];
      case 'SURVIVE':
        return [`SOBREVIVE ${d.seconds} SEGUNDOS`, ''];
    }
  }

  /** Progreso para el pie de pantalla (null si no hay nada que mostrar). */
  hud(): string | null {
    const d = this.def;
    const time = this.secondsLeft;
    const clock = time === undefined ? '' : `${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}`;
    switch (d.type) {
      case 'CLEAR':
        return null;
      case 'COLLECT':
        return `${this.collected}/${d.count}${clock ? ` ${clock}` : ''}`;
      case 'REACH':
        return clock || 'META';
      case 'RESCUE':
        return this.captive?.freed ? 'SALIDA' : 'LIBERA';
      case 'HUNT':
        return `${Math.min(this.huntCount, d.ghosts)}/${d.ghosts}`;
      case 'SURVIVE':
        return clock;
    }
  }

  // ───────────────────────── Lugar de los objetivos (para la Pista de Aina) ─────────────────────────

  /** Casilla a la que apunta la misión ahora mismo, o null si es "comer puntos". */
  target(from: TileXY): TileXY | null {
    switch (this.def.type) {
      case 'COLLECT': {
        const left = this.items.filter((i) => !i.taken);
        left.sort((a, b) => Math.abs(a.col - from.col) + Math.abs(a.row - from.row) - (Math.abs(b.col - from.col) + Math.abs(b.row - from.row)));
        return left[0] ? { col: left[0].col, row: left[0].row } : null;
      }
      case 'REACH':
        return this.goal;
      case 'RESCUE':
        return this.captive && !this.captive.freed ? { col: this.captive.col, row: this.captive.row } : this.goal;
      default:
        return null;
    }
  }

  // ───────────────────────── Dibujo ─────────────────────────

  draw(ctx: CanvasRenderingContext2D, frame: number): void {
    const bob = Math.sin(frame / 8) * 0.8;
    const type = this.def.type;

    if (type === 'COLLECT') {
      for (const it of this.items) {
        if (it.taken) continue;
        const c = center(it);
        drawCollectible(ctx, this.def.icon, c.x, c.y + bob, it.label, frame);
      }
    }
    if ((type === 'REACH' || type === 'RESCUE') && this.goal) {
      const c = center(this.goal);
      if (type === 'REACH') drawFlag(ctx, c.x, c.y, frame);
      else if (this.captive?.freed) drawExit(ctx, c.x, c.y, frame);
    }
    if (type === 'RESCUE' && this.captive) {
      if (!this.captive.freed) {
        const c = center(this.captive);
        drawBuddy(ctx, c.x, c.y + bob, frame);
        drawCage(ctx, c.x, c.y);
      } else if (this.trail.length > 0) {
        const p = this.trail[0];
        drawBuddy(ctx, p.x, MAZE_TOP + p.y + bob, frame);
      }
    }
  }
}

// ───────────────────────── Sprites de misión ─────────────────────────

function glow(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.shadowColor = color;
  ctx.shadowBlur = ctx.getTransform().a * 2.5;
}

function drawCollectible(ctx: CanvasRenderingContext2D, icon: CollectIcon, x: number, y: number, label: string, frame: number): void {
  ctx.save();
  ctx.translate(x, y);
  switch (icon) {
    case 'letters': {
      glow(ctx, '#ffee22');
      const g = ctx.createRadialGradient(-1.5, -1.5, 0.5, 0, 0, 5.5);
      g.addColorStop(0, '#fffbb0');
      g.addColorStop(1, '#e8a800');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 5.2, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#3a2a00';
      ctx.font = "800 6.4px 'Trebuchet MS', Arial, sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText(label, 0, 2.3);
      break;
    }
    case 'nut': {
      glow(ctx, '#ffb347');
      ctx.fillStyle = '#c9ccd6';
      ctx.beginPath();
      for (let i = 0; i < 6; i++) ctx.lineTo(Math.cos((i / 6) * TAU) * 5, Math.sin((i / 6) * TAU) * 5);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#2a2a3a';
      ctx.beginPath();
      ctx.arc(0, 0, 2, 0, TAU);
      ctx.fill();
      break;
    }
    case 'glyph': {
      glow(ctx, '#ffd24a');
      ctx.strokeStyle = '#ffd24a';
      ctx.lineWidth = 1.3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.ellipse(0, -2.6, 1.9, 2.4, 0, 0, TAU);
      ctx.moveTo(0, -0.2);
      ctx.lineTo(0, 5);
      ctx.moveTo(-3, 1.6);
      ctx.lineTo(3, 1.6);
      ctx.stroke();
      break;
    }
    case 'pearl': {
      glow(ctx, '#ffffff');
      const g = ctx.createRadialGradient(-1.4, -1.6, 0.3, 0, 0, 4.5);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#a9b8d8');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 4.2, 0, TAU);
      ctx.fill();
      break;
    }
    case 'cell': {
      glow(ctx, '#7dff7d');
      ctx.fillStyle = '#3fdc6a';
      ctx.fillRect(-3.4, -4.6, 6.8, 9.2);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#d7ffd7';
      ctx.fillRect(-1.2, -6, 2.4, 1.4);
      ctx.fillStyle = '#0a3d1b';
      ctx.beginPath();
      ctx.moveTo(0.8, -3);
      ctx.lineTo(-1.6, 0.4);
      ctx.lineTo(0, 0.4);
      ctx.lineTo(-0.8, 3.2);
      ctx.lineTo(1.8, -0.4);
      ctx.lineTo(0.2, -0.4);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'gem': {
      glow(ctx, '#27e8ff');
      ctx.fillStyle = '#27e8ff';
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(4.5, 0);
      ctx.lineTo(0, 5);
      ctx.lineTo(-4.5, 0);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }
  // Destello giratorio para que se distingan de los puntos.
  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.4 * Math.sin(frame / 6)})`;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(0, 0, 7, frame / 20, frame / 20 + 1.2);
  ctx.stroke();
  ctx.restore();
}

function drawFlag(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number): void {
  ctx.save();
  glow(ctx, '#ffffff');
  ctx.strokeStyle = '#e6e6f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 3, y + 5);
  ctx.lineTo(x - 3, y - 6);
  ctx.stroke();
  const wave = Math.sin(frame / 6) * 0.9;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : '#222';
      ctx.fillRect(x - 2.5 + c * 2.6, y - 6 + r * 2.6 + wave * (c / 2), 2.6, 2.6);
    }
  }
  ctx.restore();
}

function drawExit(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number): void {
  ctx.save();
  glow(ctx, '#3fdc6a');
  ctx.strokeStyle = `rgba(63,220,106,${0.55 + 0.35 * Math.sin(frame / 6)})`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y, 6 + Math.sin(frame / 8), 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawBuddy(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number): void {
  const mouth = 0.1 + 0.55 * (0.5 - 0.5 * Math.cos(frame / 5));
  ctx.save();
  ctx.translate(x, y);
  const g = ctx.createRadialGradient(-1.6, -1.8, 0.4, 0, 0, 5.4);
  g.addColorStop(0, '#d8f4ff');
  g.addColorStop(1, '#3da4ff');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 5, mouth, TAU - mouth);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCage(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.strokeStyle = '#c9ccd6';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  for (let i = -3; i <= 3; i += 2) {
    ctx.moveTo(x + i, y - 5.5);
    ctx.lineTo(x + i, y + 5.5);
  }
  ctx.moveTo(x - 4.5, y - 5.5);
  ctx.lineTo(x + 4.5, y - 5.5);
  ctx.moveTo(x - 4.5, y + 5.5);
  ctx.lineTo(x + 4.5, y + 5.5);
  ctx.stroke();
  ctx.restore();
}
