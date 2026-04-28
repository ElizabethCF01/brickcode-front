# BrickCode — Architecture

## Scale Convention

**1 world unit = 10 cm**

| Real-world measure | World units |
|--------------------|-------------|
| 1 stud (8 mm)      | 0.08        |
| Brick body height (9.6 mm) | 0.096 |
| Stud radius (2.4 mm) | 0.024    |
| Stud protrusion (1.8 mm) | 0.018 |

### Rationale

LEGO spec gives 1 stud = 8 mm. Expressing this literally as 0.008 world units creates two problems:

1. **Visibility** — the existing scene (20×20 floor, camera at `(0, 6, 10)`) would render bricks as sub-pixel specks.
2. **Rapier stability** — the physics engine is most stable for objects in the 0.1–10 unit range. Objects smaller than ~0.01 units risk jitter, tunneling, and sleeping artefacts.

Mapping 1 stud → 0.08 units (1 unit = 10 cm) puts a 2×4 brick at `0.16 × 0.096 × 0.32` units — comfortably in Rapier's stable range and clearly visible in the Three.js scene.

The constant `STUD = 0.08` lives in `LegoBrick.ts` and can be changed in one place if the scene scale changes later.

---

## Physics Collider Strategy

Studs (the cylindrical bumps on top of each brick) are **cosmetic only** — they appear in the Three.js mesh but are **not** part of the Rapier collider. Each brick uses a single `ColliderDesc.cuboid` matching the main body dimensions.

Why: including stud cylinders in the collider would make flat-top stacking fragile (bricks would balance on cylinder edges instead of resting flush). The visual studs communicate LEGO identity; the flat cuboid gives predictable, stable physics.

---

## Subsystem Responsibilities

| Subsystem | What it owns |
|-----------|--------------|
| `SimulationEngine` | Single `rAF` loop; steps Rapier then renders Three.js |
| `LegoBrick` | Holds one `THREE.Group` (body + studs) and one `RAPIER.RigidBody`; exposes `syncRender()` and `dispose()` |
| `Baseplate`             | 32×32 stud static platform; `RigidBodyDesc.fixed()` collider with top surface at y = 0; stud grid rendered via `DataTexture` (no DOM needed) |
| `LegoMotor` | Fixed anchor body + `RevoluteImpulseJoint`; `configureMotorVelocity` drives the attached wheel body |
| `LegoDistanceSensor` | Rapier ray-cast each frame via `world.castRay()`; exposes `getValue()` → cm; optional red debug ray in scene |
| `BlockInterpreter` | Walks Blockly AST; calls component methods directly — no codegen |

---

## LegoMotor

**File**: `src/engine/components/LegoMotor.ts`

### Joint design (Option A — direct body reference)

`MotorConfig` takes `attachedBody: RAPIER.RigidBody` (a direct reference, not a string ID).
Three alternatives were considered:

| Option | Approach | Why rejected |
|--------|----------|--------------|
| A ✓ | Direct `RigidBody` reference | Chosen — no registry needed; `RevoluteImpulseJoint` requires two body objects anyway |
| B | `attachedBodyId: string` + body registry | Extra infrastructure before any robot exists |
| C | Motor owns its own wheel body | Motor becomes a composite — breaks the "driver of external body" architecture intent |

### Physics: RevoluteImpulseJoint + configureMotorVelocity

The motor creates a **fixed anchor body** at `config.position` and connects it to `attachedBody`
via `RAPIER.JointData.revolute(origin, origin, axis)`. The joint motor is driven each call to
`setSpeed()` / `stop()` via `joint.configureMotorVelocity(rad/s, damping)`:

- `DRIVE_DAMPING = 50` — tracks target velocity against moderate loads
- `BRAKE_DAMPING = 500` — 10× higher; kills residual velocity quickly on `stop()`

**Constraint for callers**: `attachedBody` must be created at the same world position as
`config.position`. Both local anchor offsets are `(0, 0, 0)` — if the body was placed elsewhere
the joint will apply a large corrective force on the first step.

### Angle tracking

`RevoluteImpulseJoint` has no `angle()` method in the Rapier 0.19 TypeScript API.
`getAngle()` integrates `targetSpeed × deltaTime` each frame. This reflects *commanded* motion;
if the wheel is physically blocked, the reported angle will diverge from the actual rotation.

