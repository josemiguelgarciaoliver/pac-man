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
| Teclado | Flechas / WASD, `P` o `Esc` pausa, `M` silencio |
| Táctil | Cruceta virtual o swipe (se cambia con el botón de la barra); botones de pausa, sonido y pantalla completa |
| Gamepad | D-pad o stick izquierdo, `Start` pausa |

## Estado

Fases 0–4 hechas (Fase 4 pendiente de pruebas en dispositivos reales): motor, laberinto original, fantasmas con la IA del arcade,
sonido, gráficos vectoriales, controles táctiles/teclado/gamepad y PWA instalable offline.
Siguiente: sistema de niveles y mundos (Fase 5). Abre `/?touch` en escritorio para ver el diseño táctil.
