/**
 * Escala el canvas lógico al tamaño de la ventana. Con espacio de sobra usa
 * múltiplos enteros (píxeles perfectos); en pantallas pequeñas ocupa todo el espacio.
 */
export function fitCanvas(canvas: HTMLCanvasElement): void {
  const apply = () => {
    const vw = window.visualViewport?.width ?? window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    let scale = Math.min(vw / canvas.width, vh / canvas.height);
    if (scale >= 2) scale = Math.floor(scale);
    canvas.style.width = `${Math.floor(canvas.width * scale)}px`;
    canvas.style.height = `${Math.floor(canvas.height * scale)}px`;
  };
  apply();
  window.addEventListener('resize', apply);
  window.visualViewport?.addEventListener('resize', apply);
}