### Visual

A `THREE.CylinderGeometry` (2-stud radius, 1-stud width) lives inside a `THREE.Group`.
The **group** receives the physics body transform every `step()`; the **inner mesh** holds a
constant rotation offset so the wheel face is perpendicular to the spin axis:

- `axis = 'x'` → `mesh.rotation.z = π/2`
- `axis = 'z'` → `mesh.rotation.x = π/2`
- `axis = 'y'` → no rotation (cylinder default height is already along Y)

---

## LegoDistanceSensor

**File**: `src/engine/components/LegoDistanceSensor.ts`

### Design

`SensorConfig` takes a world-space `position` and `direction` (normalised internally), plus `maxRange` **in cm**. The sensor has no Rapier rigid body — it fires a read-only ray via `world.castRay()`.

- `getValue()` → cm; returns `maxRange` when no collider is within range.
- `step(world)` is called each frame after `world.step()`. It uses `RAPIER.Ray` + `world.castRay(ray, maxRangeWU, solid: true)`. `timeOfImpact` (world units along the normalised direction) is multiplied by `WORLD_TO_CM = 10` to produce the cm reading.
- `solid: true` — if the ray origin is inside a shape, `timeOfImpact = 0` (reports contact rather than exit point).
- Debug ray: a `THREE.Line` (red, `#ff0000`) drawn from the sensor origin to the detected hit point. Toggled with `setDebugVisible(bool)`. The end vertex is updated in-place each frame via `BufferAttribute.needsUpdate` — no geometry recreation.

### Why constructor takes only `(config, scene)` — not `(config, world, scene)`

The sensor creates no Rapier rigid bodies, so `world` is never needed at construction time or in `dispose()`. Passing it per `step(world)` call is sufficient and keeps the constructor signature minimal.

### Position is fixed in world space

`config.position` is copied at construction and never updated. When a robot body is introduced, the sensor will need an `attachedBody` reference so `step()` can derive world-space position from the body transform.

---

## Baseplate

**File**: `src/engine/components/Baseplate.ts`

- Size: 32 × 32 studs = **2.56 × 2.56 world units**
- Thickness: 3.2 mm = **0.032 world units** (one LEGO plate height)
- Top surface is at **y = 0**; body centre at y = –0.016
- Physics: `RigidBodyDesc.fixed()` with a single `ColliderDesc.cuboid`
- Visual: `BoxGeometry` + `MeshStandardMaterial` with a `DataTexture` showing a 256 × 256 stud-circle grid (computed from raw pixel data — no canvas/DOM dependency, safe in Vitest/Node)
- Color: `#4CAF50` base, `#43A047` stud circles

> **Note**: `SceneSetup.ts` currently adds a separate decorative green floor plane at y = 0. When the Baseplate is used in the runtime scene, the floor in `SceneSetup` should be removed or repositioned to avoid z-fighting.

---

## BlockInterpreter

**File**: `src/interpreter/BlockInterpreter.ts`

### Design

`BlockInterpreter` takes a `SimpleRobot` and walks the Blockly workspace AST directly at run time — no codegen, no `eval()`.

- `run(workspace)` calls `workspace.getTopBlocks(true)` then executes each top-level sequence with `executeSequence`, which follows `block.getNextBlock()` in a while loop.
- Timed blocks (`drive_forward`) use a cancellable `setTimeout`-based `sleep(ms)` so `requestAnimationFrame` and the physics loop keep firing while the interpreter waits.
- `stop()` sets `_running = false`, cancels the active sleep timer, and immediately brakes both motors.
- A second call to `run()` while already running is a no-op (guard at entry).

### Drive convention

`drive_forward` calls `left.setSpeed(+n)` and `right.setSpeed(+n)`. Both positive = robot moves forward. The physical motor mounting must match this convention: both motors must spin "outward" (away from centre) in the positive direction.

### Speed mapping

`robot_drive_forward` and `robot_drive_backward` accept `SPEED` as 0–100 (percentage), mapped linearly to deg/s: `speed_deg_s = (SPEED / 100) × 360`. This is more intuitive for children than raw deg/s.

The legacy `drive_forward` block still accepts deg/s directly for backwards compatibility with existing tests and workspaces.

