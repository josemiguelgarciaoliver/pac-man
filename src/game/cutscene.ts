import { FAMILY, type FamilyMember } from '../data/family';
import { WORLD_NAMES } from '../data/worlds';
import { drawTextCentered } from '../engine/font';
import { COLORS, Dir, SCREEN_H, SCREEN_W } from './constants';
import { drawFace } from './faces';
import { drawGhost, drawPac } from './sprites';
import { drawEmblem } from './theme/emblems';
import { themeOfWorld } from './theme/worldThemes';

/** Duración de la escena entre mundos (ticks). */
export const CUTSCENE_TICKS = 540;
/** A partir de aquí se puede saltar con una pulsación. */
export const CUTSCENE_SKIP_AFTER = 90;

/** Hijo en miniatura corriendo (cara, camiseta y piernas), centrado en (x, y). */
function drawKid(ctx: CanvasRenderingContext2D, who: FamilyMember, x: number, y: number, facing: 1 | -1, tick: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);
  const stride = Math.sin(tick * 0.6) * 2;
  ctx.strokeStyle = '#2d3358';
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-1.3, 3.6);
  ctx.lineTo(-1.3 + stride, 7.4);
  ctx.moveTo(1.3, 3.6);
  ctx.lineTo(1.3 - stride, 7.4);
  ctx.stroke();
  ctx.fillStyle = who === 'aleix' ? '#ff8a1f' : '#3da4ff';
  ctx.beginPath();
  ctx.roundRect(-3.4, -0.8, 6.8, 5, 1.6);
  ctx.fill();
  ctx.translate(0, -5);
  drawFace(ctx, who, 5.6);
  ctx.restore();
}

/**
 * Escena que se ve al completar un mundo (al estilo de las intermisiones del arcade):
 *  1. un fantasma persigue a Pac-Man por la pantalla,
 *  2. Pac-Man, enorme, persigue al fantasma asustado con Aina y Aleix detrás,
 *  3. aparece la carta de Cely y lo que se ha desbloqueado.
 */
export function drawCutscene(ctx: CanvasRenderingContext2D, world: number, tick: number, unlocked: string[]): void {
  const theme = themeOfWorld(world);
  const cx = SCREEN_W / 2;

  // Fondo del mundo con un suave degradado.
  const g = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
  g.addColorStop(0, theme.bg[0] === '#000000' ? '#050520' : theme.bg[0]);
  g.addColorStop(1, theme.bg[1] === '#000000' ? '#10104a' : theme.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

  drawEmblem(ctx, theme.emblem, cx, 40, 14, theme.wall);
  drawTextCentered(ctx, `MUNDO ${world} COMPLETADO`, cx, 66, COLORS.ready);
  drawTextCentered(ctx, WORLD_NAMES[world - 1].toUpperCase(), cx, 79, theme.wall);

  // Suelo.
  ctx.fillStyle = theme.wall;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(0, 168, SCREEN_W, 1.4);
  ctx.globalAlpha = 1;

  const y = 150;
  if (tick < 190) {
    // Fase 1: Blinky persigue a Pac-Man de izquierda a derecha.
    const x = -20 + tick * 1.45;
    drawPac(ctx, x, y, Dir.Right, tick);
    drawGhost(ctx, x - 24, y, 'blinky', Dir.Right, tick, 'normal');
    drawGhost(ctx, x - 44, y, 'pinky', Dir.Right, tick + 6, 'normal');
  } else if (tick < 400) {
    // Fase 2: Pac-Man gigante persigue a los fantasmas asustados; Aina y Aleix corren detrás.
    const t = tick - 190;
    const x = SCREEN_W + 40 - t * 1.6;
    ctx.save();
    ctx.translate(x, y - 12);
    ctx.scale(2.4, 2.4);
    drawPac(ctx, 0, 0, Dir.Left, tick);
    ctx.restore();
    const flashing = t > 150 && Math.floor(t / 6) % 2 === 0;
    drawGhost(ctx, x - 52, y, 'blinky', Dir.Left, tick, flashing ? 'flash' : 'frightened');
    drawGhost(ctx, x - 72, y, 'pinky', Dir.Left, tick + 6, flashing ? 'flash' : 'frightened');
    drawKid(ctx, 'aleix', x + 36, y + 2, -1, tick);
    drawKid(ctx, 'aina', x + 58, y + 2, -1, tick + 5);
  } else {
    // Fase 3: la carta de Cely.
    const a = Math.min(1, (tick - 400) / 30);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(2,3,28,0.9)';
    ctx.beginPath();
    ctx.roundRect(14, 100, SCREEN_W - 28, 100, 7);
    ctx.fill();
    ctx.strokeStyle = FAMILY.cely.color;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(34, 120);
    drawFace(ctx, 'cely', 9);
    ctx.restore();
    drawTextCentered(ctx, 'CELY HA ESCRITO', cx, 112, FAMILY.cely.color);
    const lines = unlocked.length > 0 ? unlocked : ['ALBUM FAMILIAR'];
    lines.slice(0, 3).forEach((l, i) => drawTextCentered(ctx, l, cx, 132 + i * 14, COLORS.text));
    drawTextCentered(ctx, 'LO TIENES EN EL ALBUM', cx, 180, '#7fa0ff');
  }
  if (tick >= CUTSCENE_SKIP_AFTER && Math.floor(tick / 30) % 2 === 0) drawTextCentered(ctx, 'PULSA PARA SEGUIR', cx, SCREEN_H - 24, '#7a80a8');
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
}
