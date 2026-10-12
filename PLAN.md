# PLAN.md — Remake de PAC-MAN (Namco, 1980)

> Web app jugable en monitor, tablet y móvil. 100 niveles en 10 mundos temáticos, con la mecánica,
> los gráficos y el sonido del arcade original, más mecánicas nuevas en cada nivel.

---

## 0. Visión y principios

| Principio | Qué significa en la práctica |
|---|---|
| **Fidelidad arcade** | Resolución lógica 224×288 (28×36 tiles de 8 px), paredes azules de doble trazo sobre fondo negro, puntos color salmón, *energizers* parpadeantes, fuente de mapa de bits del arcade, HUD con `1UP` / `HIGH SCORE` arriba y vidas/frutas abajo. Velocidades, IA de fantasmas y tiempos idénticos a los de la placa original. |
| **Lo nuevo encaja en el estilo** | Las mecánicas nuevas (cintas, trampas, rescates…) se dibujan con la misma paleta limitada y pixel art de 8×8 / 16×16. Cada mundo cambia el color de las paredes (como hizo *Ms. Pac-Man*), nunca el estilo. |
| **Determinismo** | Simulación a paso fijo de 60 Hz, independiente del framerate, con RNG con semilla. Permite *replays*, tests automáticos y balanceo reproducible. |
| **Pixel-perfect en cualquier pantalla** | Escalado entero con *nearest-neighbor*. El formato vertical del arcade (3:4 aprox.) encaja de forma natural en móvil en vertical. |
| **Datos, no código** | Laberintos, niveles, misiones y curvas de dificultad viven en JSON/ASCII. Añadir un nivel no requiere tocar el motor. |

> **Referencia visual:** la review (flaneur.me.uk) habla del arcade original de 1980, así que esa es la
> versión que se replica (no la de Atari 2600). Si los screenshots muestran otra versión, solo hay que
> cambiar la paleta y los sprites; la arquitectura no varía.

---

## 1. Tecnología elegida

### 1.1 Stack

| Capa | Elección | Por qué |
|---|---|---|
| Lenguaje | **TypeScript** (modo `strict`) | Tipado de las tablas de reglas, entidades y formatos de nivel. Refactors seguros en un proyecto de 100 niveles. |
| Bundler / dev server | **Vite** | Arranque instantáneo, HMR, build optimizado y plugin PWA maduro. |
| Render | **Canvas 2D propio** sobre un *offscreen buffer* de 224×288 escalado al canvas visible | Un juego de tiles de 8 px no necesita WebGL. Así se controla cada píxel y cada frame (clave para la fidelidad), sin la sobrecarga ni las abstracciones de un motor genérico. Opción B si hace falta: **PixiJS v8** (WebGL) para efectos de los mundos tardíos. |
| Audio | **Web Audio API** con una capa fina propia (o **Howler.js**) | Latencia baja, bucles sin cortes (la sirena), cambio de *pitch* de la sirena según los puntos restantes y desbloqueo de audio en iOS. |
| Entrada | **Pointer Events** (táctil/ratón), **KeyboardEvent**, **Gamepad API** | Todo nativo, unificado en una capa `InputManager` → *intent* de dirección. |
| PWA | **vite-plugin-pwa** (Workbox) | Instalable en móvil/tablet, juego offline, pantalla completa y orientación bloqueada. |
| Persistencia | **localStorage** (ajustes) + **IndexedDB** vía `idb-keyval` (progreso, récords, replays) | Sin backend en las primeras fases. |
| Tests | **Vitest** (lógica/IA/simulación), **Playwright** (E2E en Chromium/WebKit/Firefox + emulación móvil) | |
| Calidad | ESLint + Prettier + `tsc --noEmit` en CI | |
| CI/CD | **GitHub Actions** → deploy a **GitHub Pages** | Gratis y cada push a `main` publica una versión jugable. |
| Herramientas | Editor de laberintos web propio (ruta `/editor`, solo en dev) + generador/validador en Node (scripts `tsx`) | Hacen falta para producir 100 laberintos únicos y válidos. |

### 1.2 Descartado (y por qué)
- **Phaser 3**: es potente, pero su física y su *scene manager* estorban para reproducir al frame el movimiento arcade (*cornering*, pausas al comer puntos). Su tamaño también es excesivo.
- **Unity/Godot export web**: binarios pesados, arranque lento en móvil y peor integración PWA.
- **React para el juego**: no aporta nada en el bucle de juego. Los menús se harán con DOM ligero o en el propio canvas.

### 1.3 Estructura del repositorio