### Turn geometry (approximate)

`robot_turn` calculates duration from `DEGREES` using:

```
motorDeg = DEGREES × (wheelBase/2) / WHEEL_RADIUS
duration = motorDeg / TURN_MOTOR_SPEED
```

Constants: `WHEEL_RADIUS_WU = 0.16`, `TURN_MOTOR_SPEED = 180 deg/s`. `wheelBase` defaults to `0.48 WU` (6 studs, estimated) until the chassis is built; override via `SimpleRobot.wheelBaseWU`.

Turn direction: LEFT = left motor backward + right motor forward (CCW from above). RIGHT = opposite.

### Supported block types

| Block type             | Fields                              | Behaviour |
|------------------------|-------------------------------------|-----------|
| `robot_drive_forward`  | `SPEED` (0–100 %), `DURATION` (s)   | Sets both motors to `+SPEED%`, waits, auto-stops |
| `robot_drive_backward` | `SPEED` (0–100 %), `DURATION` (s)   | Sets both motors to `−SPEED%`, waits, auto-stops |
| `robot_turn`           | `DIRECTION` (LEFT/RIGHT), `DEGREES` | Differential spin for computed duration, auto-stops |
| `robot_stop`           | —                                   | Brakes both motors immediately |
| `wait_seconds`         | `SECONDS`                           | Sleeps for the given duration; no motor change |
| `drive_forward` *(legacy)* | `SPEED` (deg/s), `DURATION` (s) | As before; kept for test/workspace compat |
| `motor_stop` *(legacy)*    | —                               | As before; kept for test/workspace compat |

Unknown block types are silently skipped.

---

## Custom Blockly Blocks

**File**: `src/blocks/definitions/robotBlocks.ts`

All blocks are registered with `registerRobotBlocks()` (call once at startup) and surfaced in a single **"Mi Robot 🤖"** toolbox category.

| Block type            | Kind      | Fields                                      | Colour      |
|-----------------------|-----------|---------------------------------------------|-------------|
| `robot_drive_forward` | statement | `SPEED` (0–100), `DURATION` (s)             | LEGO red    |
| `robot_drive_backward`| statement | `SPEED` (0–100), `DURATION` (s)             | LEGO red    |
| `robot_turn`          | statement | `DIRECTION` (LEFT/RIGHT), `DEGREES` (0–360) | LEGO blue   |
| `robot_stop`          | statement | —                                           | LEGO red    |
| `sensor_distance`     | value     | — (output: Number, cm)                      | LEGO yellow |
| `wait_seconds`        | statement | `SECONDS`                                   | LEGO yellow |

`ROBOT_TOOLBOX` exports a ready-to-use Blockly v9+ JSON toolbox definition. Pass it to the `toolbox` option of `Blockly.inject()` or the `BlocklyWorkspace` component.

`BlockInterpreter` also handles `controls_if`, `controls_whileUntil`, and `controls_repeat_ext` via an internal `evaluateValue()` method that resolves `sensor_distance`, `math_number`, `math_compare`, and `math_arithmetic` value blocks. Unknown block types are silently skipped.

---

## SimulationEngine

**File**: `src/engine/SimulationEngine.ts`

`SimulationEngine` is the central runtime object created once per session. It owns:

- A **Rapier world** (gravity –9.81 Y) and a **Three.js scene** (via `createScene`).
- A blue **chassis mesh** (`BoxGeometry`, 4×2×6 studs) plus a **kinematic Rapier body** that the engine moves manually — no forces, no joints for Sprint 3.
- A **front `LegoDistanceSensor`** whose world-space position is updated each tick via `setWorldPosition()`.
- Two **`SimpleMotor`** instances (internal class) that record commanded speed without physics. The engine reads their speeds and integrates them into chassis Z-position each tick.
- A **`BlockInterpreter`** wired to the above robot.

### Per-frame loop (`_tick`)

1. Compute `forwardWU = avg(left, right) × DEG_TO_RAD × WHEEL_RADIUS × dt`.
2. Advance `chassisPos.z` by `−forwardWU` (robot faces −Z).
3. `chassisBody.setNextKinematicTranslation(chassisPos)`.
4. `world.step()` — commits the kinematic translation.
5. `sensor.setWorldPosition(front of chassis)` then `sensor.step(world)`.
6. Push `sensor.getValue()` to `simulationStore.sensorValues['front']`.
7. Render via Three.js.

