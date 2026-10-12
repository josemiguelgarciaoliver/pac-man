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
| Teclado | Flechas / WASD, `P` o `Esc` pausa |
| Táctil | Swipe en cualquier parte de la pantalla |
| Gamepad | D-pad o stick izquierdo, `Start` pausa |

## Estado

Fase 0 y 1 hechas; Fase 2 en curso: laberinto original con paredes procedurales, movimiento
de Pac-Man con cornering, puntos, energizers y puntuación. Aún sin fantasmas ni sonido.