```
pac-man/
├─ public/
│  ├─ assets/
│  │  ├─ audio/          # sonidos originales (los aporta el usuario) — ver §5
│  │  ├─ sprites/        # spritesheets PNG (pixel art propio estilo arcade)
│  │  └─ fonts/          # fuente bitmap arcade
│  └─ icons/             # iconos PWA
├─ src/
│  ├─ main.ts
│  ├─ engine/            # loop paso fijo, renderer, escalado, RNG, máquina de estados
│  ├─ input/             # teclado, táctil (swipe + d-pad virtual), gamepad
│  ├─ audio/             # AudioManager, canales, sirena dinámica
│  ├─ game/
│  │  ├─ rules/          # tablas originales: velocidades, tiempos, frutas, puntuación
│  │  ├─ actors/         # Pac-Man, fantasmas (IA), NPCs (Cely, Aina, Aleix)
│  │  ├─ maze/           # carga, render de paredes procedural, grafo de navegación
│  │  ├─ mechanics/      # cintas, trampas, puertas, hielo, teletransportes… (plugins)
│  │  ├─ missions/       # sistema de objetivos
│  │  └─ states/         # attract, menú, intro, jugando, muerte, intermedio, game over
│  ├─ ui/                # HUD, menús, selector de mundos, ajustes
│  └─ data/
│     ├─ family.json     # Cely, Aina, Aleix: nombres, sprites, frases y cartas
│     ├─ worlds/         # world-01.json … world-10.json
│     └─ mazes/          # w01-l01.maze … w10-l10.maze (ASCII)
├─ tools/
│  ├─ maze-generator/    # generador procedural con restricciones arcade
│  ├─ maze-validator/    # conectividad, sin callejones, unicidad (hash), puntos alcanzables
│  └─ editor/            # editor visual de laberintos
├─ tests/ (unit, sim, e2e)
├─ .github/workflows/    # ci.yml, deploy.yml
├─ PLAN.md
└─ README.md
```

---

## 2. Reglas del arcade original que hay que replicar

Esta es la "física" del juego. Se implementa en `game/rules` con tests que la verifican.

- **Rejilla y movimiento:** 28×31 tiles de laberinto. Los actores se mueven por píxel con un acumulador de velocidad (porcentaje de 75,75 px/s ≈ 100 %). Pac-Man hace *cornering*: corta esquinas si se pulsa antes de llegar al centro del tile. Hay *input buffer* para el pre-giro.
- **Pausas al comer:** 1 frame por punto y 3 por energizer (por eso Pac-Man va más lento que los fantasmas en pasillos llenos).
- **IA de fantasmas (objetivo en tile + elección en intersecciones por distancia mínima, desempate ↑ ← ↓ →, sin dar media vuelta):**
  - **Blinky** (rojo): apunta directamente a Pac-Man. Entra en modo *Cruise Elroy* 1 y 2 según los puntos restantes.
  - **Pinky** (rosa): 4 tiles por delante de Pac-Man (incluido el *bug* de desbordamiento hacia arriba-izquierda).
  - **Inky** (cian): vector desde Blinky, duplicado, a 2 tiles por delante de Pac-Man.
  - **Clyde** (naranja): persigue si está a más de 8 tiles y, si no, vuelve a su esquina.
- **Modos:** alternancia *Scatter/Chase* con la tabla por nivel (7/20/7/20/5/20/5/∞ s en el nivel 1, etc.). Al cambiar de modo, los fantasmas invierten la dirección.
- **Asustados (*frightened*):** movimiento pseudoaleatorio con el PRNG original, duración por nivel (6 s → 0 s) y parpadeo de aviso. Puntos encadenados: 200/400/800/1600.
- **Casa de fantasmas:** contadores de puntos por fantasma, contador global tras una muerte y temporizador de salida si Pac-Man deja de comer.
- **Zonas especiales:** los fantasmas van lentos en los túneles y hay 4 tiles "rojos" donde no pueden girar hacia arriba en *Chase/Scatter*.
- **Puntuación:** punto 10, energizer 50, frutas 100–5000 (cereza, fresa, naranja, manzana, melón, galaxian, campana, llave) y vida extra a los 10.000.
- **Secuencias:** música de inicio, animación de muerte, laberinto blanco/azul parpadeante al completarlo e *intermissions* (cutscenes) tras ciertos niveles.

Todas estas tablas se guardan en un `ArcadeTables.ts` y la curva de dificultad (§4.3) las indexa.

---

## 3. Multiplataforma: pantallas y controles

### 3.1 Pantallas
- **Móvil en vertical** (caso principal): el área de juego ocupa el ancho y el d-pad virtual opcional queda debajo.
- **Móvil/tablet en horizontal:** juego centrado y controles táctiles a los lados.
- **Monitor:** juego centrado con escalado entero máximo y marco tipo cabina opcional (bezel). Opcionales: filtro CRT/scanlines (desactivado por defecto) y modo pantalla completa.
- Se usan Fullscreen API, Screen Orientation API (cuando está disponible), Wake Lock API (para que la pantalla no se apague) y `safe-area-inset` para *notches*.

### 3.2 Controles (capa unificada → `DirectionIntent`)
| Entrada | Esquema |
|---|---|
| Teclado | Flechas / WASD, `Enter` para empezar, `P`/`Esc` para pausa, `M` para silenciar |
| Táctil | **Swipe** en cualquier parte de la pantalla (umbral configurable, giro bufferizado) **o** d-pad/joystick virtual (a elegir en ajustes). Respuesta háptica con `navigator.vibrate` donde se pueda. |
| Gamepad | D-pad y stick izquierdo (con zona muerta), `A` para confirmar, `Start` para pausa. *Mapping* estándar y detección hot-plug. |
| Ratón | Solo para menús |

