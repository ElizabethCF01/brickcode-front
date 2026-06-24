# BrickCode — Catálogo de bloques SPIKE Essential

> Documento de investigación y hoja de ruta. Define **qué bloques necesita
> BrickCode** para alinearse con LEGO Education SPIKE Essential, mapeando cada
> categoría contra lo que el engine/intérprete ya soportan hoy y lo que falta
> construir. Punto de partida: el simulador de referencia
> [spike.ahardy.za.net](https://spike.ahardy.za.net)
> ([código: alexandrehardy/lego-spike-simulator](https://github.com/alexandrehardy/lego-spike-simulator))
> y el documento oficial
> [*Coding Blocks Used in LEGO® Education SPIKE™ Essential Lessons*](https://spike.legoeducation.com/essential/help).

---

## Contexto

Hoy BrickCode tiene 6 bloques (`robot_drive_forward`, `robot_drive_backward`,
`robot_turn`, `robot_stop`, `sensor_distance`, `wait_seconds`) más los `controls_*`
y `math_*` nativos de Blockly, todos en una sola categoría **"Mi Robot 🤖"**
([robotBlocks.ts](../src/blocks/definitions/robotBlocks.ts),
[BlockInterpreter.ts](../src/interpreter/BlockInterpreter.ts)). El robot
simulado es un chasis de tracción diferencial con **2 motores + 1 sensor de
distancia frontal** (ray-cast).

SPIKE Essential, en cambio, es un kit distinto. Para que la simulación "se
sienta" como SPIKE Essential necesitamos acercar tanto el **hardware** como la
**paleta de bloques** a ese kit.

### Hardware real de SPIKE Essential (set 45345)

| Pieza | Cantidad | Nota |
|-------|----------|------|
| Hub pequeño (2 puertos A/B) | 1 | Matriz de luz **3×3** a color, 1 botón, giroscopio 6 ejes, altavoz |
| Motor angular pequeño | 2 | Equivalen a los motores de tracción actuales |
| **Sensor de color** | 1 | Sensor estrella del kit: color + luz reflejada |

**SPIKE Essential NO trae sensor de distancia ni de fuerza** — esos son del kit
SPIKE Prime.

### Decisión clave: superset (confirmado)

> ✅ **Camino asumido: _superset_** (recomendado). La usuaria dijo "procedamos"
> sin elegir entre las opciones, así que se tomó la recomendación por defecto;
> reversible si prefiere el camino "fiel a Essential". Fase 1 ya implementada
> sobre esta base (ver "Estado actual" más abajo).

Mantener el **sensor de distancia actual** (es el sensor de SPIKE Prime, un
"modelo posterior" que igual querremos soportar) y **añadir encima** el hardware
de Essential (sensor de color + matriz 3×3). No se rompe nada, `challenge-01`
sigue vivo, y el código que funciona se reutiliza. La alternativa "fiel a
Essential" (retirar distancia, reconstruir todo alrededor del color) es más
purista pero descarta trabajo hecho y rompe el reto 01.

---

## Estado actual (Fase 1 implementada)

Vertical slice fiel a Essential, sin tocar la física y 100 % testeable en headless:

| Categoría | Bloque (BrickCode) | Notas |
|-----------|--------------------|-------|
| **Eventos** | `event_when_started` — "Al empezar el programa" (hat) | No-op cabecera; el intérprete sigue con `getNextBlock()` |
| **Movimiento** | `robot_move_for` — "Mover [adelante/atrás] por N [rotaciones/grados/segundos]" | Convierte la cantidad en duración a `MOVE_SPEED_DEG_S = 180` |
| **Movimiento** | `robot_drive_forward/backward`, `robot_turn`, `robot_stop` | Previos, recolocados en la categoría |
| **Motores** | `motor_run_for` — "Motor [A/B] girar [→/←] por N [rotaciones/grados/segundos]" | `motorsByPort` (A→left, B→right) en **`SimpleRobot` y `DynamicRobot`** |
| **Motores** | `motor_start`, `motor_stop_port` | Arranque continuo / parar por puerto |
| **Motores** | `motor_position` (reporter) — "Posición del motor [A/B] (grados)" | Lee `LegoMotor.getAngle()` |
| **Luz (3×3)** | `light_display_matrix` — **editor de píxeles 3×3 dibujable** dentro del bloque (estilo SPIKE) | Plugin oficial `@blockly/field-bitmap` (Apache-2.0); valor `number[][]` 0/1 → patrón |
| **Luz (3×3)** | `light_display_image` (corazón, cara, cuadrado, equis, flecha, lleno) | Presets en `PRESET_IMAGES` (atajo rápido) |
| **Luz (3×3)** | `light_set_pixel` — fila/columna (1-3) + brillo (0-100) | 1-based → 0-based en el intérprete |
| **Luz (3×3)** | `light_off` — apagar pantalla | |
| **Sonido** | `sound_beep`, `sound_play_note` (Do-Si), `sound_stop` | `ISound` → `HubSound` (WebAudio, oscilador) |
| **Sensores** | `sensor_distance` (superset) | Solo si el robot tiene sensor |
| **Operadores** | `operator_random` — "número aleatorio entre N y M" | En `evaluateValue`; en categoría Matemáticas |
| **Control** | `controls_if` con rama **else / else-if** | El intérprete ahora recorre `IF0..n` + `ELSE` |
| **Tiempo/Control** | `wait_seconds`, `controls_repeat/whileUntil`, `math_*`, `logic_compare` | Previos |

**Cableado:**

- **Bloques + toolbox** ([robotBlocks.ts](../src/blocks/definitions/robotBlocks.ts)):
  toolbox reestructurado de la única categoría "Mi Robot" a categorías estilo
  SPIKE (Eventos · Movimiento · Luz · Sensores · Tiempo) con la paleta de colores SPIKE.
- **Intérprete** ([BlockInterpreter.ts](../src/interpreter/BlockInterpreter.ts)):
  casos nuevos `robot_move_for`, `event_when_started`, `light_*`, `motor_*`,
  `sound_*`; `operator_random` y `motor_position` en `evaluateValue`; `controls_if`
  ampliado con else/else-if. Inyección por constructor:
  `new BlockInterpreter(robot, hub?, sound?)`.
- **Matriz 3×3**: interfaz `IHub` → `HubLights`
  ([HubLights.ts](../src/engine/HubLights.ts)) escribe en
  `simulationStore.hubMatrix` → lo pinta `HubMatrixPanel.tsx` como overlay del
  canvas. Sin Three.js/WebGL, por eso corre en Vitest con un `mockHub`.
- **Sonido**: interfaz `ISound` → `HubSound`
  ([HubSound.ts](../src/engine/HubSound.ts)), oscilador WebAudio con
  `AudioContext` perezoso (la primera nota nace del gesto del botón Run).
- **Motores por puerto**: `SimpleRobot.motorsByPort` (A→left, B→right) usando los
  motores crudos (sin la inversión de `motors.left`); el dropdown de dirección del
  bloque decide el signo.
- **Tests**: 20 casos nuevos en
  [blockInterpreter.test.ts](../tests/interpreter/blockInterpreter.test.ts)
  (move_for, light, hat, motor×5, sound×4, operator_random, if/else×2). 42 en total.

---

## Taxonomía oficial de bloques (SPIKE Essential)

Categorías confirmadas por el PDF de LEGO Education y por el toolbox del
simulador de referencia (que usa los opcodes oficiales `flipper*`):

| Categoría | Propósito | Color SPIKE |
|-----------|-----------|-------------|
| **Motor** | Controlar **un** motor por puerto (girar, ir a posición, velocidad) | `#0090f5` azul |
| **Movimiento** | Controlar **los dos** motores como par (avanzar, girar, dirigir) | `#ff4ccd` rosa |
| **Luz (3×3)** | Encender/animar la matriz 3×3, imágenes, texto, brillo, píxeles | `#9b6af6` violeta |
| **Sonido** | Pitidos, sonidos, volumen | `#c061f1` magenta |
| **Eventos** | Disparar programas (al iniciar, al detectar color, al inclinar…) | `#f5c402` amarillo |
| **Control** | Esperar, repetir, por siempre, si/si-no, esperar hasta, parar | `#ffb515` ámbar |
| **Sensores** | Leer color/reflexión, inclinación/giroscopio, botón, temporizador | verde |
| **Operadores** | Aritmética, comparación, lógica, aleatorio, texto | verde |
| **Variables** | Crear/usar variables y listas | naranja |

(Display y Bar Graph del PDF caen dentro de **Luz** y **Operadores/Variables**.)

---

## Catálogo mapeado a BrickCode

Estado de cada bloque: **✅ existe** · **🟡 mapea a lo existente (extender)** ·
**🔴 nuevo** (necesita engine o motor de ejecución nuevo).

### Movimiento (par de motores) — base ya cubierta

| Bloque SPIKE (opcode) | Equivale en BrickCode | Estado |
|-----------------------|------------------------|--------|
| `flippermove_move` (avanzar N cm/rotaciones) | `robot_drive_forward/backward` | 🟡 extender a unidades cm/rotaciones |
| `flippermove_startMove` (empezar a moverse) | — | 🔴 movimiento continuo sin duración |
| `flippermove_steer` / `startSteer` (dirigir -100..100) | `robot_turn` | 🟡 modelo de "steering" en vez de grados |
| `flippermove_stopMove` | `robot_stop` | ✅ |
| `flippermove_movementSpeed` (fijar velocidad) | param SPEED actual | 🟡 separar en bloque propio |
| `flippermove_setMovementPair` (elegir puertos A+B) | — | 🔴 requiere modelo de puertos |

### Motor (un puerto) — nuevo en el intérprete

| Bloque SPIKE | Descripción | Estado |
|--------------|-------------|--------|
| `flippermotor_motorTurnForDirection` | girar motor X durante N rotaciones/grados/seg | 🔴 control por puerto individual |
| `flippermotor_motorStartDirection` | arrancar motor X en una dirección | 🔴 |
| `flippermotor_motorGoDirectionToPosition` | ir a posición absoluta | 🔴 necesita lectura de ángulo (ya existe `getAngle()` en LegoMotor) |
| `flippermotor_motorStop` | parar motor X | 🔴 |
| `flippermotor_motorSetSpeed` | fijar velocidad de motor X | 🔴 |
| `flippermotor_absolutePosition` / `speed` (reporters) | leer posición/velocidad | 🔴 reporters por puerto |

> Requiere un **modelo de puertos** ("A", "B") en el robot. Hoy el intérprete
> solo conoce `motors.left` / `motors.right`. Añadir un mapa
> `motorsByPort: Record<string, IMotor>` cubre ambos mundos.

### Sensores

| Bloque SPIKE | Hardware | Estado |
|--------------|----------|--------|
| `flippersensors_distance` / `isDistance` | (Prime) sensor distancia | ✅ `sensor_distance` ya existe; falta variante booleana `isDistance` 🟡 |
| `flippersensors_color` / `isColor` | **sensor de color** | 🔴 nuevo: objetos coloreados en escena + detección |
| `flippersensors_reflectivity` / `isReflectivity` | sensor de color (luz reflejada) | 🔴 |
| `flippersensors_isTilted` / `orientationAxis` / `ismotion` | giroscopio del hub | 🔴 leer orientación del cuerpo del chasis (Rapier ya da la rotación) |
| `flippersensors_buttonIsPressed` | botón del hub | 🔴 entrada de UI |
| `flippersensors_timer` / `resetTimer` | temporizador | 🔴 trivial (reloj del intérprete) |

### Luz 3×3 + Display — subsistema nuevo, alto valor pedagógico

| Bloque SPIKE | Estado |
|--------------|--------|
| `flipperlight_lightDisplayImageOnForTime` / `ImageOn` / `Off` | 🔴 render de matriz 3×3 en la cara del hub |
| `flipperlight_lightDisplayText` | 🔴 |
| `flipperlight_lightDisplaySetPixel` / `SetBrightness` / `Rotate` | 🔴 |
| `flipperlight_centerButtonLight` | 🔴 |

> Sin riesgo de física, autocontenido. Se puede renderizar como textura/plano
> sobre el mesh del hub (similar a la `DataTexture` de [Baseplate.ts](../src/engine/components/Baseplate.ts)).

### Sonido — subsistema nuevo (solo navegador)

| Bloque SPIKE | Estado |
|--------------|--------|
| `flippersound_beep` / `beepForTime` / `playSound` / `stopSound` | 🔴 WebAudio; mockear/skipear en tests headless |

### Eventos (bloques "sombrero") — cambia el modelo de ejecución

| Bloque SPIKE | Estado |
|--------------|--------|
| `flipperevents_whenProgramStarts` | 🟡 mapea limpio al `getTopBlocks()` actual |
| `flipperevents_whenColor` / `whenPressed` / `whenTilted` / `whenButton` / `whenTimer` / `whenCondition` | 🔴 requiere ejecución **concurrente disparada por condición** |
| `event_broadcast` / `whenbroadcastreceived` | 🔴 mensajes entre pilas |

> El intérprete actual ejecuta cada pila superior **una vez, de arriba abajo**
> ([BlockInterpreter.run](../src/interpreter/BlockInterpreter.ts)). Los eventos
> condicionales necesitan vigilar condiciones cada frame y lanzar pilas
> concurrentes — es un cambio de arquitectura, no "un bloque más".

### Control / Operadores / Variables — mayormente ya en Blockly

| Bloque SPIKE | BrickCode | Estado |
|--------------|-----------|--------|
| `control_wait` | `wait_seconds` | ✅ |
| `control_repeat` / `forever` / `repeat_until` / `wait_until` | `controls_repeat_ext`, `controls_whileUntil` | ✅ (ya interpretados) |
| `control_if` / `control_if_else` | `controls_if` | 🟡 falta rama `else` en el intérprete |
| `flippercontrol_stop` | `robot_stop` ~ | 🟡 |
| `operator_add/subtract/.../lt/equals/gt/and/or/not` | `math_arithmetic`, `logic_compare` | 🟡 ya parcial en `evaluateValue` |
| `operator_random` | — | 🔴 trivial |
| Variables | nativo Blockly | 🔴 no interpretadas aún |

---

## Hoja de ruta por fases

Ordenada por **riesgo/dependencias**, no por categoría.

### Fase 0 — Reestructurar la paleta (sin lógica nueva) — ✅ HECHO
Categoría única "Mi Robot" partida en categorías SPIKE (Eventos · Movimiento ·
Luz · Sensores · Tiempo) con sus colores. Archivos:
[robotBlocks.ts](../src/blocks/definitions/robotBlocks.ts),
[BlocklyWorkspace.tsx](../src/components/BlocklyWorkspace.tsx).

### Fase 1 — Movimiento + Eventos + Matriz 3×3 + Motores/Operadores/Sonido — ✅ HECHO
- ✅ **Movimiento**: `robot_move_for` (rotaciones/grados/segundos).
- ✅ **Eventos**: `event_when_started` (mapea al loop actual).
- ✅ **Luz 3×3**: `light_display_image` / `light_set_pixel` / `light_off` +
  `HubLights` + `HubMatrixPanel` (adelantado desde la Fase 2 por autocontenido).
- ✅ **Motor por puerto**: `motorsByPort` (A/B) + `motor_run_for`, `motor_start`,
  `motor_stop_port`, reporter `motor_position` (vía `LegoMotor.getAngle()`).
- ✅ **Operadores/Control**: `operator_random` + rama `else`/`else-if` en `controls_if`.
- ✅ **Sonido**: `sound_beep`, `sound_play_note`, `sound_stop` + `HubSound` (WebAudio).
  *(Adelantado desde la Fase 3 por ser de bajo riesgo.)*
- 🔜 **Movimiento avanzado**: separar velocidad en bloque propio; `start_move`
  (continuo) y `steer`. *Pendiente.*

Todo mapeó a la física existente — riesgo bajo. Único subsistema nuevo: WebAudio
(mockeado en tests headless).

### Fase 2 — Sensor de color (matriz 3×3 ya adelantada en Fase 1)
- **Sensor de color** *(pendiente)*: objetos coloreados en la escena (extender
  [Baseplate.ts](../src/engine/components/Baseplate.ts) con celdas de color o
  ladrillos de color) + nuevo `LegoColorSensor` (ray-cast que devuelve el color
  del material golpeado). Ya existe la clave LDraw `SENSOR_COLOR`.
- ✅ **Matriz 3×3**: implementada en Fase 1 (`HubLights` + `HubMatrixPanel`).
  Queda ampliarla con **texto desplazándose**, rotación, brillo global y animaciones.
- El sensor de color habilita la **Bar Graph** del PDF (cuenta de colores detectados).

### Fase 3 — Giroscopio/inclinación + Botón/Temporizador (Sonido ya hecho en Fase 1)
- ✅ **Sonido**: WebAudio para pitidos/notas (`HubSound`) — adelantado a Fase 1.
- 🔜 Lectura de orientación del chasis (Rapier ya da la rotación) → `is_tilted`,
  ejes de orientación.
- 🔜 Botón del hub (UI) y temporizador.

### Fase 4 — Motor de eventos concurrentes + Variables + broadcast
Re-arquitectura del intérprete: vigilancia de condiciones por frame, pilas
concurrentes disparadas por evento (`when_color`, `when_button`, `when_tilted`),
`broadcast`, y variables interpretadas. Es el cambio más grande; se deja al
final a propósito.

---

## Verificación

Por fase, comprobar de punta a punta (ojo, comenzaremos a usar pnpm):

1. `npm run lint && npm run test run` — los tests del intérprete y del engine
   deben pasar (los subsistemas de navegador —sonido, render de matriz— se
   mockean/skipean como ya se hace con Three.js en CI).
2. `npm run dev` — cada categoría nueva aparece en el toolbox con su color, los
   bloques se arrastran y el programa corre contra el robot simulado.
3. Para Fase 2: colocar un objeto de color en la escena, programar
   "avanzar hasta que el color sea rojo" y ver al robot detenerse sobre la celda.
4. Mantener este documento y [architecture.md](architecture.md) actualizados al
   cerrar cada fase (regla de CLAUDE.md).

---

## Aprendizajes del repo de referencia (alexandrehardy/lego-spike-simulator)

Más allá de los bloques, cosas concretas que el simulador de referencia hace y
que podríamos adoptar o que validan nuestras decisiones. Su `src/` está
organizado en `lib/blockly/` (bloques, campos, toolbox, generador) y `lib/spike/`
(VM, escena, fuente).

### Funcionalidades que valdría la pena tomar

1. **Opcodes oficiales `flipper*`** (`flippermove_move`,
   `flipperlight_lightDisplayImageOnForTime`, `flippersensors_color`…). Hablar el
   mismo vocabulario que LEGO es lo que haría posible **importar/exportar
   programas `.llsp3`** reales. Nuestros nombres propios (`robot_move_for`) son
   más simples para niños pero no interoperan. *Trade-off a decidir por bloque.*
2. **Cargar/guardar el programa** (ellos soportan `.llsp3`). BrickCode aún no
   serializa el workspace; guardar/cargar el XML/JSON de Blockly en `localStorage`
   sería una mejora barata y muy útil para que un niño no pierda su trabajo.
3. **Importar robots `.ldr/.mpd` con configuración de puertos**, guardada en el
   propio robot. Encaja con nuestro pipeline LDraw (`DynamicRobot`); nos falta la
   capa "qué motor está en qué puerto" que ellos resuelven con un *port connector*
   UI — justo lo que necesita nuestro **Tier A (motor por puerto)**.
4. **Escena configurable**: imagen de base (mapa) + obstáculos LDraw. Nuestras
   challenges son objetos TS hardcodeados; un editor de escena simple (imagen de
   suelo + obstáculos) permitiría retos creados por profesores y, con un mapa de
   color, alimentaría al futuro **Sensor de Color**.
5. **Campos Blockly personalizados** (`field-bitmap.ts`, `field-grid-dropdown`,
   `field_angle`, `field-sound`). El **`field-bitmap`** es un editor de matriz de
   píxeles: encajaría perfecto en nuestros `light_*` — el niño "dibujaría" el icono
   3×3 en vez de poner fila/columna/brillo por separado.
6. **`SoundLibrary`** (`lib/blockly/audio.ts`): patrón listo para nuestro
   subsistema de sonido (Fase 3).
7. **Fuente bitmap embebida** (`lib/spike/font.ts`, `mbitfont`, estilo micro:bit):
   reutilizable para "mostrar texto" desplazándose en la matriz.

### Metodologías / arquitectura

1. **VM dirigida por eventos** (`lib/spike/vm.ts`): compilan el workspace **una
   vez** a `events: Map<string, EventStatement>` + `procedures: Map<…>` y ejecutan
   pilas concurrentes con un *scheduler* cooperativo (`stepSleep`, `timeFactor`).
   Es exactamente el modelo que necesita nuestro **Tier C / Fase 4 (motor de
   eventos)**: en lugar de `for (top of topBlocks) await executeSequence(top)`,
   indexar las pilas por su bloque-hat y disparar las que correspondan cuando su
   condición se cumple. **Patrón a copiar:** *compilar → mapa de eventos → scheduler*.
2. **Renderer Scratch/zelos**: confirma nuestra elección de `zelos` para niños.
3. **Física enfocada en la base motriz con engranaje** (no simulan el robot
   pieza-a-pieza): valida nuestra decisión de colliders simples + revolute joints.

### Lo que NO copiaríamos (de momento)

- Los **6 puertos A–F** y todo el catálogo de sensores de SPIKE Prime: Essential
  solo tiene 2 puertos. Mantener el alcance en Essential.
- Su acoplamiento a **Svelte**: BrickCode es React; tomamos ideas y patrones, no código.

### ⚠️ Licencia del repo de referencia

El repo `alexandrehardy/lego-spike-simulator` **no tiene archivo LICENSE** → por
defecto es "todos los derechos reservados". **No copiamos su código ni sus SVG
verbatim.** Lo usamos solo como referencia de estructura/estilo y replicamos con
assets propios o de licencia abierta. Excepción: su `field-bitmap.ts` resultó ser
una copia (modificada) del plugin oficial de Google (`@blockly/field-bitmap`,
Apache-2.0), así que usamos **el plugin oficial directamente** — no el suyo.

### Alineación visual con SPIKE — estado

- ✅ **Editor de luces 3×3 dibujable** (`light_display_matrix`) vía
  `@blockly/field-bitmap` oficial.
- ✅ **`startHats: true`** → el bloque "Al empezar" tiene forma de sombrero.
- 🔜 **Iconos dentro de los bloques** (flechas de dirección, motor, sonido) con
  `field_image` — requiere crear **SVGs propios** (los del repo de referencia no
  tienen licencia). Mismo enfoque para iconos por categoría en el toolbox.
- 🔜 **Nombres/opcodes estilo `flipper*`** si en el futuro queremos importar/exportar
  `.llsp3`.

---

## Apéndice — Vocabulario completo de referencia

El simulador de referencia implementa el set completo de opcodes oficiales
`flipper*` (es SPIKE Prime). Lista extraída de su
[`toolbox.ts`](https://github.com/alexandrehardy/lego-spike-simulator/blob/master/src/lib/blockly/toolbox.ts),
útil como diccionario de nombres al implementar cada bloque: `flippermotor_*`,
`flippermove_*`, `flipperlight_*`, `flippersound_*`, `flipperevents_*`,
`flippercontrol_*`, `flippersensors_*`, `flippermoremotor_*`,
`flippermoremove_*`, `flippermoresensors_*`, más `operator_*`, `control_*`,
`event_*` y `sound_*` (heredados de Scratch).
