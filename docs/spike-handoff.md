# Handoff — Alineación de bloques con LEGO SPIKE Essential

> **Para retomar en un chat nuevo:** lee este archivo + [`spike-essential-blocks.md`](spike-essential-blocks.md)
> (catálogo, hoja de ruta y aprendizajes del repo de referencia) +
> [`architecture.md`](architecture.md) (detalle técnico de cada subsistema). Con eso
> tienes todo el contexto del workstream.

## Objetivo del workstream

Acercar la paleta de bloques de BrickCode a **LEGO Education SPIKE Essential**,
tomando ideas del simulador de referencia
[spike.ahardy.za.net](https://spike.ahardy.za.net)
([código: `alexandrehardy/lego-spike-simulator`](https://github.com/alexandrehardy/lego-spike-simulator)).
Foco **solo en SPIKE Essential** de momento (otros modelos después).

## Decisiones tomadas (no volver a litigar)

- **Camino _superset_**: se mantiene el sensor de distancia (es de SPIKE Prime) y
  se añade el hardware de Essential encima. No rompe `challenge-01`.
- **Bloques de palabra en español** + paleta de colores de SPIKE por categoría.
- **El repo de referencia NO tiene LICENSE** → no copiamos su código ni sus SVG.
  Usamos plugins oficiales (p. ej. `@blockly/field-bitmap`, Apache-2.0) o assets
  propios. El repo está clonado en `reference/lego-spike-simulator/` (fuera del
  build) solo para análisis.

## Lo que YA está hecho y verificado en navegador

Toolbox reestructurado en categorías estilo SPIKE: **Eventos · Movimiento ·
Motores · Luz · Sonido · Sensores · Tiempo** (+ Control y Matemáticas que añade
`BlocklyWorkspace`). Bloques implementados:

| Categoría | Bloques |
|-----------|---------|
| Eventos | `event_when_started` (hat, con forma de sombrero) |
| Movimiento | `robot_move_for` (rotaciones/grados/segundos) + previos (`robot_drive_forward/backward`, `robot_turn`, `robot_stop`) |
| Motores | `motor_run_for`, `motor_start`, `motor_stop_port`, `motor_position` (reporter) |
| Luz | `light_display_matrix` (**editor 3×3 dibujable**), `light_display_image` (presets), `light_set_pixel`, `light_off` |
| Sonido | `sound_beep`, `sound_play_note` (Do–Si), `sound_stop` |
| Operadores | `operator_random` (en Matemáticas) |
| Control | `controls_if` ampliado con rama `else`/`else-if` |

Subsistemas nuevos:
- **Hub 3×3**: `IHub` → `HubLights` → `simulationStore.hubMatrix` → `HubMatrixPanel`
  (overlay del canvas). Inyectado en `new BlockInterpreter(robot, hub?, sound?)`.
- **Sonido**: `ISound` → `HubSound` (oscilador WebAudio, `AudioContext` perezoso).
- **Motores por puerto**: `motorsByPort` (A→left, B→right) en **`SimpleRobot` y
  `DynamicRobot`**.

Alineación visual:
- ✅ `startHats: true` en el tema (sombrero del bloque de evento).
- ✅ Editor 3×3 dibujable (`@blockly/field-bitmap`).
- ✅ Iconos de dirección propios (data-URI SVG en `blockIcons.ts`): rotación ↻/↺
  en Motores, flechas ←/→ en "Girar".
- ✅ **Glifo líder dentro de cada bloque de acción** (como SPIKE): `blockIcon()`
  mete un `field_image` al inicio de `message0`. Glifos propios por familia
  (evento/movimiento/motor/luz/sonido/tiempo) en `blockIcons.ts`. Reporters y
  operadores **sin** glifo. Verificado en navegador a 2×.
- ❌ **Iconos redondos por categoría** (riel): prototipado y **revertido** por
  decisión de la usuaria — en SPIKE los iconos van dentro de las piezas. El riel
  conserva la barra fina de color (`index.css`).

**Verificado en navegador** (Playwright): las 7 categorías renderizan con sus
colores, el editor 3×3 muestra el corazón, el hat tiene forma de sombrero, los
iconos de dirección renderizan, y un programa (arrastrar "Mostrar" → Ejecutar)
**encendió el corazón en el card del Hub**, con **0 errores de consola**.

Estado de calidad: **44/44 tests**, `tsc`, `pnpm run build` y `lint` en verde
(único error de lint es **pre-existente**: `beforeAll` sin usar en
`tests/engine/sceneSetup.test.ts` — no es nuestro).

## Archivos clave

| Qué | Archivo |
|-----|---------|
| Definición de bloques + toolbox | `src/blocks/definitions/robotBlocks.ts` |
| Iconos SVG propios (data-URI) | `src/blocks/definitions/blockIcons.ts` |
| Intérprete (ejecuta los bloques) | `src/interpreter/BlockInterpreter.ts` |
| Hub luces 3×3 | `src/engine/HubLights.ts` + `src/components/HubMatrixPanel.tsx` |
| Sonido | `src/engine/HubSound.ts` |
| Motores por puerto | `src/engine/components/SimpleRobot.ts`, `DynamicRobot.ts` |
| Store | `src/store/simulationStore.ts` (`hubMatrix`, `hasSensor`) |
| Tema + toolbox React | `src/components/BlocklyWorkspace.tsx` |

## Gotchas importantes

- **pnpm**, no npm (gestionado por asdf, ver `brickcode/.tool-versions`).
- **`.env.local` carga `spike-taxi`** (`VITE_IMPORTED_ROBOT_MODEL`), que es un
  `DynamicRobot` **sin sensor de distancia** → por eso la categoría "Sensores"
  aparece **oculta** (gating por `hasSensor`, correcto) y el robot en pantalla es
  el modelo importado. Para probar el robot procedural con sensor, comenta esa
  línea de `.env.local`.
- **Valores de los dropdowns no deben cambiar** al añadir iconos (los iconos son
  solo `field_image`; el VALUE sigue siendo `CW`/`CCW`, `LEFT`/`RIGHT`) para no
  romper el intérprete ni programas guardados.
- El intérprete **inyecta hub/sound por constructor**; en tests headless se pasan
  mocks (`mockHub`, `mockSound`) o se omiten (los bloques se vuelven no-ops).

## Cómo verificar en el navegador (lo que montamos)

```bash
# 1) Dev server (puerto 5173)
cd brickcode && pnpm run dev &        # esperar a que sirva (curl http://localhost:5173)

# 2) Playwright + Chromium ya instalados en el scratchpad de la sesión anterior;
#    en una sesión nueva: instalar chromium y un módulo playwright para scripting:
pnpm dlx playwright@latest install chromium
# y en un dir temporal: npm i playwright, luego un script .mjs que:
#   chromium.launch() → page.goto('http://localhost:5173') →
#   waitForSelector('.blocklyFlyout') → esperar ~7s (boot Rapier WASM + LDraw) →
#   click '.blocklyToolboxCategory' (hasText 'Luz'/'Motores'/…) → screenshot
# Notas del continuous toolbox: las categorías son `.blocklyToolboxCategory`;
# para soltar un bloque en el workspace, arrástralo a ~x=1130 (a la derecha del flyout).
```

## Próximos pasos (en orden sugerido)

1. ~~Iconos por categoría en el toolbox~~ — **descartado** (la usuaria pidió los
   iconos dentro de las piezas, no en el riel). Ver "Alineación visual".
2. ~~Iconos en más bloques~~ — **HECHO**: glifo líder en todos los bloques de
   acción (movimiento, motores, luz, sonido, eventos, tiempo) vía `blockIcon()`.
3. **Sensor de Color** — el bloque grande que falta de Essential. Requiere:
   objetos coloreados en la escena (extender `Baseplate.ts` o ladrillos de color)
   + un `LegoColorSensor` (ray-cast que devuelve el color del material) + bloques
   `sensor_color` / `is_color` / `reflectivity`. Ya existe la clave LDraw
   `SENSOR_COLOR` y el rol `sensor_color` en el parser. Habilita el "Bar Graph".
4. **Movimiento avanzado**: `set_movement_speed`, `start_move` (continuo), `steer`.
5. **Motor de eventos concurrentes** (Tier C): hats disparados por condición
   (`when_color`, `when_pressed`, `when_tilted`) con pilas concurrentes —
   re-arquitectura del intérprete. Copiar el patrón VM del repo de referencia
   (`compilar → mapa de eventos → scheduler`). Es el cambio más grande.
6. **Mejoras tomadas del repo** (ver `spike-essential-blocks.md`): guardar/cargar
   programa (`localStorage`), *port connector* UI, editor de escena.

## Regla del proyecto

Mantener actualizados `docs/architecture.md` y `docs/spike-essential-blocks.md`
al cerrar cada paso (regla de `CLAUDE.md`).
