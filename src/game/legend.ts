import { FAMILY } from '../data/family';
import { drawText, drawTextCentered } from '../engine/font';
import { COLORS, SCREEN_W } from './constants';

/**
 * Pantalla "Objetos y peligros": una línea por elemento (icono + frase corta). Todo cabe en una sola
 * pantalla de 224×288: 2 títulos y 24 filas de 9 px, con frases de como mucho 29 caracteres.
 */
export interface LegendEntry {
  id: string;
  /** Texto en mayúsculas sin acentos: NOMBRE: EFECTO (máx. 29 caracteres). */
  text: string;
}

export const LEGEND_ITEMS: LegendEntry[] = [
  { id: 'energizer', text: 'BOLA GRANDE: CAZA FANTASMAS' },
  { id: 'boost', text: 'ZAPATOS ROJOS: VELOCIDAD' },
  { id: 'gun', text: 'PISTOLA: DISPARA 1 MINUTO' },
  { id: 'aleix', text: 'ALEIX: CAZA Y COME PUNTOS' },
  { id: 'aina', text: 'AINA: CAZA Y COME PUNTOS' },
  { id: 'ankh', text: 'ANJ: DESTRUYE FANTASMAS' },
  { id: 'cloak', text: 'MANTO: ERES INVISIBLE' },
  { id: 'mushroom', text: 'SETA: EFECTO EXTRANO' },
  { id: 'portal', text: 'PORTAL: TE TELETRANSPORTA' },
  { id: 'hole', text: 'AGUJERO: SALTO AL AZAR' },
];

export const LEGEND_HAZARDS: LegendEntry[] = [
  { id: 'bomb', text: 'BOMBA: EXPLOTA Y MATA' },
  { id: 'saw', text: 'SIERRA: MATA AL TOCAR' },
  { id: 'turret', text: 'TORRETA: DISPARO MORTAL' },
  { id: 'spikes', text: 'PINCHOS: MATAN AL SALIR' },
  { id: 'gate', text: 'PUERTA: SE ABRE Y CIERRA' },
  { id: 'belt', text: 'CINTA: TE ARRASTRA' },
  { id: 'mud', text: 'BARRO: TE FRENA' },
  { id: 'jelly', text: 'MEDUSA: TE PARALIZA' },
  { id: 'lava', text: 'LAVA: ERUPCION MORTAL' },
  { id: 'ufo', text: 'OVNI: DISPARA SOBRE MUROS' },
  { id: 'boo', text: 'BOO: SI LO MIRAS SE PARA' },
  { id: 'corrupt', text: 'ZONA CORRUPTA: MANDO GIRADO' },
  { id: 'rage', text: 'PLACA ROJA: FANTASMA FURIOSO' },
  { id: 'event', text: 'FENOMENO: EFECTO DE NIVEL' },
];

const TAU = Math.PI * 2;
const ROW = 9;

type Icon = (ctx: CanvasRenderingContext2D, t: number) => void;

const glow = (ctx: CanvasRenderingContext2D, c: string, a = 2): void => {
  ctx.shadowColor = c;
  ctx.shadowBlur = ctx.getTransform().a * a;
};
const circle = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void => {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
};
const line = (ctx: CanvasRenderingContext2D, color: string, w: number, ...pts: number[]): void => {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.stroke();
};
const face = (ctx: CanvasRenderingContext2D, color: string): void => {
  circle(ctx, 0, 0, 3.6, color);
  circle(ctx, -1.2, -0.6, 0.6, '#1a1a2a');
  circle(ctx, 1.2, -0.6, 0.6, '#1a1a2a');
};

