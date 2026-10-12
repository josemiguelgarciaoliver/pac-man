/** Resolución máxima del lienzo en píxeles físicos (por lado). */
const MAX_PIXELS = 3200;

/**
 * Ajusta el canvas al espacio libre de su contenedor. Como los gráficos son vectoriales, el lienzo
 * se dimensiona en píxeles físicos (con devicePixelRatio) y se dibuja con una transformación
 * de escala: nítido en cualquier pantalla, sin escalado entero obligatorio.
 */
export function fitCanvas(canvas: HTMLCanvasElement, container: HTMLElement, logicalW: number, logicalH: number): void {
  const apply = () => {
    const vw = container.clientWidth;
    const vh = container.clientHeight;
    if (vw === 0 || vh === 0) return;
    const scale = Math.min(vw / logicalW, vh / logicalH);
    const cssW = Math.floor(logicalW * scale);
    const cssH = Math.floor(logicalH * scale);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const k = Math.min((cssW * dpr) / logicalW, MAX_PIXELS / logicalH);
    const w = Math.round(logicalW * k);
    const h = Math.round(logicalH * k);
    // Reasignar width/height borra el lienzo y reinicia el contexto: solo si cambia.
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
  };
  apply();
  new ResizeObserver(apply).observe(container);
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
}
