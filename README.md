# PAC-MAN — remake web

Remake del PAC-MAN original de Namco (1980) como web app para monitor, tablet y móvil.
100 niveles en 10 mundos temáticos. Consulta [PLAN.md](PLAN.md) para el diseño y las fases de desarrollo.

> Fan-game sin ánimo de lucro. *PAC-MAN* es marca de Bandai Namco Entertainment.

## Desarrollo

```bash
npm install
npm run dev        # servidor de desarrollo (Vite)
npm test           # tests unitarios (Vitest)
npm run typecheck
npm run build
```

Abre `/?autostart` para saltarte la pantalla de título.

## Controles

| Entrada | Acción |
|---|---|
| Teclado | Flechas / WASD, `P` o `Esc` pausa, `M` silencio, `Z` Pista de Aina, `X` Señuelo de Aleix |
| Táctil | Cruceta virtual o swipe (se cambia con el botón de la barra); botones de pausa, sonido y pantalla completa |
| Gamepad | D-pad o stick izquierdo, `Start` pausa |

## Estado

Fases 0–5 casi completas: motor, fantasmas con la IA del arcade, sonido, gráficos vectoriales, controles táctiles/teclado/gamepad,
PWA offline, 100 niveles en 10 mundos (laberintos únicos generados y validados), misiones, cintas transportadoras y la
temática familiar (Cely, Aina y Aleix). Pendientes: editor de laberintos, jefes, y las mecánicas propias de cada mundo (Fases 7–9).

**Elementos del laberinto:** bombas que derriban paredes, sierras, torretas que disparan de pared a pared, paredes móviles, pinchos, portales, barro, cintas y setas tóxicas que distorsionan la visión, invierten o giran los controles, giran el laberinto o lo dejan a oscuras (ver PLAN.md §4.6).

**Objetos:** zapatillas rojas (supervelocidad 1 min), blaster (disparar 1 min con Espacio), miniaturas de Aleix y Aina que cazan fantasmas, y trampas de furia que aceleran a un fantasma. Las caras de Aleix y Aina se pueden sustituir por fotos en `public/assets/faces/` (`aleix.png`, `aina.png`).

**Mundos:** cada uno tiene su estilo de paredes, suelo, partículas, puntos y laberintos, y hay niveles muy raros (como la sala sin paredes del nivel 9). La dificultad sube sin parar hasta el nivel 100, que es casi imposible.

**Progreso (Fase 6):** menú principal, mapa de mundos, selector de niveles con estrellas (★ completar, ★★ sin perder vidas, ★★★ además rápido), récords por nivel, ajustes, álbum familiar con 20 cartas y recuerdos, escenas entre mundos y menú de pausa con reintento. Las vidas se recargan al empezar cada mundo.

**Checkpoints:** cada 2 niveles completados (2, 4, 6…) el progreso se guarda en el navegador; en el título se elige *Continuar*.

Parámetros útiles: `/?autostart&level=28` empieza en un nivel concreto; `/?touch` fuerza el diseño táctil; `/?quick` salta la tarjeta de nivel; `/?menu=worlds|levels|album|settings` y `/?cutscene=<tick>` abren esas pantallas (pruebas). Teclas: `Z` Aina, `X` Aleix, `Espacio` disparar.

Regenerar los laberintos: `npm run generate:mazes`.