---

## 4. Diseño de contenido: 100 niveles, 10 mundos

### 4.1 Laberintos únicos (100 en total)
- **Formato:** ASCII de 28×31 (`#` pared, `.` punto, `o` energizer, `-` puerta de la casa, `T` túnel y letras para las mecánicas, p. ej. `>` cinta a la derecha o `X` trampa), más un JSON de metadatos.
- **Render procedural de paredes:** las paredes azules de doble trazo con esquinas redondeadas se generan automáticamente desde la rejilla. Así cualquier laberinto nuevo tiene el aspecto del original.
- **Producción:** 1) el generador procedural crea candidatos que respetan las reglas arcade (simetría horizontal opcional, sin callejones sin salida, pasillos de 1 tile, casa de fantasmas, 0–3 túneles); 2) cada uno se cura y retoca a mano en el editor; 3) el **validador en CI** garantiza conectividad, que todos los puntos sean alcanzables, que no haya callejones, que el número de puntos esté en rango y que **ningún laberinto se repita** (hash de la topología, incluidos espejos).
- **Nivel 1 del Mundo 1:** el laberinto original como homenaje (aparece una sola vez).

### 4.2 Sistema de misiones (objetivo por nivel)
| Tipo | Descripción |
|---|---|
| `CLEAR` | Comer todos los puntos (clásico) |
| `RESCUE` | Llegar hasta un personaje encerrado y escoltarlo (te sigue) hasta la salida |
| `REACH` | Llegar a un punto del mapa, a veces con límite de tiempo |
| `COLLECT` | Recoger N objetos (llaves, letras, gemas) |
| `SURVIVE` | Aguantar X segundos |
| `HUNT` | Comer N fantasmas |
| `ESCORT` | Proteger a un NPC que recorre una ruta |
| `BOSS` | Enfrentamiento especial al final de cada mundo |

Un nivel puede combinar un objetivo principal con objetivos secundarios opcionales (estrellas ★ para rejugar).

### 4.3 Curva de dificultad creciente
- **Base:** se usa la tabla arcade original. Se calcula un "nivel arcade equivalente" `A(n)` para el nivel global `n` (1–100) con forma de **diente de sierra ascendente**: crece dentro de cada mundo, baja ligeramente al empezar el siguiente (respiro para aprender la mecánica nueva) y cada mundo arranca más arriba que el anterior.
  - Fórmula orientativa: `A(n) = 1 + (w-1)·2 + (l-1)·0.4 · (1 + w/10)`, limitada a la tabla de 21+ niveles. (`w` = mundo, `l` = nivel dentro del mundo)
- **De ahí salen:** velocidad de Pac-Man y de los fantasmas, duración de *frightened* (llega a 0), umbrales de *Elroy*, tiempos *scatter/chase* y fruta.
- **Escalado de las mecánicas propias:** densidad de trampas, velocidad de las cintas, frecuencia de disparos, tiempo límite de las misiones y laberintos con menos energizers o pasillos más largos.
- **Balanceo:** un bot de simulación *headless* (IA simple de Pac-Man) juega cada nivel miles de veces. Se mide la tasa de victoria y el tiempo medio, y se comprueba que la curva sea monótona dentro de cada mundo.

### 4.4 Historia y mundos

**Hilo narrativo:** el *Fantasma Rey* ha secuestrado a **Cely** (la esposa de Pac-Man) y la ha escondido en el último mundo. Pac-Man, el padre, sale a rescatarla acompañado de sus hijos **Aina** (12) y **Aleix** (8), que lo acompañan en los 100 niveles (ver §4.5). Cada mundo termina con un jefe, un *recuerdo familiar* como recompensa y una *intermission* animada al estilo de las originales. El nivel 100 culmina con el rescate de Cely.

Cada mundo tiene paleta de pared propia, una mecánica estrella que se introduce y luego se complica, y un jefe o reto final en el nivel 10.

---

#### 🌐 Mundo 1 — **Arcade Clásico** (paredes azules, como el original)
*Motivo: el salón recreativo de 1980. Sirve de tutorial de las reglas originales.*
| Nv | Novedad |
|---|---|
| 1 | Laberinto original de Namco, reglas puras |
| 2 | Primer laberinto nuevo y aparición de la fruta |
| 3 | Dos túneles laterales |
| 4 | Túnel vertical (arriba ↔ abajo) |
| 5 | Misión `COLLECT`: recoger las 4 letras P-A-C-★ ocultas bajo puntos |
| 6 | Casa de fantasmas descentrada |
| 7 | Energizers que se mueven lentamente por el laberinto |
| 8 | Misión `HUNT`: come 8 fantasmas |
| 9 | Laberinto asimétrico con menos energizers |
| 10 | **Jefe:** Blinky gigante (2×2 tiles) que solo es vulnerable a energizers dobles. Recompensa: recuerdo familiar nº 1 (foto de la playa) |

