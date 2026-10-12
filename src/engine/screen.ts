/** Resolución máxima del lienzo en píxeles físicos (por lado). */
const MAX_PIXELS = 3200;

/**
 * Ajusta el canvas al tamaño de la ventana. Como los gráficos son vectoriales, el lienzo se
 * dimensiona en píxeles físicos (con devicePixelRatio) y se dibuja con una transformación
 * de escala: nítido en cualquier pantalla, sin escalado entero obligatorio.
 */
export function fitCanvas(canvas: HTMLCanvasElement, logicalW: number, logicalH: number): void {
  const apply = () => {
    const vw = window.visualViewport?.width ?? window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const scale = Math.min(vw / logicalW, vh / logicalH);
    const cssW = Math.floor(logicalW * scale);
    const cssH = Math.floor(logicalH * scale);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const k = Math.min((cssW * dpr) / logicalW, MAX_PIXELS / logicalH);
    canvas.width = Math.round(logicalW * k);
    canvas.height = Math.round(logicalH * k);
  };
  apply();
  window.addEventListener('resize', apply);
  window.visualViewport?.addEventListener('resize', apply);
}