/** Iconos diminutos (caben en ≈10×8 px, centrados en el origen). */
const ICONS: Record<string, Icon> = {
  energizer: (ctx) => {
    glow(ctx, '#ffffff', 2);
    circle(ctx, 0, 0, 3.4, '#ffe6a8');
  },
  boost: (ctx) => {
    glow(ctx, '#ff3b30', 2);
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.moveTo(-4, -3);
    ctx.lineTo(0, -3);
    ctx.lineTo(0, 0);
    ctx.lineTo(4, 1);
    ctx.lineTo(4, 3);
    ctx.lineTo(-4, 3);
    ctx.closePath();
    ctx.fill();
  },
  gun: (ctx) => {
    ctx.fillStyle = '#9aa3b5';
    ctx.fillRect(-4.4, -2.4, 8, 2.6);
    ctx.fillStyle = '#5d6577';
    ctx.fillRect(-3.2, -0.2, 2.4, 3.6);
    line(ctx, '#ff9a45', 0.8, 4.4, -1.2, 6, -1.2);
  },
  aleix: (ctx) => face(ctx, FAMILY.aleix.color),
  aina: (ctx) => face(ctx, FAMILY.aina.color),
  ankh: (ctx) => {
    glow(ctx, '#ffd24a', 2);
    ctx.strokeStyle = '#ffd24a';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.ellipse(0, -2.4, 1.6, 2, 0, 0, TAU);
    ctx.moveTo(0, -0.4);
    ctx.lineTo(0, 4);
    ctx.moveTo(-2.6, 1.2);
    ctx.lineTo(2.6, 1.2);
    ctx.stroke();
  },
  cloak: (ctx, t) => {
    ctx.globalAlpha = 0.5 + 0.25 * Math.sin(t / 8);
    ctx.fillStyle = '#b8f0ff';
    ctx.beginPath();
    ctx.arc(0, -0.5, 3.6, Math.PI, 0);
    ctx.lineTo(3.6, 3.4);
    ctx.lineTo(1.8, 2);
    ctx.lineTo(0, 3.4);
    ctx.lineTo(-1.8, 2);
    ctx.lineTo(-3.6, 3.4);
    ctx.closePath();
    ctx.fill();
  },
  mushroom: (ctx) => {
    ctx.fillStyle = '#efe6d2';
    ctx.fillRect(-1.2, 0.4, 2.4, 3.2);
    ctx.fillStyle = '#a24dff';
    ctx.beginPath();
    ctx.ellipse(0, 0.4, 4.2, 3.4, 0, Math.PI, TAU);
    ctx.fill();
    circle(ctx, -1.4, -1.4, 0.6, '#d6ffd0');
    circle(ctx, 1.4, -0.8, 0.5, '#d6ffd0');
  },
  portal: (ctx, t) => {
    glow(ctx, '#27e8ff', 2);
    ctx.strokeStyle = '#27e8ff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, 3.6, 3.6 - Math.abs(Math.sin(t / 12)), 0, 0, TAU);
    ctx.stroke();
    circle(ctx, 0, 0, 1.2, '#b9f6ff');
  },
  hole: (ctx, t) => {
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = Math.floor(t / 6 + i) % 2 ? '#ff3fd2' : '#3ff0ff';
      ctx.fillRect((i % 2) * 3 - 3, Math.floor(i / 2) * 3 - 3, 2.4, 2.4);
    }
  },
  bomb: (ctx, t) => {
    circle(ctx, 0, 0.8, 3.4, '#2a2d40');
    line(ctx, '#d9b36a', 0.8, 1.6, -2, 3, -3.6);
    circle(ctx, 3.2, -3.8, 0.9, Math.floor(t / 5) % 2 ? '#ffe680' : '#ff8a30');
  },
  saw: (ctx, t) => {
    ctx.save();
    ctx.rotate(t / 6);
    ctx.fillStyle = '#d6dbe8';
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const r = i % 2 === 0 ? 4.4 : 3;
      const a = (i / 12) * TAU;
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    circle(ctx, 0, 0, 1, '#3a3f55');
    ctx.restore();
  },
  turret: (ctx) => {
    ctx.fillStyle = '#7a8299';
    ctx.fillRect(-5, -2.6, 3.6, 5.2);
    line(ctx, '#ff5a4a', 1, -1, 0, 5.4, 0);
  },
  spikes: (ctx) => {
    ctx.fillStyle = '#cfd6e6';
    for (const x of [-3.4, 0, 3.4]) {
      ctx.beginPath();
      ctx.moveTo(x - 1.6, 3);
      ctx.lineTo(x, -3);
      ctx.lineTo(x + 1.6, 3);
      ctx.closePath();
      ctx.fill();
    }
  },
  gate: (ctx) => {
    ctx.fillStyle = '#c4894a';
    ctx.fillRect(-4, -3.4, 2, 6.8);
    ctx.fillRect(2, -3.4, 2, 6.8);
    ctx.fillRect(-4, -0.6, 8, 1.4);
  },
  belt: (ctx, t) => {
    ctx.fillStyle = '#4a5068';
    ctx.fillRect(-5, -2, 10, 4);
    line(ctx, '#ffd24a', 1, -3 + ((t / 4) % 3), 0, -1 + ((t / 4) % 3), 0);
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    ctx.moveTo(1.6, -1.6);
    ctx.lineTo(4.4, 0);
    ctx.lineTo(1.6, 1.6);
    ctx.fill();
  },
  mud: (ctx, t) => {
    circle(ctx, 0, 0.6, 4, 'rgba(120,200,90,0.8)');
    circle(ctx, -1.4, 0.8 - ((t / 20) % 2), 0.8, '#dfffd0');
    circle(ctx, 1.6, 0.4 - ((t / 24) % 2), 0.6, '#dfffd0');
  },
  jelly: (ctx, t) => {
    ctx.fillStyle = '#e48ad8';
    ctx.beginPath();
    ctx.ellipse(0, -0.6, 4, 3.2, 0, Math.PI, TAU);
    ctx.fill();
    for (const x of [-2.4, 0, 2.4]) line(ctx, '#ff9ae6', 0.7, x, 0.4, x + Math.sin(t / 6 + x), 3.6);
  },
  lava: (ctx, t) => {
    glow(ctx, '#ff6a14', 2);
    ctx.fillStyle = '#ff6a14';
    ctx.beginPath();
    ctx.ellipse(0, 3, 4.6, 1.4, 0, 0, TAU);
    ctx.fill();
    for (let i = 0; i < 3; i++) circle(ctx, (i - 1) * 2.4, -1 - Math.abs(Math.sin(t / 7 + i)) * 2, 0.9, '#ffd24a');
  },
  ufo: (ctx) => {
    ctx.fillStyle = 'rgba(190,240,255,0.9)';
    ctx.beginPath();
    ctx.ellipse(0, -1.2, 2.2, 2, 0, Math.PI, TAU);
    ctx.fill();
    ctx.fillStyle = '#c9d2e4';
    ctx.beginPath();
    ctx.ellipse(0, 0.6, 5, 2, 0, 0, TAU);
    ctx.fill();
    line(ctx, '#7dff9a', 0.8, 0, 2.6, 0, 4.4);
  },
  boo: (ctx) => {
    circle(ctx, 0, 0, 4.2, '#f4efff');
    circle(ctx, -1.4, -0.8, 0.7, '#1a1a2a');
    circle(ctx, 1.4, -0.8, 0.7, '#1a1a2a');
    ctx.fillStyle = '#6a1030';
    ctx.beginPath();
    ctx.ellipse(0, 1.6, 1.6, 1.1, 0, 0, TAU);
    ctx.fill();
  },
  corrupt: (ctx, t) => {
    for (let i = 0; i < 4; i++) {
      if ((Math.floor(t / 6) + i) % 3 === 0) continue;
      ctx.fillStyle = i % 2 ? '#ff3fd2' : '#3ff0ff';
      ctx.fillRect((i % 2) * 3.4 - 3.4, Math.floor(i / 2) * 3.4 - 3.4, 3.2, 3.2);
    }
  },
  rage: (ctx) => {
    ctx.fillStyle = 'rgba(120,10,30,0.7)';
    ctx.fillRect(-4, -3.4, 8, 6.8);
    ctx.fillStyle = '#ff6a80';
    ctx.beginPath();
    ctx.moveTo(1, -3);
    ctx.lineTo(-1.6, 0.4);
    ctx.lineTo(-0.2, 0.4);
    ctx.lineTo(-1, 3);
    ctx.lineTo(1.6, -0.6);
    ctx.lineTo(0.2, -0.6);
    ctx.closePath();
    ctx.fill();
  },
  event: (ctx, t) => {
    ctx.save();
    ctx.rotate(Math.sin(t / 30) * 0.6);
    ctx.strokeStyle = '#27e8ff';
    ctx.lineWidth = 1;
    ctx.strokeRect(-3, -3, 6, 6);
    ctx.restore();
    circle(ctx, 0, 0, 1, '#27e8ff');
  },
};

/** Dibuja la pantalla completa. `top` es la y de la primera fila. */
export function drawLegend(ctx: CanvasRenderingContext2D, frame: number, top = 30): void {
  let y = top;
  const section = (title: string, color: string) => {
    drawTextCentered(ctx, title, SCREEN_W / 2, y, color);
    y += ROW;
  };
  const rows = (entries: LegendEntry[]) => {
    for (const e of entries) {
      ctx.save();
      ctx.translate(11, y + 4);
      ICONS[e.id]?.(ctx, frame);
      ctx.restore();
      const [name, rest] = e.text.split(': ');
      drawText(ctx, `${name}:`, 22, y, COLORS.ready);
      drawText(ctx, rest ?? '', 22 + (name.length + 2) * 6.6, y, COLORS.text);
      y += ROW;
    }
  };
  section('OBJETOS', '#7fa0ff');
  rows(LEGEND_ITEMS);
  section('PELIGROS', '#ff6a80');
  rows(LEGEND_HAZARDS);
}

/** Filas que ocupa la pantalla (para comprobar que cabe). */
export const LEGEND_ROWS = LEGEND_ITEMS.length + LEGEND_HAZARDS.length + 2;
export const LEGEND_ROW_HEIGHT = ROW;