#### 🌳 Mundo 2 — **Bosque Encantado** (paredes verdes)
*Motivo: naturaleza y visibilidad reducida.*
| Nv | Novedad |
|---|---|
| 11 | Hierba alta: los actores dentro se ven solo como silueta |
| 12 | Setas teletransporte (pares de colores) |
| 13 | Enredaderas que crecen y cierran pasillos cada X segundos |
| 14 | Misión `REACH`: llegar a la cabaña antes de 60 s |
| 15 | Luciérnagas: bonus que ilumina temporalmente a los fantasmas ocultos |
| 16 | Puentes de troncos de un solo sentido |
| 17 | Misión `ESCORT`: guiar a una ardilla por el bosque |
| 18 | Niebla: solo se ve un radio alrededor de Pac-Man |
| 19 | Combinación de setas + niebla |
| 20 | **Jefe:** el Ent-Fantasma, que cambia el laberinto girando bloques. Recompensa: recuerdo familiar nº 2 |

#### 🏭 Mundo 3 — **La Fábrica** (paredes gris acero / naranja)
*Motivo: industria y movimiento forzado.*
| Nv | Novedad |
|---|---|
| 21 | **Cintas transportadoras** que aceleran o frenan según el sentido |
| 22 | Cintas que invierten su sentido periódicamente (con indicador parpadeante) |
| 23 | Prensas hidráulicas que aplastan un tile en ciclos |
| 24 | Puertas automáticas con interruptor (pisar un botón las abre) |
| 25 | Misión `COLLECT`: 5 tuercas para reparar la máquina de salida |
| 26 | Cintas que también arrastran a los fantasmas (se puede usar a favor) |
| 27 | Robots soldadores: chispas que bloquean un pasillo temporalmente |
| 28 | Misión `RESCUE`: liberar a un operario de una jaula y llevarlo a la salida |
| 29 | Laberinto en "líneas de montaje" con cintas en cadena |
| 30 | **Jefe:** la Gran Trituradora, que avanza de un lado a otro y empuja el laberinto. Recompensa: recuerdo familiar nº 3 |

#### ❄️ Mundo 4 — **Polo Helado** (paredes cian / blanco)
*Motivo: inercia y superficies cambiantes.*
| Nv | Novedad |
|---|---|
| 31 | **Hielo:** Pac-Man resbala hasta la siguiente intersección sin poder parar |
| 32 | Los fantasmas también resbalan (cambia su IA) |
| 33 | Bloques de hielo que se derriten y abren nuevos caminos con el tiempo |
| 34 | Ventisca: viento lateral que empuja en un eje |
| 35 | Misión `SURVIVE`: 90 s con viento cambiante |
| 36 | Pingüino aliado que, al tocarlo, congela a un fantasma |
| 37 | Hielo fino: se rompe tras pasar dos veces y se convierte en pared |
| 38 | Misión `REACH`: llegar al iglú con ventisca |
| 39 | Energizers congelados (hay que pasar 3 veces para liberarlos) |
| 40 | **Jefe:** el Yeti-Fantasma, que lanza bolas de nieve en línea recta. Recompensa: recuerdo familiar nº 4 |

#### 🏜️ Mundo 5 — **Pirámides del Desierto** (paredes doradas)
*Motivo: secretos, oscuridad y trampas antiguas.*
| Nv | Novedad |
|---|---|
| 41 | Arenas movedizas: zonas que ralentizan a todos |
| 42 | Paredes falsas: algunos muros se pueden atravesar (pistas visuales sutiles) |
| 43 | Interiores oscuros: Pac-Man lleva una antorcha con radio de visión |
| 44 | Trampas de dardos: paredes que disparan en línea al pasar (con aviso de 0,5 s) |
| 45 | Misión `COLLECT`: 3 jeroglíficos que abren la cámara |
| 46 | Escarabajos-puntos que huyen de Pac-Man |
| 47 | Tormenta de arena que borra temporalmente parte del laberinto |
| 48 | Momia-fantasma extra (lento pero invulnerable a los energizers) |
| 49 | Misión `RESCUE` en una cámara sellada con temporizador |
| 50 | **Jefe:** el Faraón Fantasma, que invoca momias y sella pasillos. Recompensa: recuerdo familiar nº 5 |

#### 🌊 Mundo 6 — **Fondo Marino** (paredes azul turquesa)
*Motivo: corrientes y oxígeno.*
| Nv | Novedad |
|---|---|
| 51 | Corrientes marinas (cintas "suaves" que no bloquean el giro) |
| 52 | **Barra de oxígeno:** hay que pasar por burbujas para rellenarla |
| 53 | Medusas que flotan y paralizan 1 s |
| 54 | Remolinos que teletransportan a un punto aleatorio (de una lista) |
| 55 | Misión `ESCORT`: un caballito de mar hasta su arrecife |
| 56 | Almejas: energizers que se abren y cierran |
| 57 | Laberinto que sube y baja con la marea (filas que se inundan/secan) |
| 58 | Misión `COLLECT`: perlas en tiempo límite |
| 59 | Corrientes + oxígeno + medusas combinados |
| 60 | **Jefe:** el Kraken-Fantasma, cuyos tentáculos barren filas del laberinto. Recompensa: recuerdo familiar nº 6 |

