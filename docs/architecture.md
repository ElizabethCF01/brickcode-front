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

> **Note**: `BlockInterpreter` v1 handles `drive_forward`, `wait_seconds`, and `motor_stop`. The new `robot_*` block types require a corresponding interpreter update (Task 3.2).

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