### Why kinematic chassis

Full differential-drive physics (revolute joints, wheel friction, traction) is deferred to Sprint 4. A kinematic body gives Sprint-3 kids a moving robot and working sensor without physics tuning.

### Singletons

`src/engine/engineSingleton.ts` and `src/blocks/workspaceSingleton.ts` expose module-level references so `ControlPanel` can access both without React context or prop drilling.

---

## Challenge 01

**File**: `src/challenges/challenge-01.ts`

| Property | Value |
|----------|-------|
| `id` | `'challenge-01'` |
| Wall distance | 50 cm (wall front face at z = −5 WU) |
| Success zone | Sensor reads 15–25 cm when stopped |
| Wall body | Fixed Rapier body (not dynamic LegoBricks — avoids toppling) |

`setup(engine)` creates the red wall and returns a dispose callback.  
`evaluate(robot)` reads `robot.sensor.getValue()` and returns `ChallengeResult`.

`ChallengeResult` is defined in `challengeStore.ts` and re-exported from `challenge-01.ts`.

---

## UI Layout (Task 3.3)

**Files**: `src/components/ControlPanel.tsx`, `src/components/BlocklyWorkspace.tsx`, `src/components/SensorPanel.tsx`, `src/App.tsx`

### Layout structure

```
┌─────────────────────────────────────────────────────────┐
│  ControlPanel  (header — Run / Stop / Reset buttons)    │
├──────────────────────────┬──────────────────────────────┤
│  SimulatorCanvas         │  BlocklyWorkspace (w-105)    │
│  (flex-1)                │  Blockly injected into div   │
├──────────────────────────┴──────────────────────────────┤
│  SensorPanel  (footer — sensor bar + status label)      │
└─────────────────────────────────────────────────────────┘
```

### Key decisions

- **`registerRobotBlocks()` is called once in `main.tsx`** before `createRoot` — safe against StrictMode double-mount.
- **Blockly ResizeObserver**: `BlocklyWorkspace` observes its container and calls `Blockly.svgResize(workspace)` on every resize; without this the SVG stays mis-sized after layout changes.
- **Toolbox extension**: `BlocklyWorkspace` combines `ROBOT_TOOLBOX` categories with built-in `controls_*` and `math_*` categories into `FULL_TOOLBOX`. `ROBOT_TOOLBOX` in `robotBlocks.ts` remains unchanged.
- **Sensor key convention**: `simulationStore.sensorValues['front']` holds the front distance sensor reading in cm. `SensorPanel` reads this key; the bar fills relative to `SENSOR_MAX_CM = 100`. When the key is absent the display shows `— cm`.
- **Control buttons**: Run/Stop/Reset toggle `simulationStore.status` only. Wiring to `BlockInterpreter` is deferred to the task that builds `SimpleRobot`.
- **Status labels**: `stopped` → "En reposo", `running` → "Ejecutando", `paused` → "Pausado".

## LDraw Asset Pipeline

**Files**: `scripts/packLDrawParts.ts`, `scripts/ldrawCatalog.ts`, `scripts/vendor/packLDrawModel.mjs`, `public/ldraw/models/packed/*.mpd`

### Goal