#### 🌋 Mundo 7 — **Volcán** (paredes rojo / magma)
*Motivo: peligro ambiental y suelo que desaparece.*
| Nv | Novedad |
|---|---|
| 61 | Géiseres de lava que entran en erupción en ciclos (avisan con burbujas) |
| 62 | Suelo que se derrumba tras pasar y se convierte en hueco |
| 63 | Ríos de lava con puentes que suben y bajan |
| 64 | **Torretas de fuego** que disparan bolas en línea recta |
| 65 | Misión `SURVIVE`: escapar de la lava que sube por filas |
| 66 | Fantasmas de fuego que dejan un rastro ardiente temporal |
| 67 | Misión `REACH`: cima del volcán con ruta cambiante |
| 68 | Rocas rodantes que recorren pasillos largos |
| 69 | Combinación de torretas + derrumbes |
| 70 | **Jefe:** el Dragón de Magma, con ataques en patrón y fases. Recompensa: recuerdo familiar nº 7 |

#### 🚀 Mundo 8 — **Estación Espacial** (paredes violeta / neón)
*Motivo: física espacial y tecnología.*
| Nv | Novedad |
|---|---|
| 71 | Gravedad baja: Pac-Man "flota" y se desliza a medio tile |
| 72 | Agujeros de gusano bidireccionales |
| 73 | Láseres de seguridad que se encienden y apagan (patrones rítmicos) |
| 74 | Escudo recogible (aguanta un golpe) |
| 75 | Misión `COLLECT`: células de energía para reactivar el teletransportador de salida |
| 76 | Laberinto que **rota 90°** en un momento dado (controles relativos) |
| 77 | Drones que patrullan rutas fijas |
| 78 | Misión `RESCUE`: astronauta a la deriva |
| 79 | Gravedad invertida por zonas |
| 80 | **Jefe:** la Nave Nodriza Fantasma, que lanza fantasmas por oleadas. Recompensa: recuerdo familiar nº 8 |

#### 🏰 Mundo 9 — **Castillo Fantasma** (paredes gris piedra / morado)
*Motivo: el hogar de los fantasmas, con trampas y llaves.*
| Nv | Novedad |
|---|---|
| 81 | Puertas con llave de colores (llave roja abre puerta roja) |
| 82 | **Torretas de ballesta** con disparos dirigidos (apuntan a Pac-Man) |
| 83 | Fantasmas invisibles que solo se ven al estar cerca o tras un energizer |
| 84 | Rastrillos (portcullis) que caen al pasar ciertas casillas |
| 85 | Misión `HUNT` con fantasmas que reviven más rápido |
| 86 | Espejos: la IA de los fantasmas apunta al reflejo de Pac-Man |
| 87 | Pasadizos secretos tras cuadros (paredes falsas mejoradas) |
| 88 | 6 fantasmas en lugar de 4 (aparecen los fantasmas extra *Sue* y *Funky*) |
| 89 | Misión `ESCORT` del último rehén por el castillo |
| 90 | **Jefe:** el Fantasma Rey (fase 1), con patrón de laberinto cambiante. Recompensa: recuerdo familiar nº 9 |

#### 👾 Mundo 10 — **El Núcleo Glitch** (paleta que se corrompe, homenaje al *kill screen* del nivel 256)
*Motivo: todo lo aprendido, mezclado y corrompido.*
| Nv | Novedad |
|---|---|
| 91 | Tiles corruptos que cambian de tipo (pared ↔ pasillo) de forma aleatoria con semilla |
| 92 | Mezcla: cintas + hielo |
| 93 | Mezcla: oscuridad + torretas |
| 94 | Pac-Man espejo que copia tus movimientos invertidos (y mata si lo tocas) |
| 95 | Misión `REACH` con el laberinto reescribiéndose detrás de ti |
| 96 | Velocidad máxima arcade y *frightened* = 0 |
| 97 | Gravedad + lava + oxígeno |
| 98 | Misión `SURVIVE` contra 8 fantasmas |
| 99 | La mitad derecha del laberinto "rota" como en el nivel 256 original, y hay que limpiarla |
| 100 | **Jefe final:** el Fantasma Rey (forma definitiva) en 3 fases. **Rescate de Cely**, reencuentro de toda la familia, cutscene final y créditos |

> **Extra post-juego (opcional):** modo "Arcade Infinito" (laberinto original y reglas puras), *Time Attack* por nivel con ★, y desbloqueo de un filtro CRT/cabina.


### 4.5 Temática familiar: Cely, Aina y Aleix (transversal a los 100 niveles)

La familia no es un adorno de un mundo: está presente en **todos** los niveles, con el mismo lenguaje visual arcade (sprites de 16×16 de pocos colores).

