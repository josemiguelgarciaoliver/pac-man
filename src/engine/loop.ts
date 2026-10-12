/** Bucle de paso fijo: la lógica corre a `rate` Hz sea cual sea la frecuencia de la pantalla. */
export function startLoop(rate: number, update: () => void, render: () => void): void {
  const dt = 1000 / rate;
  let last = performance.now();
  let acc = 0;
  const frame = (now: number) => {
    // Tras volver de una pestaña en segundo plano, no se acumula una avalancha de ticks.
    acc += Math.min(now - last, 250);
    last = now;
    while (acc >= dt) {
      update();
      acc -= dt;
    }
    render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