Replace prototype primitives (`BoxGeometry` + cylinders for studs, etc.) with millimetre-accurate CAD geometry from the [LDraw](https://www.ldraw.org/) open standard (CC BY 2.0). Three.js ships an `LDrawLoader` (`three/examples/jsm/loaders/LDrawLoader.js`) that consumes packed `.mpd` files at runtime.

This pipeline is **visual only** — Rapier colliders remain cuboids (see *Physics Collider Strategy* above). LDraw geometry is for rendering; physics keeps using simple shapes for stable stacking and predictable behaviour.

### Why packed `.mpd`

A raw LDraw part (e.g. `parts/3001.dat`) references dozens of sub-parts and primitives via path. Serving the entire library to the browser is impractical (~170 MB, thousands of HTTP requests). The official three.js script `packLDrawModel.mjs` recursively inlines all referenced files into a single self-contained `.mpd`, ready to load with one HTTP request.

### Library is not committed

The raw LDraw library (~170 MB of CC BY 2.0 `.dat` files) is **not** in the repo. Only the small packed outputs are committed.

To regenerate packed parts:

1. Download `complete.zip` from https://library.ldraw.org/library/updates/complete.zip.
2. Unzip somewhere local (e.g. `~/ldraw-library/`). Verify it contains `LDConfig.ldr`, `parts/`, `p/`.
3. `LDRAW_LIB_PATH=~/ldraw-library npm run pack-ldraw`.

The script writes `public/ldraw/models/packed/<id>.mpd` for each entry in `LDRAW_CATALOG`.

`.gitignore` blocks `public/ldraw/parts/`, `public/ldraw/p/`, and `public/ldraw/LDConfig.ldr` defensively so the raw library can't be accidentally committed.

### Catalog

`scripts/ldrawCatalog.ts` is the single source of truth for which parts are bundled. Initial catalog covers what already exists in `src/engine/components/`:

| id | LDraw file | Used by |
|---|---|---|
| `brick-2x4` | `parts/3001.dat` | `LegoBrick` |
| `baseplate-32x32` | `parts/3811.dat` | `Baseplate` |
| `wheel` | `parts/3483.dat` | `LegoMotor` (wheel visual) |

Adding a part = append to `LDRAW_CATALOG`, run `npm run pack-ldraw`, commit the new `.mpd`.

### Vendored packer

`scripts/vendor/packLDrawModel.mjs` is adapted from three.js (`utils/packLDrawModel.mjs` on GitHub — not published to npm). The original is a CLI; we expose it as `packLDrawModel(libPath, fileName)` returning the packed string. Algorithm unchanged. License: MIT (three.js authors). See `scripts/vendor/README.md`.

### LDraw scale

LDraw uses **LDU** (LDraw Units) where 1 LDU = 0.4 mm. Real LEGO stud spacing = 20 LDU = 8 mm.

To convert LDU → BrickCode world units (1 WU = 10 cm = 100 mm = 250 LDU):

```
worldUnits = LDU * 0.004
```

When loading a packed part with `LDrawLoader`, scale the resulting `Group` by `0.004` to match the existing `STUD = 0.08` convention.

LDraw also flips the Y axis relative to three.js (LDraw Y points down). `LDrawLoader` handles this automatically.

---

## LDrawLibraryManager

**File**: `src/engine/ldraw/LDrawLibraryManager.ts`

Runtime cache for the packed LDraw parts produced by `npm run pack-ldraw`. One instance is created at app startup, `preloadAll()` is awaited before the simulator scene mounts, and components retrieve clones via `getPart(key, color?)` instead of authoring `BoxGeometry`/`CylinderGeometry` themselves.

### Key mapping

`BRICKCODE_PARTS` exposes semantic keys (`HUB_EV3`, `MOTOR_M`, `MOTOR_L`, `SENSOR_DISTANCE`, `SENSOR_COLOR`, `WHEEL_LARGE`, `BEAM_3`, `BEAM_5`, `BASEPLATE_32`). Each key maps to a **catalog id** (the packed `.mpd` filename), not a raw `.dat`. The raw `.dat` ids live in `scripts/ldrawCatalog.ts` and are inlined at pack time — runtime never sees them.

`SENSOR_DISTANCE` maps to `17388.dat` (EV3 IR sensor). EV3-G surfaces the IR sensor as a distance reading, so we reuse the IR mesh as the visual for the simulator's distance sensor.

### preloadAll

Loads every entry in parallel via `loader.loadAsync(url)` and applies `scale(0.004)` (LDU → WU) on the cached group. `onProgress(loaded, total)` is called once per completed part so the loading bar can advance smoothly. The returned promise resolves once every part is in the cache.

### getPart / applyColor

`getPart` returns `cached.clone(true)` — meshes are cloned but materials are not, so material substitution per clone is safe. `applyColor` looks up `loader.getMaterial(String(code))` and replaces `mesh.material` on every descendant mesh; LDraw color codes are integers (4 = red, 14 = yellow, 15 = white). Unknown codes are a no-op rather than an error.

### Why no scene reference

The manager loads and caches; it never adds objects to the scene. Each component receives the clone from `getPart` and calls `scene.add` itself. Passing a `THREE.Scene` to the constructor would be dead weight.

### Adding a new part

1. Append entry to `LDRAW_CATALOG` in `scripts/ldrawCatalog.ts`.
2. Add semantic key in `BRICKCODE_PARTS`.
3. Run `LDRAW_LIB_PATH=… npm run pack-ldraw` and commit the new `.mpd`.

Steps 1 and 2 are committed; step 3 produces an asset that is also committed. Without step 3 the part 404s at preload.

---

## LDraw Visual Integration in Components (Task 4.3)

`LegoBrick`, `LegoMotor`, and `LegoDistanceSensor` accept an optional
`LDrawLibraryManager` in their config. When provided, the prototype primitives
(`BoxGeometry` + stud cylinders, wheel cylinder, no-mesh sensor) are replaced
by the corresponding LDraw clones (`BRICK_2X4`, `WHEEL_LARGE`,
`SENSOR_DISTANCE`). When absent, the previous primitive path is used —
keeping headless tests (no DOM, no WebGL) working unchanged.

### What is *not* changed

- **Rapier colliders are untouched.** LegoBrick still uses a `cuboid(w/2,
  BODY_H/2, d/2)` matching the brick body; LegoMotor still uses an anchor
  `RigidBodyDesc.fixed()` driving an external wheel body via
  `RevoluteImpulseJoint`; LegoDistanceSensor still has no rigid body and casts
  a ray each frame.
- **No physics body for the sensor.** The LDraw mesh is decorative. Adding a
  collider would require collision-group filtering to avoid the sensor's own
  ray hitting itself; the architecture explicitly avoids this (see
  *LegoDistanceSensor*).

### Origin alignment

LDraw bricks are authored with the origin at the **centre of the bottom face**.
Inside `LegoBrick`, the LDraw clone is offset by `(0, -BODY_H/2, 0)` so the
brick's geometric centre (group origin) maps to the collider centre.

The LDraw wheel (3483) and EV3 motors/sensors are authored axle-along-Y after
the loader's Y-flip, so the existing axis-rotation offset in `LegoMotor`
(`rotation.z = π/2` for X axis, `rotation.x = π/2` for Z) applies unchanged
to the LDraw clone.

### Wiring at runtime

`SimulationEngine.create` reads the manager from `getLDrawManager()` (set in
`main.tsx` after `preloadAll`) and forwards it to the front
`LegoDistanceSensor`. `LegoBrick` and `LegoMotor` are not yet instantiated by
the engine (the runtime currently uses a kinematic chassis box and a
`SimpleMotor` stub that records commanded speed without physics) — their
LDraw paths are dormant until Task 4.4 (build a real `SimpleRobot`) wires
them in.

---

## Block Editor UX

**Files**: `src/components/BlocklyWorkspace.tsx`, `src/App.tsx`, `src/blocks/definitions/robotBlocks.ts`, `src/index.css`

- **Renderer `zelos`**: rounded-edge blocks (Scratch-style), better suited for ages 8–12 than the default `geras`.
- **`move` + `zoom` enabled**: scrollbars on both axes, wheel pan, wheel-zoom, pinch-zoom, on-screen zoom controls. `startScale: 0.9`, `[0.5, 2]` range.
- **`grid.snap: true`** (spacing 20px): drag placement snaps to a grid so the workspace stays tidy.
- **Drawer width is 50vw with `min-w-[420px]`**: fills half the viewport on desktop while staying usable on small screens.
- **Drawer resize timing**: the drawer animates in via a 200ms CSS transform. `App.tsx` schedules `Blockly.svgResize` via a 220ms timeout (not `requestAnimationFrame`) so flyout/toolbox metrics are computed *after* the transform settles. Resizing earlier was the cause of "flyout doesn't reappear on second category click".
- **Toolbox uses `kind: 'label'` instead of `kind: 'sep'`**: the previous separator items rendered visible horizontal bars in the flyout. Labels (`Movimiento`, `Sensores`, `Tiempo`) provide grouping without the bar.
- **Theme contrast**: toolbox `#0f172a`, flyout `#111827`, workspace `#1f2937` — three distinct shades so the panes visually separate. `flyoutOpacity: 1` (was 0.9 — caused blending).