| Personaje | Rol | Aspecto (ajustable en `data/family.json`) |
|---|---|---|
| **Cely** (esposa) | Objetivo final del juego. Aparece en cada nivel como **mensajes y cartas** que manda a Pac-Man y como *cameo* secreto; se la rescata en el nivel 100. | Pac-Man amarillo con lazo (al estilo Ms. Pac-Man) |
| **Aina** (hija, 12 años) | **Navegante:** ayudante con la habilidad *Pista*. Una vez por nivel (se recarga al comer una fruta) marca durante 3 s la ruta hacia el objetivo de la misión. | Pac-Man pequeño con coletas o gafas |
| **Aleix** (hijo, 8 años) | **Travieso:** ayudante con la habilidad *Señuelo*. Una vez por nivel deja un juguete que despista unos segundos a los fantasmas más cercanos. | Pac-Man pequeño con gorra |

**Presencia en cada nivel**
1. **Tarjeta de inicio** ("NIVEL 1-1") con una frase corta de la familia (100 frases, varias por mundo, en `data/family.json`; editables y traducibles).
2. **Ayudantes en pantalla:** Aina y Aleix aparecen en el HUD inferior con el estado de sus habilidades (listo/recargando). En táctil son dos botones grandes bajo el laberinto; en teclado `Z` y `X`; en mando, `X` e `Y`.
3. **Cameo de Cely:** en cada nivel hay un objeto oculto (un lazo ♥) que, si se encuentra, suma bonus y desbloquea una carta de Cely en el **Álbum familiar**.
4. **Fruta = foto familiar:** la fruta de bonus de cada nivel se dibuja como una foto familiar distinta (misma puntuación que la fruta arcade).
5. **Intermissions:** las cutscenes entre mundos protagonizadas por la familia (parodia de las intermissions originales: Aleix persiguiendo a Aina por la pantalla, etc.).
6. **Recuerdos de los jefes:** al derrotar al jefe de cada mundo se desbloquea un *recuerdo familiar* (9 en total, más el reencuentro final) en el Álbum.
7. **Álbum familiar:** pantalla del menú con las fotos, cartas de Cely y logros desbloqueados. Es lo que da sentido a rejugar niveles.
8. **Final:** el nivel 100 termina con Cely rescatada y la familia reunida; los créditos incluyen una dedicatoria personalizable.

**Reglas de diseño:** los ayudantes nunca vuelven trivial el juego (una carga por nivel, sin efecto sobre jefes en su fase final y desactivables en "modo clásico"). La familia no sustituye a los personajes del arcade: Pac-Man y los fantasmas conservan su aspecto original.
---

## 5. Gráficos y sonido

### 5.1 Gráficos
- **Sprites de 16×16** con el número de frames del original (Pac-Man con 3 frames de boca × 4 direcciones; fantasmas con 2 frames de "faldón", ojos por dirección, versión asustada azul/blanca y solo ojos).
- **Paleta:** la del arcade (16 colores base). Cada mundo añade sus propios colores de pared y de *hazard*.
- **Fuente bitmap 8×8** estilo arcade para el HUD y los menús.
- **Animaciones:** parpadeo de energizers, laberinto que parpadea al completarlo, muerte de Pac-Man (11 frames) y puntos flotantes al comer fantasmas o fruta.
- **Gráficos vectoriales suaves** (decisión posterior): sprites, frutas y texto se dibujan con paths, degradados y brillos a la resolución real de la pantalla; paredes con trazo luminoso y esquinas redondeadas generadas a partir del mapa. Mantienen el diseño del arcade pero sin aspecto pixelado. No se extraen ROMs (ver §9).

### 5.2 Audio (assets los aporta el usuario)
Nombres esperados en `public/assets/audio/`:

| Archivo | Uso |
|---|---|
| `start.ogg/.mp3` | Música de inicio de partida |
| `waka_a`, `waka_b` | Comer puntos (alternando) |
| `siren_1` … `siren_5` | Sirena de fondo (sube de tono según los puntos restantes) |
| `power_pellet` | Bucle mientras los fantasmas están asustados |
| `eat_ghost` | Comer fantasma |
| `eyes` | Bucle de ojos volviendo a casa |
| `eat_fruit` | Fruta |
| `extra_life` | Vida extra |
| `death` | Muerte de Pac-Man |
| `intermission` | Cutscene |
| `credit` | Moneda/insertar crédito (en el menú) |

- Prioridad de canales como en el original (los ojos tapan al *power pellet*, que tapa a la sirena).
- Sonidos nuevos para las mecánicas (cinta, disparo, lava…) **sintetizados con Web Audio** en estilo chiptune para que encajen con el original.
- Formatos OGG + MP3 de respaldo (Safari) y desbloqueo del `AudioContext` en el primer toque.

---

## 6. Fases de desarrollo

Cada fase acaba en un hito jugable y desplegado en GitHub Pages.

### Fase 0 — Preparación del proyecto
- [~] Repositorio público `pac-man` en GitHub, `README.md`, `.gitignore`, licencia del código.
- [x] Vite + TypeScript estricto + Vitest (pendiente: ESLint, Prettier, Playwright).
- [x] GitHub Actions: lint + typecheck + tests en cada PR; deploy a Pages en `main`.
- **Hito:** página "INSERT COIN" desplegada.

### Fase 1 — Motor base
- [x] Bucle de paso fijo de 60 Hz con acumulador e interpolación de render.
- [x] Canvas lógico de 224×288 y escalado entero responsive (resize, DPR, orientación).
- [ ] Cargador de assets (sprites, fuente bitmap, audio) con pantalla de carga.
- [ ] Máquina de estados del juego (Boot → Attract → Menú → Intro → Juego → Muerte → Nivel completo → Game Over).
- [ ] RNG con semilla y sistema de grabación/reproducción de inputs (replays).
- [x] `InputManager` unificado (teclado, táctil y gamepad básicos).
- **Hito:** Pac-Man se mueve por una rejilla de prueba.

### Fase 2 — Pac-Man arcade fiel (laberinto original)
- [x] Parser de laberintos ASCII y **render procedural de paredes** al estilo original.
- [ ] Movimiento de Pac-Man: velocidades por tabla, *cornering*, buffer de giro y pausas al comer.
- [x] Los 4 fantasmas con su IA exacta, modos *scatter/chase/frightened/eaten*, casa y contadores, *Elroy*, túnel lento y zonas sin giro hacia arriba.
- [x] Puntuación, frutas, vidas, vida extra, récord y HUD (frutas con sprites provisionales).
- [~] Secuencias: muerte y nivel completado hechas; pendiente: *intermissions*.
- [~] Tests de simulación contra comportamientos conocidos (hechos: objetivos de IA, tablas, zonas sin giro; pendiente: trazas frame a frame).
- **Hito:** clon del arcade jugable de principio a fin, sin sonido.

### Fase 3 — Audio
- [x] `AudioManager` con Web Audio: efectos WAV originales + sirena/asustados/ojos sintetizados con prioridades (bucles sin cortes y sirena por etapas).
- [x] Integración de los assets del usuario (7 WAV de classicgaming.cc); sirena, power pellet y ojos sintetizados.
- [~] Silencio con la tecla M (guardado); pendiente: ajustes de volumen y botón táctil de mute.
- **Hito:** experiencia audiovisual idéntica al arcade.

### Fase 4 — Multiplataforma y PWA
- [x] Controles táctiles: swipe + cruceta virtual (arrastrable) conmutables, botones de pausa/sonido/pantalla completa y vibración.
- [x] Gamepad API: d-pad, stick izquierdo (zona muerta) y botones A/Start; detección automática (pendiente: remapeo).
- [x] Layouts: móvil vertical (barra inferior), horizontal/tablet (controles sobre los márgenes) y escritorio (botones discretos). Pendiente: bezel opcional y filtro CRT.
- [x] Pantalla completa, Wake Lock, pausa automática al perder el foco y *safe areas*. (Bloqueo de orientación descartado: el juego se adapta a ambas.)
- [x] PWA: manifest, iconos, service worker propio (sin dependencias) y juego offline.
- [ ] Pruebas en dispositivos reales: iOS Safari, Android Chrome y escritorio (verificado solo en Chrome de escritorio con emulación de diseño táctil; falta probar en móviles reales).
- **Hito:** el juego se instala y se juega bien en móvil, tablet y PC.

### Fase 5 — Sistema de niveles y herramientas
- [x] Esquema de nivel validado con **Zod** (`level/schema.ts`): laberinto, paleta, misión y mecánicas; los 100 niveles se construyen y validan en los tests.
- [x] Curva de dificultad en diente de sierra `arcadeEquivalent(n)` (`level/curve.ts`) + tres niveles de dificultad (Fácil por defecto, Normal, Arcade) elegibles en el título.
- [x] **Generador procedural** de laberintos (`maze/generator.ts`): banda central del original + zonas generadas con tramos parciales, sin callejones ni macizos de pared. Banda central compartida (limitación conocida).
- [x] **Validador** (conectividad, callejones, 2×2, simetría, puntos, calidad estética, unicidad y distancia mínima de 30 casillas entre laberintos); corre en CI como parte de `npm test`.
- [ ] **Editor visual** de laberintos y mecánicas (`/editor`, solo en dev) con prueba instantánea. *(Pendiente)*
- [~] Sistema de **misiones**: hechas CLEAR, COLLECT, REACH, RESCUE, HUNT y SURVIVE (con tarjeta de objetivo, progreso en pantalla y límite de tiempo). Pendientes: ESCORT y BOSS.
- [x] **Temática familiar** (§4.5): frases por nivel en `data/family.ts`, tarjeta de inicio, Pista de Aina (Z / botón / mando X) y Señuelo de Aleix (X / botón / mando Y) con una carga por nivel, y final con Cely. Pendiente: objeto oculto de Cely y cartas (con el Álbum, Fase 6).
- [x] Framework de **mecánicas como plugins** (`mechanics/`): interfaz `Mechanic` + primera mecánica, las cintas transportadoras (opcionalmente invertibles y que arrastran a los fantasmas).
- [~] Bot de simulación *headless* (`tests/sim.test.ts`): juega 6000 ticks en 17 niveles comprobando que nadie atraviesa paredes (ya encontró y corrigió un fallo de las cintas). Pendiente: estadísticas de victoria para balancear.
- **Hito:** conseguido: los niveles 21–29 (cintas), 25 (tuercas), 28 (cintas + RESCUE) y otros se cargan 100 % desde datos.

### Fase 6 — Progresión, menús y persistencia
- [ ] Menú principal, mapa de mundos (estilo arcade), selector de niveles y estrellas ★.
- [ ] Guardado de progreso, récords por nivel y ajustes (IndexedDB/localStorage).
- [ ] Sistema de *cutscenes* para la historia (intermissions al estilo original).
- [ ] **Álbum familiar** (fotos, cartas de Cely, recuerdos de jefes) y desbloqueos persistentes.
- [ ] Pausa, reintentar y continuar (vidas por mundo).
- **Hito:** el bucle completo de juego funciona con niveles de prueba.

### Fase 7 — Contenido: Mundos 1–3
- [ ] 30 laberintos (generados, curados y validados).
- [ ] Mecánicas: letras, energizers móviles, jefe Blinky gigante, hierba alta, setas, enredaderas, niebla, puentes, cintas, prensas, puertas/botones, soldadores y trituradora.
- [ ] Jefes de los mundos 1–3 y *cutscenes* de rescate.
- [ ] Pase de balanceo con el bot y prueba de juego humana.
- **Hito:** primera "temporada" completa (30 niveles), versión **beta pública**.

### Fase 8 — Contenido: Mundos 4–6
- [ ] 30 laberintos.
- [ ] Mecánicas: hielo/inercia, viento, hielo fino, arenas, paredes falsas, oscuridad, dardos, momia, corrientes, oxígeno, medusas, remolinos y marea.
- [ ] Jefes 4–6 y *cutscenes*.
- **Hito:** 60 niveles jugables.

### Fase 9 — Contenido: Mundos 7–10
- [ ] 40 laberintos.
- [ ] Mecánicas: lava, derrumbes, torretas (rectas y dirigidas), rocas, gravedad, láseres, rotación del laberinto, drones, llaves/puertas, invisibilidad, espejos, 6–8 fantasmas, tiles glitch y Pac-Man espejo.
- [ ] Jefes 7–10, final y créditos.
- **Hito:** los 100 niveles completos.

### Fase 10 — Pulido, QA y lanzamiento
- [ ] Balanceo global de la curva con datos del bot y de *playtesters*.
- [ ] Rendimiento: 60 fps estables en móviles de gama media y tamaño del bundle inicial < 1 MB (carga diferida de mundos).
- [ ] Accesibilidad: remapeo de teclas, modo daltónico para las mecánicas nuevas (sin tocar los colores originales), reducción de parpadeos y ajuste de velocidad opcional ("modo asistido").
- [ ] Tests E2E en varios navegadores y dispositivos y corrección de bugs.
- [ ] Modos extra: Arcade Infinito y Time Attack.
- [ ] README final, capturas y versión `v1.0.0` publicada.
- **Hito:** lanzamiento.

### Mejoras futuras (fuera de alcance v1)
- Clasificación online (backend ligero: Supabase/Firebase).
- Editor de niveles para jugadores y compartir niveles por URL.
- Multijugador local alternado (1UP/2UP como el original).

---

## 7. Estrategia de pruebas
- **Unitarias:** tablas de reglas, IA de objetivos por fantasma, *pathfinding* y parser de laberintos.
- **Simulación determinista:** replays grabados que deben producir el mismo estado final (detecta regresiones de mecánica).
- **Validación de contenido en CI:** los 100 laberintos son válidos y únicos, y cada nivel se puede completar (el bot lo supera al menos una vez con semilla fija).
- **E2E (Playwright):** arranque, menú, partida corta, controles táctiles emulados y PWA offline.
- **Manual:** checklist por dispositivo (iPhone, Android, iPad, PC con mando).

---

## 8. Riesgos y mitigaciones
| Riesgo | Mitigación |
|---|---|
| Producir 100 laberintos de calidad lleva mucho tiempo | Generador + editor + validador desde la fase 5. Se producen por mundos. |
| La fidelidad arcade es difícil de verificar | Documentación de referencia (*The Pac-Man Dossier*) y tests de simulación frame a frame. |
| Audio en iOS (autoplay y latencia) | Desbloqueo en el primer gesto, Web Audio en lugar de `<audio>` y bucles precargados. |
| Controles táctiles imprecisos | Buffer de giro generoso, swipe en toda la pantalla y d-pad opcional, probados pronto en dispositivo real (fase 4). |
| Mecánicas nuevas que rompan el "feel" arcade | Cada mecánica se aísla como plugin, se introduce sola en su nivel y se combina después. |
| Alcance excesivo | El contenido va por fases (7–9) y cada fase es un juego publicable por sí mismo. |

---

## 9. Nota legal
*PAC-MAN* y sus personajes son marcas registradas de **Bandai Namco Entertainment**. Este proyecto es un
**fan-game sin ánimo de lucro**. Los sprites se dibujarán a mano (no se extraen de ROMs) y los sonidos
originales los aporta el usuario para uso personal. Si se quisiera distribuir de forma pública o comercial, habría que
sustituir nombres, personajes y audio por versiones propias. La arquitectura (assets intercambiables) lo permite
sin tocar el código.
