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

### Optional external anchor body (Task 4.4)

`MotorConfig` also accepts `anchorBody?: RAPIER.RigidBody` and `anchorLocalPoint?: {x,y,z}`.
When provided, the joint anchors to that body (e.g. a robot chassis) instead of a fresh
world-fixed anchor — letting the motor travel with a moving robot. The motor does not own
the anchor body and `dispose()` does not remove it. When `anchorBody` is omitted, the
original world-fixed anchor path is used unchanged (so existing tests/usages keep working).

### Physics: RevoluteImpulseJoint + configureMotorVelocity

The motor creates a **fixed anchor body** at `config.position` and connects it to `attachedBody`
via `RAPIER.JointData.revolute(origin, origin, axis)`. The joint motor is driven each call to
`setSpeed()` / `stop()` via `joint.configureMotorVelocity(rad/s, damping)`:

- `DRIVE_DAMPING = 300` — raised from the original 50 once `DynamicRobot` started
  attaching the joint to a heavy parsed-`.ldr` chassis. With damping 50 the
  joint solver reached only a small fraction of the commanded velocity before
  chassis inertia dominated, so imported robots appeared not to drive even
  though `setSpeed` was firing. 300 tracks the target accurately while
  remaining stable for the lighter `SimpleRobot` hub.
- `BRAKE_DAMPING = 100` — kills residual velocity quickly on `stop()` without
  oscillating on light wheel bodies.

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

Fallback constants: `WHEEL_RADIUS_WU = 0.28`, `WHEEL_BASE_DEFAULT = 1.75`, `TURN_MOTOR_SPEED = 180 deg/s`. The interpreter prefers per-robot values when available — `SimpleRobot.wheelBaseWU` and `SimpleRobot.wheelRadiusWU` (both optional on the `ISimpleRobot` interface). `DynamicRobot` populates `wheelRadiusWU` from `description.motors[0].wheel.radius`, so imported models with wheels of any size (e.g. spike-taxi at `r = 0.176 WU`) get an accurate turn duration instead of one scaled by the procedural `SimpleRobot`'s `r = 0.28 WU`.

The kinematic formula assumes pure pivot at commanded wheel speed, but in practice the joint motor saturates (chassis `angularDamping` and caster drag dissipate energy faster than the joint can supply), so the chassis only rotates ~60 % of the predicted amount. To compensate, `ISimpleRobot.turnCalibration?: number` multiplies the commanded degrees: `motorDeg = (DEGREES × calibration) × (wheelBase/2) / wheelRadius`. `SimpleRobot` (idealised procedural rig) uses 1.0; `DynamicRobot` ships with 1.67, measured on spike-taxi by comparing commanded vs observed heading change. This is the same calibration step LEGO Spike/Mindstorms users perform per-robot.

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
- A static **ground collider** (`50 × 0.1 × 50` cuboid at `y = -0.05`) so the dynamic robot has something to push against. The decorative green plane in `SceneSetup` is visual only.
- A **`SimpleRobot`** (Hub EV3 + 2 motors + 2 wheels + front distance sensor) at `(0, 0.6, 0)`.
- A **`BlockInterpreter`** wired to that robot.

### Per-frame loop (`_tick`)

1. `world.step()` — Rapier integrates the dynamic hub + wheels under the revolute joint motors.
2. `robot.step(dt)` — syncs hub visual to physics, integrates motor angle, repositions sensor origin to the (rotated) hub-front offset.
3. `robot.sensor.step(world)` — fires the ray.
4. `challenge.update(dt)` — only while `status === 'running'` (scripted scenes don't creep while editing).
5. `challenge.ambient(dt)` — every frame regardless of status; cosmetic-only animation (e.g. water waves).
6. Push `sensor.getValue()` to `simulationStore.sensorValues['front']`.
7. Render via Three.js.

---

## Scripted Level Actors

**Files**: `src/engine/components/SimpleRobot.ts`, `src/challenges/challenge-cave.ts`

Some levels use the robot rig as a decorative actor rather than as a student-driven
motor vehicle. The cave car is the current example: the real SPIKE Essential build
has no drive motors, and the child only programs the light module timing.

For those levels, `SimpleRobot.setScriptedPose(position)` moves the hub and both
hidden wheel bodies directly, zeros velocities, brakes the motor joints, and syncs
the visual group plus sensor origins immediately. This keeps imported/decorative
models attached through `attachImportedVisual()` aligned with the physics rig while
avoiding hidden wheel torque, side drift, or pivoting.

`challenge-cave` uses this path to advance the car in a straight line at 18 cm/s
toward `-Z`; it no longer calls `motors.left/right.setSpeed()` during gameplay.

### Singletons

`src/engine/engineSingleton.ts` and `src/blocks/workspaceSingleton.ts` expose module-level references so `ControlPanel` can access both without React context or prop drilling.

---

## Challenge 01 (motors-only)

**File**: `src/challenges/challenge-01.ts`

Originally a sensor challenge ("stop before the wall when the distance sensor
reads < 20 cm"). Rewritten as a **motors-only** challenge so it is satisfiable
by the default imported robot (`spike-taxi`), which has motors but no sensor —
see *Model-driven sensor UI*. A sensor-based challenge cannot be "made
consistent" with a sensorless robot, so the success condition was moved from a
sensor reading to chassis displacement.

| Property | Value |
|----------|-------|
| `id` | `'challenge-01'` |
| Goal | Drive forward and stop inside a green floor zone ~30 cm ahead |
| Forward target | `GOAL_FORWARD_CM = 30`, depth tolerance `±GOAL_TOL_CM = 7` |
| Straightness | sideways drift `|x|` ≤ `LATERAL_TOL_CM = 12` |
| Goal marker | Translucent green slab on the floor (visual only — **no collider**) |

`setup(engine)` adds the floor marker and returns a dispose callback.
`evaluate(robot)` reads `robot.getPosition()` (forward = −z, drift = |x|) and
returns `ChallengeResult`. The robot exposes `getPosition()` (both `SimpleRobot`
and `DynamicRobot`) so challenges measure displacement without the interpreter
interface leaking Rapier types.

`ChallengeResult` is defined in `challengeStore.ts` and re-exported from `challenge-01.ts`.

---

## Level Catalog & Selection

**Files**: `src/challenges/types.ts`, `src/challenges/index.ts`,
`src/challenges/completion.ts`, `src/components/LevelSelect.tsx`,
`src/simulator/SimulatorApp.tsx`, `src/store/challengeStore.ts`,
`src/engine/renderer/SimulatorCanvas.tsx`, `src/components/ControlPanel.tsx`,
`src/components/ChallengePanel.tsx`.

The app grew from a single hardcoded `challenge01` to a **catalog** the student
picks from before playing.

**Metadata lives in code, not the DB (decision).** Each level's `setup`/`evaluate`
are TypeScript functions that call the engine, so they cannot live in a table.
Rather than split metadata (DB) from logic (code), the whole level — metadata +
logic — is a code registry. The DB continues to store only telemetry. A `levels`
table stays available as future work if teachers ever need to curate the catalog
without a redeploy.

- `types.ts` — `LevelMeta` (id, title, description, `difficulty` 1–3, `tags`,
  `hints`, optional `comingSoon`) and `LevelDefinition extends LevelMeta` (adds
  `setup`/`evaluate`). `ChallengeEngine` moved here (was in `challenge-01.ts`,
  still re-exported there for the `SimulationEngine` import). `tags: LevelCategory[]`
  (`motors | sensors | lights | sound`) drive the grid's category filter and reuse
  the SPIKE toolbox palette colours.
- `index.ts` — `LEVELS: Level[]` catalog + `isPlayable()` type guard + `getLevel(id)`.
  All three entries are playable: `challenge01`, `challengeBoat`, `challengeCave`
  (`comingSoon` metadata placeholders remain supported for future levels).
- `challengeStore` — replaced the unused narrow `Challenge`/`setChallenge` with
  `activeLevel: LevelDefinition | null` + `setActiveLevel`. **Single source of
  truth**: `SimulatorCanvas`, `ControlPanel`, and `ChallengePanel` all read the
  active level from the store (no more direct `challenge01` imports).
- `SimulatorApp.SimulatorReady` gates on `activeLevel`: `LevelSelect` shows
  **immediately** (no upfront preload); selecting a level sets the store and
  mounts `App` behind a **per-level `LevelAssetsGate`**. The gate loads exactly
  what the level uses — `levelAssets(level)` = the SimpleRobot part kit
  (5 catalog parts; always included because the imported-robot path falls back
  to SimpleRobot and `getPart` throws on cache misses) + the imported robot's
  packed model/source (env) + the level's `decorModels` — so the progress bar
  is honest instead of the old fixed 11-part preload. Parts load through a
  shared `LDrawLibraryManager.preloadParts` (cached keys complete instantly on
  level switches); models are warmed into the browser HTTP cache with `fetch`.
  The "← Niveles" button (`App` → `ControlPanel` `onBackToLevels`) clears the
  level. Because `App` unmounts on the way back, the next pick rebuilds the
  engine + scene fresh in `SimulatorCanvas` (which binds `activeLevel.setup`).
- **Completion** (`completion.ts`) — the ✅ badge is backed by a `localStorage`
  set (`brickcode.completedLevels`), written in `ControlPanel` when `evaluate()`
  succeeds. This mirrors the authoritative `challenge_evaluated {success:true}`
  telemetry event; a backend RPC deriving completion from events can replace the
  cache later. Offline-first and needs no migration.

---

## Reactive challenges & the boat/crocodile level

**Files**: `src/challenges/challenge-boat.ts`, `src/challenges/types.ts`,
`src/engine/SimulationEngine.ts`, `src/store/simulationStore.ts`,
`src/components/ControlPanel.tsx`, `src/engine/renderer/SimulatorCanvas.tsx`.

challenge-01 is a *finite* program ("move 2 s") — `interpreter.run().then()`
fires evaluation when the blocks finish. A **reactive** level (watch a sensor,
react with lights) is a `forever`-style loop that never resolves on its own, and
its world is animated (a crocodile approaches). Three pieces were added:

1. **Challenge lifecycle** (`types.ts` `ChallengeHandle`). `setup()` may now
   return `{ dispose, update?(dt), reset?() }` instead of a bare dispose fn (still
   supported — `loadChallenge` normalizes). `SimulationEngine._tick` calls
   `update(PHYSICS_DT)` each physics step **only while `status === 'running'`**
   (nothing creeps while the kid is dragging blocks). `resetChallenge()` runs on
   run-start (ControlPanel) and Reset (`resetRobot`).

2. **Per-level robot hint** (`types.ts` `RobotKind`; `SimulationEngine.create(canvas, kind)`).
   Reactive levels set `robot: 'simple'` — the procedural `SimpleRobot` always has
   a front distance sensor, whereas the env-var import (taxi) is motors-only.
   `SimulatorCanvas` passes `activeLevel.robot`. **Discriminator**: `hasSensor`
   must be true for the boat, else the Sensores category hides and it's unplayable.

3. **Scenario-driven stop** (`simulationStore.autoStopRequested` +
   `requestAutoStop`/`clearAutoStop`). When the scenario ends (croc reached the
   boat), `update()` raises the flag; a `ControlPanel` effect calls the shared
   `finishRun()` (stop interpreter → evaluate → record). `finishRun` is guarded on
   `status==='running'` so manual Stop, natural `run().then`, and auto-stop can all
   fire without double-evaluating.

4. **Scenario decides the end** (`LevelDefinition.scenarioDecidesEnd`). Without
   it, a *finite* reactive program ("repetir hasta que ve verde → luces") was
   evaluated the instant it ended — the loop exits at the colour sensor's 50 cm
   range, the sim froze, the croc never reached the 25 cm danger zone, and the
   verdict was the null-latch fallback (❌). With the flag, `ControlPanel` skips
   `finishRun` on natural program completion; the scene keeps playing (hub keeps
   the lights the program left) until `update()` latches a verdict and requests
   the auto-stop. Termination is guaranteed: the croc always reaches `ARRIVE_CM`,
   latching failure if nothing happened. Manual Stop/Reset unchanged.

5. **Per-level sensor kit** (`LevelDefinition.sensors` →
   `SimulationEngine.create(canvas, kind, sensors)` → `SimpleRobotConfig.sensors`).
   Mirrors the real kit: SPIKE Essential has **only the colour sensor** (distance
   is a Prime part), so the boat declares `{ distance: false, color: true }` —
   the Sensores category then shows only the colour block, the distance readout
   hides, and the distance-sensor part mesh is hidden on the rig. Both sensor
   objects are still constructed (the interpreter interface requires `sensor`);
   only the `hasSensor`/`hasColorSensor` gating changes.

**The boat level** (`challenge-boat.ts`): a kinematic-position-based crocodile
slides along the SimpleRobot sensor ray (x=0, y=0.4, from z=−0.355 toward −Z),
starting 90 cm out, at 18 cm/s. The sensor's `castRay(solid)` detects its collider
for free. `update()` **latches the verdict during the approach** (not at stop
time): success the moment the hub is lit while the croc is within `DANGER_CM`
(25), failure if it reaches `ARRIVE_CM` (4) unlit; `evaluate()` just returns the
latch. Solve path with existing blocks: `repetir hasta que (Distancia frontal < 25)`
then a `light_display_*` alarm — `controls_whileUntil` yields 50 ms/iteration so
the croc keeps moving.

**Real LEGO visuals** load async with a procedural fallback. `boat.ldr`/`coco.ldr`
were packed to `.mpd` (`LDRAW_LIB_PATH=… pnpm run pack-ldraw` — the packer already
globs every file in `models/source/`). `loadDecorModel(url)`
(`src/engine/ldraw/loadDecorModel.ts`) loads a packed `.mpd` as an origin-centred,
optionally size-fitted scene prop, returning `null` (never throwing) if the model
is absent. The crocodile swaps its proc mesh for `coco.mpd` inside the wrapper
group; the boat calls `SimpleRobot.setVisualHidden(true)` and drops `boat.mpd`
into the scene as a **static prop** standing in for the hidden (stationary) robot
while the sensor ray keeps firing. (`attachImportedVisual` — mounting a model on
the moving robot — sat unused until the cave level, below.) If a model isn't
packed, the proc croc / SimpleRobot hub stay.

**Per-level toolbox hiding** (`LevelDefinition.hiddenCategories`, resolves the old
follow-up about Movimiento showing on the stationary boat): a level lists toolbox
category names to hide (boat and cave: `['Movimiento', 'Motores']`).
`filterToolboxCategories(def, hidden)` (`robotBlocks.ts`) filters the **full**
toolbox (robot categories + Control/Matemáticas) and `BlocklyWorkspace` threads
`activeLevel?.hiddenCategories` from `challengeStore` into both the initial
inject and the `updateToolbox` effect.

---

## Cave level (challenge-cave): auto-drive, timing choreography, per-level environment

**Files**: `src/challenges/challenge-cave.ts`, `src/challenges/types.ts`,
`src/engine/SimulationEngine.ts`, `src/engine/renderer/SceneSetup.ts`,
`tests/challenges/challengeCave.test.ts`.

Level 3 inverts the boat's trick: the **robot itself is the moving actor**. The
level drives it (the kid has no movement blocks) and the kid programs only the
front light module connected to the hub — ON in the dark stretches, OFF beside the sleeping bats. Like the
real SPIKE Essential cave car, the build has **no sensors at all**, so this is
a **timing level**: the kid choreographs the light with `wait_seconds` blocks,
guided by what they can see coming (the dark mouth, the blue crystal glow).
Difficulty 2; `robot: 'simple'`, `sensors: { distance: false, color: false }`
(no Sensores category at all), `scenarioDecidesEnd: true`,
`hiddenCategories: ['Movimiento', 'Motores']`, tags `['lights']`.

1. **Level-driven robot**: `update(dt)` advances the car with
   `SimpleRobot.setScriptedPose()` at 18 cm/s along `-Z`, keeping the hidden
   physics rig aligned under `cave_car.mpd` without applying wheel torque. This
   matches the motorless real kit and prevents the decorative car from spinning
   around the hidden rear wheels. `reset()` calls **`robot.reset()` directly** —
   never `engine.resetRobot()`, which calls back into `challenge.reset()` and
   would recurse. It also zeroes the hub matrix state (`setHubMatrix`), otherwise
   a light left on from the previous run passes the first dark zone for free
   (run-start only calls `resetChallenge()`, not `resetRobot()`).

2. **Timing windows** (18 cm/s from z = 0): light must be ON before ~4.4 s
   (DARK_A at z ∈ [−8, −13]), OFF between ~7.2–10.8 s (bats at [−19.5, −24.5]),
   ON again between ~13.6–17.2 s (DARK_B at [−31, −36]); exit at z = −38
   (~21 s). Each toggle window is ~3.6 s — generous for kids; the hint gives a
   working rhythm (enciende → espera 8 → apaga → espera 7 → enciende). All cave
   geometry is visual-only — no colliders anywhere on the course. *(An earlier
   sensor-based design used drive-through `setSensor(true)` colour-curtain
   colliders; scrapped when the level was aligned with the sensorless real kit.
   The mechanism itself — rays hit Rapier sensor colliders unless
   `QueryFilterFlags.EXCLUDE_SENSORS` is passed; contacts ignore them — remains
   pinned by a test in `legoColorSensor.test.ts` for future levels.)*

3. **Verdict latching** (boat pattern): in a dark zone with the hub matrix unlit →
   crash (fail); in the bat zone lit → bats wake (fail); past `EXIT_Z` → success.
   All latch `active.result`, stop the motors and `requestAutoStop()`;
   `evaluate()` returns the latch.

4. **Per-level environment (mutate + record + restore)**: `SceneSetup` has no
   per-level hook, so the level mutates the shared scene in `setup()` — dusk
   background/fog, dimmed warm lights — and records an **undo closure per
   mutation** (`envRestore`), all replayed in `dispose()`. The global lights now
   carry `.name` tags (`ambient-light`, `hemi-light`, `sun-light`, plus
   `main-floor`/`main-grid`) so levels look them up with `getObjectByName`
   (instanceof fallback kept). Sky dome (per-vertex gradient sphere, `BackSide`,
   `depthWrite:false`, camera-centred each frame), stars, sun glow, fireflies,
   crystals and bats are all children of one `root` group → one `scene.remove`.
   Verified by StrictMode's double mount and by returning to level select
   (`challenge-01` must come back in daylight).

5. **`ChallengeEngine.cameraRig`** (optional; getter on `SimulationEngine`
   exposing `{ camera, controls: { target } }`): forced by geometry — the
   three-zone course runs to z ≈ −38 while the default camera
   sits at (0, 4, 7) with `maxDistance` 30. `update()` lerps `controls.target`
   toward the car and translates the camera by the same delta (preserving the
   kid's orbit angle); headless tests omit the rig, so every use is guarded. The
   physics ground collider is 100×100 (only the *visual* floor is 20×20 — the
   level adds its own strip), so no new collider is needed.

6. **Car visual via `attachImportedVisual`** (first real use of that API): a
   procedural stand-in mounts immediately, then the real **`cave_car.mpd`**
   swaps in async — the same upgrade path as boat/coco. `buildProcCaveCar()`
   builds a chunky yellow explorer car (chassis/cabin/windshield/bumper/roof
   bar/wheels) from primitives; mounting it also hides the default EV3-hub
   LDraw visuals, flagged by the user as rendering broken.
   `attachImportedVisual` assumes LDraw Y-down input and flips the group 180°
   around X, so the Y-up proc build lives inside a counter-flipped
   (`rotation.x = π`) inner wrapper. The LDraw model loads via
   `loadDecorModel(url, { fitLongest })` with the heading in the attach's
   `extraRotationY` (not `loadDecorModel`'s `rotationY` — that world-axis
   quaternion composes badly with the attach's euler flip). cave_car's missing
   printed head `3626cpb1354.dat` was resolved 2026-07-05 by copying it from
   Studio's `UnOfficial/parts/` into `draw-library/parts/` and re-packing
   (§Packing gotcha — same fix as the boat's `67351-bl`). Wiring the real model
   also exposed a latent attach bug: it *assigned* `group.position.y` from the
   bbox (correct only for groups arriving at position 0), so the pre-positioned
   `loadDecorModel` output floated in mid-air. Fixed to apply a delta on all
   axes; regression test in `tests/engine/simpleRobotVisual.test.ts`.

---

## Sky dome helper (daytime skybox)

**File**: `src/engine/renderer/skyDome.ts`.

`buildSkyDome(opts)` returns `{ group, dispose }`: a procedural daytime "skybox"
— an inward-facing gradient sphere (horizon → zenith), an optional additive sun
glow, and deterministic puffy clouds (golden-angle spiral over the upper dome).
A true cubemap needs 6 external textures, dead on arrival against the app's
no-external-asset constraint, so the dome is the house style (same trick as the
cave's inline `buildSky`: `side: BackSide`, `depthWrite:false`, `renderOrder:-1`,
`fog:false` — paints first, everything renders over it, backdrop stays full-colour
while props still fade into `scene.fog`).

Used by the two opening levels — **challenge-01** (taxi) and **challenge-boat**.
Both cameras only orbit the origin (`controls.target ≈ 0`, `maxDistance` 30), so a
radius-80 dome centred at the origin always contains the camera → **no per-frame
camera-follow** (unlike the cave car, which drives ~38 WU away and must re-centre
its dome each frame). Each level adds `sky.group` in `setup()` and calls
`sky.dispose()` + `scene.remove` in its teardown. Horizon defaults to the scene's
existing fog/background colour (`#9fd8f2`), so neither level touches `scene.fog`.
The cave keeps its own bespoke sunset `buildSky` (camera-centred, stars, warm
gradient) — not folded in, to avoid pre-generalizing a working complex level.

---

## Colour sensor

**Files**: `src/engine/colorRegistry.ts`, `src/engine/components/LegoColorSensor.ts`,
`src/engine/components/SimpleRobot.ts`, `src/interpreter/BlockInterpreter.ts`,
`src/blocks/definitions/robotBlocks.ts`, `src/store/simulationStore.ts`,
`src/components/SensorPanel.tsx`, `tests/engine/legoColorSensor.test.ts`.

The boat model visually carries a SPIKE **colour** sensor (part 37308), so the
sensor became functional. Design mirrors `LegoDistanceSensor` (a ray, stepped
after `world.step()`), but answers "*what colour* is the thing I hit?":

- **`colorRegistry`** — module-level `Map<colliderHandle, DetectableColor>`
  (`RED|GREEN|BLUE|YELLOW|WHITE|BLACK`). Detectable scene objects (the crocodile,
  future colour tiles) register on creation, unregister on dispose. Keyed on the
  Rapier collider handle the ray already returns — no extra geometry queries.
- **`LegoColorSensor`** — casts the same front ray with a deliberately **short
  range (50 cm** vs the distance sensor's 200) like the real part, and caches
  `colorForCollider(hit)`. Pure physics + state (no mesh — the model shows the
  part), so it tests headless.
- **`SimpleRobot`** — carries both sensors on the same front origin
  (`hasColorSensor = true`); `step()` moves both ray origins.
- **Block `sensor_sees_color`** — Boolean reporter *"¿Ve el color 🔴/🟢/…?"*
  that plugs into `si… entonces` / `repetir hasta que`. Chosen over a
  "detected colour" value reporter: no colour-comparison blocks needed, matches
  the SPIKE app, and keeps the CT signal (a condition) in one block. Interpreter
  case returns `colorSensor?.sees(code) ? 1 : 0`.
- **Data-driven UI** — `buildRobotToolbox(includeSensor, includeColorSensor)`
  builds the Sensores category per sensor kind; `simulationStore.hasColorSensor`
  gates it (same pattern as `hasSensor`). `_tick` publishes
  `detectedColor` (identity-guarded, render-cheap) and `SensorPanel` shows a
  swatch + name readout.
- **Boat level** — the crocodile's collider registers as `GREEN`, so the level is
  now solvable two ways: `Distancia frontal < 25` **or** `¿Ve el color verde?`
  (range 50 cm ≥ danger zone 25 cm, so the colour path also arms the alarm in
  time). A hint advertises the colour route.

Rapier caveat (encoded in the test): new colliders only appear in scene queries
(`castRay`) after the next `world.step()` — in the engine sensors always step
right after the world, so this is only visible headless.

---

## Model-driven sensor UI

**Files**: `src/store/simulationStore.ts`, `src/engine/renderer/SimulatorCanvas.tsx`,
`src/components/SensorPanel.tsx`, `src/components/BlocklyWorkspace.tsx`,
`src/blocks/definitions/robotBlocks.ts`, `src/engine/SimulationEngine.ts`,
robot classes (`SimpleRobot`, `DynamicRobot`).

The demo robot is whatever `.ldr` is configured (default `spike-taxi`, which is
motors-only). The surrounding UI used to assume a distance sensor always
existed (sensor panel, "Sensores" toolbox block, per-frame sensor push), which
mismatched a sensorless robot — the panel showed `Infinity cm` and the sensor
block always read max range.

**Decision (chosen by the user): drive sensor UI off the model, not remove the
sensor subsystem.** The `robot.sensor` contract and `LegoDistanceSensor` stay
intact (reversible; a future `.ldr` with a sensor part lights the UI back up
automatically), but the UI hides sensor-only affordances when the active robot
has none.

- Each robot exposes `hasSensor: boolean`. `SimpleRobot` = `true`;
  `DynamicRobot` = `description.sensors.length > 0`.
- `SimulatorCanvas` pushes `engine.robot.hasSensor` into
  `simulationStore.hasSensor` once the engine resolves.
- `SensorPanel` renders the distance readout only when `hasSensor` (the status
  label is always shown). It also treats non-finite readings as "no value".
- `robotBlocks.buildRobotToolbox(includeSensor)` builds the "Mi Robot" category
  with/without the "Sensores" label + `sensor_distance` block. `ROBOT_TOOLBOX`
  is kept (`= buildRobotToolbox(true)`) for compatibility.
- `BlocklyWorkspace` injects with the current `hasSensor` and calls
  `workspace.updateToolbox()` in a `[hasSensor, hasColorSensor]` effect when it
  changes — it does **not** re-inject (that would dispose the kid's blocks).
  **Gotcha:** the `ContinuousToolbox` plugin builds its single all-categories
  flyout once in `init()` and only refreshes it on block create/delete events,
  so a category added later by `updateToolbox` (Sensores arriving after the
  engine resolves) renders no blocks. The effect therefore also calls
  `toolbox.refreshSelection()`, which re-shows the flyout from the updated
  contents.
- `SimulationEngine._tick` only publishes `sensor.getValue()` to the store when
  `robot.hasSensor`.

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
- **Status labels**: `stopped` → "Idle", `running` → "Running", `paused` → "Paused" (English UI since the 2026-07 redesign).

## UI Design System (2026-07 redesign)

**Files**: `src/index.css` (single source of truth), all `src/components/*.tsx`, `src/dashboard/**`, `src/simulator/*.tsx`, `src/Home.tsx`, `src/main.tsx`

The whole app moved from an ad-hoc dark `gray-*` simulator + light `slate-*` dashboard to one **bright, SPIKE-Essential-style light theme** driven by design tokens.

### Tokens (Tailwind v4 `@theme` in `src/index.css`)

There is no `tailwind.config.js` — Tailwind v4 reads the theme from CSS. Semantic tokens generate utilities like `bg-canvas`, `text-ink`, `border-line`:

| Token | Value | Role |
|---|---|---|
| `brand-100…900` | LEGO yellow ramp, core `#FFD500`/`#F5C402` | brand accents; **always dark text on brand fills, never white** |
| `action-100…700` | SPIKE/LEGO blue, core `#0090F5`/`#006CB7` | primary buttons, links, focus ring (white on `action-600` ≈ 5.0:1 AA) |
| `success-*` / `danger-*` | `#15803D` / `#DA291C` cores | Run button, result banners (white text AA on the 600/700 shades used) |
| `canvas` `#EEF2F7` · `surface` `#FFFFFF` · `surface-2` `#F6F8FB` | — | page bg · cards/headers/drawer · sunken wells |
| `ink` `#1E293B` · `ink-muted` `#64748B` · `line` `#E2E8F0` | — | text · secondary text · borders |

- **Font**: Nunito Variable via `@fontsource-variable/nunito` (bundled by Vite — no CDN, honoring the no-external-assets constraint). Kid surfaces use bold/extrabold weights; the dashboard stays at regular/semibold for a calmer read.
- **Icons**: `lucide-react` replaced all emoji-as-icons in React UI (`Play`/`Square`/`RotateCcw`/`Blocks`/`LogOut`/`Lightbulb`/`CircleCheck`…). Icons next to text are `aria-hidden`; icon-only buttons carry `aria-label`. Blockly's in-house SVG data-URI block icons (`blockIcons.ts`) are unchanged. Emojis inside challenge *content* (titles/hints) intentionally remain.
- **Blockly theme is now `brickcode-light`** (`BlocklyWorkspace.tsx`): workspace `#F8FAFC`, toolbox `#FFFFFF`, flyout `#E8EDF4` (sunken one step so bright SPIKE blocks keep an edge), grid `#D7DEE8`, insertion marker `#B45309`. SPIKE block category colors are untouched. `.blocklyTreeRowSelected` gets a light bg override in `index.css`.
- **Category hex colors** in `LevelSelect.tsx` still mirror `robotBlocks.ts` (SPIKE palette); on light surfaces they are shown as colored **dots** next to neutral text, because white-on-cyan/yellow pills fail contrast.

### Accessibility conventions

- All interactive elements: `focus-visible:ring-2 ring-focus` (+ `ring-offset-2` on filled buttons); min hit target `min-h-11` (44px).
- Live regions: run result (`ChallengePanel` — the `aria-live="polite"` wrapper stays mounted so announcements fire), sim status (`SensorPanel`), loading progress (`LoadingScreen`).
- The Blockly drawer is an `<aside aria-label="Block editor">`; **Escape closes it** and returns focus to the `#blocks-toggle` button (`App.tsx`); the toggle carries `aria-pressed`/`aria-controls`.
- Global `prefers-reduced-motion` rule zeroes transition/animation durations (the 220ms drawer-resize timeout still fires and is safe — the drawer is already at final size).
- Form errors render in `role="alert"`; toggles use `aria-pressed`/`aria-expanded`.
- Dashboard: students remain pseudonym-only (no PII).

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
3. `LDRAW_LIB_PATH=~/ldraw-library pnpm run pack-ldraw`.

The script writes `public/ldraw/models/packed/<id>.mpd` for each entry in `LDRAW_CATALOG`.

`.gitignore` blocks `public/ldraw/parts/`, `public/ldraw/p/`, and `public/ldraw/LDConfig.ldr` defensively so the raw library can't be accidentally committed.

### Catalog

`scripts/ldrawCatalog.ts` is the single source of truth for which parts are bundled. Initial catalog covers what already exists in `src/engine/components/`:

| id | LDraw file | Used by |
|---|---|---|
| `brick-2x4` | `parts/3001.dat` | `LegoBrick` |
| `baseplate-32x32` | `parts/3811.dat` | `Baseplate` |
| `wheel` | `parts/3483.dat` | `LegoMotor` (wheel rim) |
| `tire`  | `parts/3482.dat` | `LegoMotor` (tyre — mounts on 3483) |

Adding a part = append to `LDRAW_CATALOG`, run `pnpm run pack-ldraw`, commit the new `.mpd`.

### Adding a source model (props & imported robots)

Whole models — a crocodile, a boat, an imported robot — live in
`public/ldraw/models/source/*.ldr` (Studio 2.0 / LDraw exports). Unlike parts,
**they are not listed in a catalog**: `packLDrawParts.ts` auto-discovers every
file in `source/` (`discoverSourceModels()`) and packs each to
`packed/<basename>.mpd`. So the full workflow to add one is:

1. Export/save the model as an `.ldr` and drop it in `public/ldraw/models/source/`.
   Every part it references must exist in the LDraw library (below), or packing
   fails for that file (the others still pack).
2. Pack (needs the raw LDraw library — it is *not* in the repo, see above):

   ```bash
   # Always pack with the project's library — it carries the Studio `-bl`
   # parts copied in for boat/cave_car (see the gotcha below). The pristine
   # copy in ~/Downloads/ldraw does NOT, and packing with it silently breaks
   # those models (boat.mpd loses 67351-bl and fails to render).
   LDRAW_LIB_PATH=/Users/sysadmin/Desktop/projects/capstone/draw-library pnpm run pack-ldraw
   ```

   The run reports `packing N source model(s)` and writes `packed/<name>.mpd`.
3. **Commit the `.mpd`** (not the source-library, not `source/` is optional but
   nice to keep). Teammates and CI use the committed `.mpd`; they never need the
   ~170 MB library.

Using a packed model in code:

- **As a decorative scene prop** (e.g. the crocodile): `loadDecorModel('/ldraw/models/packed/<name>.mpd')`
  in a level's `setup()` — origin-centred, `null`-safe if unpacked. See
  *Reactive challenges & the boat/crocodile level*.
- **As repeated scenery** (trees, rocks, reeds…): `placeProps(scene, url, placements, opts)`
  (`src/engine/ldraw/decorProps.ts`) — loads once, clones per placement, returns
  a `{ dispose() }` handle. See *Scene decoration & ambient animation*.
- **As the robot's visual** (e.g. the boat): `SimpleRobot.attachImportedVisual(group)`
  (exposed to levels via `ChallengeEngine.robot`), or the whole-robot env-var path
  `VITE_IMPORTED_ROBOT_MODEL=/ldraw/models/packed/<name>.mpd` → `DynamicRobot`.

Common tweaks (LDraw models load upside-down and at native size):
`loadDecorModel` flips 180° around X by default (`flip`) and can size-fit
(`fitLongest`, world units); `VITE_IMPORTED_ROBOT_FLIP` / `..._LIFT_Y` do the same
for env-var robots. Adjust orientation with a Y-rotation if the model faces the
wrong way.

**Gotcha — Studio custom parts (`-bl` suffix).** Studio 2.0 exports may reference
parts that only exist in Studio's own library
(`/Applications/Studio 2.0/ldraw/UnOfficial/parts/*-bl.dat`), not the standard
LDraw library. The packer only searches `parts/` + `p/`, so those references are
left **un-inlined**, and `LDrawLoader` then 404s trying to fetch them and the
whole model fails to render (symptom: the model silently doesn't appear, while
others load fine). Diagnose by scanning the packed `.mpd` for `type-1` refs whose
target isn't a `0 FILE` in the same file. Fix by copying the missing
`UnOfficial/parts/<id>.dat` into the pack library's `parts/` and re-packing (their
sub-primitives are usually already standard). This is how `boat`'s `67351-bl` hub
was resolved. Separately, to drop a coiled **cable** from the model, edit the
source `.ldr` to reference the plain part instead of the `…c01` "with cable"
assembly — `boat` swaps `47592c01-bl` (LED Matrix with Coiled Cable) for `47592`
(matrix only), same idea as the taxi using plain parts. *(cave_car's unresolved
printed head `3626cpb1354.dat` was fixed the same way on 2026-07-05 — copied into
`draw-library/parts/` and re-packed; the part's sub-primitives were already there.)*

### Scene decoration & ambient animation

Levels dress their scenes with two mechanisms, both purely visual (no Rapier
bodies, invisible to the distance/colour sensors):

- **LDraw decor props** — small hand-written `.ldr` compositions in
  `source/` (`tree-pine`, `tree-palm`, `rock-big`, `reeds`, `flowers`), packed
  like any source model. `placeProps(scene, url, placements, opts)`
  (`src/engine/ldraw/decorProps.ts`) loads the `.mpd` once via `loadDecorModel`
  (so it inherits `flip`/`fitLongest`/`bottomY` normalization, default
  `bottomY: 0` to rest on the floor) and clones it per placement
  (`{x, z, y?, rotationY?, scale?}`). Clones share geometry/materials, so the
  returned handle's `dispose()` removes all instances and frees GPU resources
  once via the original. Like `loadDecorModel` it never throws — unpacked model
  or headless tests (no LDraw manager) simply place nothing. Each instance is
  wrapped in an outer `Group` so per-placement rotation/scale never composes
  with the loader's internal flip.
- **`ChallengeHandle.ambient(dt)`** — optional hook called by
  `SimulationEngine._tick` once per rendered frame *regardless of run state*
  (unlike `update`, which is gated on `running`). Used by the boat level to
  animate the river: each frame the water plane's vertices are displaced by
  three overlapping sines AND recoloured per-vertex from their wave height
  (trough `#1565C0` → crest `#42A5F5` → foam `#90CAF9`, `vertexColors` +
  `flatShading`, no `computeVertexNormals`). Height-based colouring is what
  makes the waves read from any camera angle — pure lighting contrast on the
  facets was invisible, and letting troughs dip below the deep slab produced
  ugly hard-edged dark patches (the trough floor must stay above the slab:
  `WATER_BASE_Y − WAVE_AMP > 0.01`). Ambient must never touch gameplay or
  physics.

The boat level's river is three procedural meshes (solid deep-water slab under
a translucent animated wave plane, flanked by two sand-bank boxes) plus banks
of palms/reeds/rocks/flowers via `placeProps`; challenge-01 scatters
pines/rocks/flowers around the field perimeter. All positions keep clear of the
robot's driving lane.

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

Runtime cache for the packed LDraw parts produced by `pnpm run pack-ldraw`. One instance is created at app startup, `preloadAll()` is awaited before the simulator scene mounts, and components retrieve clones via `getPart(key, color?)` instead of authoring `BoxGeometry`/`CylinderGeometry` themselves.

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
3. Run `LDRAW_LIB_PATH=… pnpm run pack-ldraw` and commit the new `.mpd`.

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
`main.tsx` after `preloadAll`) and forwards it to `SimpleRobot`, which
distributes it to the hub/motor visuals, both `LegoMotor` wheel clones, and the
`LegoDistanceSensor`. The kinematic chassis box and `SimpleMotor` stub that
existed during Sprints 3-4.3 are gone.

---

## SimpleRobot (Task 4.4)

**File**: `src/engine/components/SimpleRobot.ts`

`SimpleRobot` is a full LEGO robot built from LDraw parts. It replaces the
former `BoxGeometry` chassis + `SimpleMotor` stub.

### Decisions

- **(b) Real LDraw scale.** Robot is sized 1:1 to LDraw geometry (Hub EV3 ≈ 1.13 × 1.12 × 0.45 WU). Camera (`SceneSetup.ts`) was retuned to `(0, 4, 7)` looking at `(0, 0.4, 0)` and the challenge-01 wall was enlarged to 1.6 × 0.6 × 0.2 WU so it reads as an obstacle next to the robot.
- **(β) Dynamic body with revolute-joint wheels.** The hub is a single dynamic body with a *compound collider* (hub box + 2 motor boxes); the sensor is intentionally not part of the compound (its ray would self-hit). Each wheel is a separate dynamic cylinder body. Two `LegoMotor` instances anchor on the hub and drive each wheel via `RevoluteImpulseJoint`. This required adding `anchorBody` + `anchorLocalPoint` to `MotorConfig` (see *LegoMotor → Optional external anchor body*).

### Layout (in world units, robot faces −Z)

| Part        | Half-extents (X,Y,Z)         | Centre (world)                |
|-------------|------------------------------|-------------------------------|
| Hub (cuboid) | 0.565 × 0.56 × 0.225        | `(0, 0.6, 0)`                 |
| Motor M ×2   | 0.12 × 0.19 × 0.19           | `(±0.685, 0.28, 0)` (compound)|
| Wheel ×2     | r = 0.28, half-h = 0.07      | `(±0.875, 0.28, 0)`           |
| Sensor       | 0.28 × 0.14 × 0.13 (visual only) | `(0, 0.4, -0.355)`        |

`wheelBaseWU = 1.75` (`2 × 0.875`). `BlockInterpreter` constants updated to
`WHEEL_RADIUS_WU = 0.28`, `WHEEL_BASE_DEFAULT = 1.75` so `robot_turn` duration
math matches the new geometry.

### Drive direction inversion

Both `LegoMotor` instances share `axis: 'x'`, so a positive joint motor
velocity spins both wheels the *same* way relative to the chassis. To keep the
`BlockInterpreter` convention (`left.setSpeed(+n) && right.setSpeed(+n)` =
forward), the `motors.left` IMotor wrapper inverts its sign before delegating
to the underlying `LegoMotor`. The right side passes through unchanged.

### Sensor origin

The sensor has no rigid body. `SimpleRobot.step(dt)` projects the
hub-local sensor offset through the hub's current rotation each frame and
calls `sensor.setWorldPosition(world)`. **Direction is not rotated** — for
straight-line driving the hub yaw is ≈ 0; if `robot_turn` is used during
sensing, the ray will still point along world −Z. Adding a `setWorldDirection`
to `LegoDistanceSensor` is left to a follow-up.

### reset()

The hub and both wheels are dynamic, so `reset()` snaps each body's
translation/rotation back to its initial pose and zeros both linear and
angular velocity. Both motors are braked via `stop()`.

---

## Imported LDraw Models (level 1 — visual only)

**Files**: `scripts/packLDrawParts.ts`, `src/engine/ldraw/LDrawLibraryManager.ts`,
`src/engine/components/SimpleRobot.ts` (`attachImportedVisual`),
`src/engine/SimulationEngine.ts` (env-flag wiring), `public/ldraw/models/source/`.

### Goal

Let a kid (or designer) export a robot model from Studio 2.0 (`File → Export As → LDraw .ldr`),
drop it into `public/ldraw/models/source/<name>.ldr`, and see it rendered in the simulator.
The physics is **unchanged**: `SimpleRobot` still has the same compound hub
collider, two dynamic wheels, two `LegoMotor` joints, and the front
`LegoDistanceSensor`. The imported model is decoration parented to the hub —
when the hub moves/rotates, the model moves with it; the procedural hub/motor
visuals are hidden so they don't bleed through.

### Pipeline

1. Place `<name>.ldr` (or `.mpd`) under `public/ldraw/models/source/`.
2. Run `LDRAW_LIB_PATH=~/ldraw-library pnpm run pack-ldraw`. The packer
   processes both `LDRAW_CATALOG` and every file in `models/source/`,
   inlining all referenced parts. Output: `public/ldraw/models/packed/<name>.mpd`.
3. Set `VITE_IMPORTED_ROBOT_MODEL=/ldraw/models/packed/<name>.mpd` in
   `.env.local` (or omit it to keep the procedural robot).
4. `LDrawLibraryManager.loadModel(url)` is called from `SimulationEngine.create`;
   the resulting `THREE.Group` is handed to `SimpleRobot.attachImportedVisual`,
   which auto-recentres it (bottom-centre → hub origin) and parents it to the
   hub.

### Why a Vite env var

`VITE_IMPORTED_ROBOT_MODEL` is read at build time, so a project without the
flag (or without a packed model) falls back to the existing procedural robot
with zero runtime cost and no exception path. CI / unit tests stay unchanged.

### Limitations of level 1

- **All procedural meshes are hidden, but the bodies still drive motion.**
  `attachImportedVisual` calls `setVisualVisible(false)` on both motors (hides
  the wheel cylinders, parented to scene root) and `setBodyVisible(false)` on
  the distance sensor (hides the EV3 sensor LDraw mesh). The underlying
  Rapier wheel cylinders, motor joints, and ray cast continue to function —
  the robot still drives, the sensor still reads. The imported model is
  purely cosmetic on top.
- **Default 180° X-flip + bottom-to-ground alignment.** Studio 2.0 exports
  often come out upside-down relative to `LDrawLoader`'s Y-flip (same issue
  as the EV3 hub 95646.dat, which carries the same rotation patch in
  `SimpleRobot`). `attachImportedVisual` applies `rotation.x = π` by default,
  centres the model on X/Z by its bounding-box centroid, and translates Y so
  the bbox bottom sits at the world ground plane (y=0).
- **Wheel mismatch is inherent at level 1.** Physics has exactly two
  cylindrical wheels (radius 0.28 WU) parented to the procedural rig. If the
  imported model has 3 wheels, casters, balloon tyres, or different radii,
  not all of them can touch the floor visually — the bbox alignment can pin
  one set to the floor but the others will sink or float. This is a level-3
  problem (read wheel positions from the `.ldr` and rebuild the physics rig
  to match). For level 1, use the `VITE_IMPORTED_ROBOT_OFFSET_{X,Y,Z}` and
  `VITE_IMPORTED_ROBOT_YAW_DEG` env vars in `.env.local` to nudge the model
  by hand until the visual mismatch is acceptable.
- Sensors, motors, and beams in the imported model are not detected — if the
  user's robot has no distance sensor (e.g. `spike-taxi.ldr`), the simulator's
  ray still casts from a virtual front offset; it will simply read max range.
- Recentring is naive (axis-aligned bounding box, bottom-centre). Models with
  trailing tails or off-axis hubs may sit visually off-centre and need
  `extraOffset` / `extraRotationY` overrides.

### Path to level 3 (semantic parsing — "which part is what, and where")

Yes, the `.ldr`/`.mpd` text format makes level 3 viable. Each non-comment line
is `1 <colour> <x> <y> <z> <a..i (3×3 rotation matrix)> <part>.dat` — i.e. one
referenced part with full position and orientation in LDU. We can scan that
text before handing it to the loader and extract a structured robot
description without any geometry inference. Concretely:

1. **Part dictionary**: map known LDraw `.dat` ids to semantic roles.
   - `95646.dat` → Hub EV3 (single, defines chassis frame)
   - `67351.dat` (+ `c01` variant) → Hub Spike Essential / Powered Up 2-port
   - `99455.dat` → Medium motor (drives a wheel — axis = motor's local +X)
   - `95658.dat` → Large motor
   - `68488.dat` (+ `c01` variant) → Spike Essential small angular motor
   - `95652.dat` → Distance sensor (sensor origin = part origin, ray axis = part −Z)
   - `95650.dat` → Color sensor
   - `3483.dat` (+ optional `3482.dat` tyre) → Wheel — match by spatial proximity
     to a motor to decide which motor drives which wheel.
   - `65834p01.dat` → Spike wheel with integral azure tyre (single-piece)
   - `4185.dat` (+ `2815.dat` tyre) → Wedge belt wheel (used as front caster on
     spike-taxi)
   - Beams (`32523`, `32316`, …) → structural-only, ignored physically.
2. **Frame conversion**: every line gives a 3×3 rotation + translation in LDU.
   Multiply translation by `LDU_TO_WU = 1/250` and convert the rotation matrix
   to a `THREE.Quaternion`. LDraw is right-handed Y-down; `LDrawLoader` flips
   Y for rendering, so for physics we either replicate that flip (negate Y on
   translation, conjugate the rotation) or skip the loader's flip and apply
   the conversion ourselves once. Pick one and stay consistent.
3. **Pairing**: for each motor, find the nearest wheel (Euclidean distance in
   chassis-local space) within a threshold (e.g. < 0.5 WU). The wheel's centre
   becomes the joint anchor; the motor's local +X (after rotation) is the
   joint axis.
4. **Hub frame**: the hub part's transform defines the chassis pose. All other
   parts are converted into hub-local space by left-multiplying with the
   inverse of the hub transform — that gives stable offsets independent of
   where the user placed the model in Studio.
5. **Synthesis**: emit a `RobotDescription` (`{ hub: {halfExtents}, motors:
   [{anchorLocal, axisLocal, wheel: {radius, halfWidth, anchorLocal}}],
   sensors: [{kind, originLocal, directionLocal}] }`). `SimpleRobot` takes
   that instead of the hard-coded `HUB_HALF` / `WHEEL_X` / etc. Compound
   colliders are sized from the part dictionary (each known part has a known
   bounding box in LDU).

So the answer to "if we move imported models to pieces, can we know how and
where each piece goes?" is **yes** — the `.ldr` text already encodes
`(part_id, position, rotation)` for every brick. We don't need geometry
heuristics; we need a part-id → role lookup table plus a pair-matching pass.
The hardest part is decisions, not parsing: handedness (which side is "left"),
caster wheels vs driven wheels, and what to do with structural beams that
should not produce colliders.

The `spike-taxi.ldr` already in the repo is a good acceptance test for the
parser: one `67351` (Spike Essential hub), two `68488c01` (Spike small motors)
in the back, two `65834p01` driven wheels paired with them, and two front
`4185`/`2815` wedge-belt wheels that become free casters. If a parser
produces a hub count of 1, a motor count of 2, two driven wheels, and two
casters, the round-trip sanity-checks.

**Note on Studio export quirk:** Studio 2.0 emits part filenames with a
`-bl.dat` suffix or `bl_` prefix for any piece sourced from the BrickLink
catalog (e.g. `67351-bl.dat`, `bl_973c07.dat`). The official LDraw equivalents
(without those affixes) live in the standard library. Strip the affixes
before packing — the geometry is identical and the packer otherwise fails to
resolve the references. CRLF line endings (Studio default on Windows exports)
also need normalising to LF.

---

## DynamicRobot (parsed `.ldr` → physics rig)

**Files**: `src/engine/components/DynamicRobot.ts`,
`src/engine/ldraw/buildRobotDescription.ts`.

`DynamicRobot` consumes a `RobotDescription` produced by
`buildRobotDescription` from a parsed `.ldr` and synthesises a Rapier rig:
one dynamic chassis body, one dynamic cylinder per driven wheel, one
`LegoMotor` revolute joint per motor, plus optional caster bodies and a
distance sensor. It implements `ISimpleRobot`, so the `BlockInterpreter` does
not know whether it is driving the procedural `SimpleRobot` or a parsed
robot.

### Wheel axle deduction

`buildRobotDescription` does **not** hardcode the wheel axle. For each wheel
instance it applies the part's world rotation (extracted from the LDraw 3×3
matrix) to the part's authored axle direction `(0, 1, 0)`, then snaps the
result to the dominant horizontal world axis (`±X` or `±Z`). Both the
`WheelSpec` and the paired `MotorDriveSpec` adopt that axle, so the
`RevoluteImpulseJoint` axes always agree with the physical orientation in the
`.ldr`. Without this, every wheel ended up with a hardcoded `+X` axle, which
worked for the procedural robot but produced wheels-spin-but-robot-rotates
behaviour for any imported model whose wheels are mounted along Z.

### Chassis cuboid lifted off the floor

The hub body sits at `chassisY = wheelMaxRadius` so the lowest wheel's
contact point lands on the floor. But the AABB-derived `hubHalfExtents.y`
can be tall enough (≈ 0.43 WU for speed-bot) that a centred cuboid would
poke below `y = 0`. `DynamicRobot` therefore offsets the cuboid collider
inside the body by

```
chassisLocalY = FLOOR_CLEARANCE + half.y - (chassisY - wheelMaxRadius)
              = FLOOR_CLEARANCE + half.y               (in practice)
```

with `FLOOR_CLEARANCE = 0.05`. Without this offset the cuboid rested on the
floor, the joints dragged the wheel bodies down, and the wheels could not
roll even when the joint motors were firing.

### Pitch/roll lock for differential-drive imports

Studio-exported robots driven by two motors (whether bicicles or 4-wheel
cars with rear drive + front casters, like `spike-taxi.ldr`) all share the
same instability profile: small per-wheel solver imbalances accumulate as
chassis pitch/roll torques. With three free rotation axes the chassis tips
over on the first torque pulse and the cuboid pins itself to the floor.
`hubBody` is built with `enabledRotations(false, true, false)` so only yaw
is dynamic; pitch and roll are clamped. This is exactly the approximation a
differential-drive simulator wants and matches what kids expect ("the robot
turns but does not fall over"). Free front casters do not stabilise pitch
on their own — the lock is still required.

The angular damping is set to **`12`** (vs the original 4): with only yaw
free, small per-wheel solver imbalances would otherwise produce a visible
side-to-side wobble while driving straight. 12 still leaves `robot_turn`
responsive at the interpreter's 180 deg/s default.

### Drive direction

After the axle snap, both wheels share the same world axis. A positive
joint motor velocity therefore spins both wheels the *same* way around that
axis. For a chassis facing −Z (typical Studio export), that direction
pushes the robot **backwards** in world coordinates, so `DynamicRobot`
inverts the sign on **both** sides in the `IMotor` wrappers — `setSpeed(+n)`
on the interpreter side ⇒ robot moves forward as kids expect. Differential
turning (left = −right) is preserved because the inversion is symmetric.

### Collision groups

Chassis is in bit 0, wheels in bit 1; chassis filters out wheel bit and
vice versa. The chassis cuboid (often wider than the wheelbase) therefore
never pushes wheels around, but both still collide with the floor.

### Spinning wheel visuals (`_attachSpinningWheelVisuals`)

Originally the only *spinning* visual was the `LegoMotor` procedural cylinder
(and the caster cylinder), while the imported `.ldr` model — including its own
wheel meshes — was parented to the chassis as **static** decoration. With
`VITE_HIDE_PROCEDURAL_WHEELS=true` the cylinders are hidden, so the robot drove
but the visible LEGO wheels never turned. The `partIndex` fields on `WheelSpec`
/ `RobotDescription` were added for this step but had never been wired up.

`_attachSpinningWheelVisuals` now extracts each wheel's sub-group from the
loaded model and spins it in place to match physics:

- **Matching is by part filename + side, not 3D distance.** `LDrawLoader`'s
  frame plus DynamicRobot's `Rx(π)` flip leave the imported model
  **Z-mirrored** relative to `buildRobotDescription`'s Y-only reflection: the
  visible wheel and its physics body share X but have *opposite* Z. So
  3D-nearest pairs driven wheels with casters. Instead we filter model children
  by `parts[wheel.partIndex].partFile` (handling `LDrawLoader`'s `parts/`
  name prefix) and pick the nearest on the axle axis (the side coordinate,
  which the mirror preserves). `LDrawLoader` exposes each top-level part
  instance as a named, positioned child `Group` (`subobjectGroup.name =
  fileName`), so this is reliable.
- **The wheel stays at its visual position; only rotation comes from physics.**
  Each matched sub-group is re-parented (via `Object3D.attach`, which preserves
  world transform) to a pivot `Group` placed at the wheel's *visual* centre,
  child of `chassisGroup`. Each frame `step()` sets
  `pivot.quaternion = chassisQuat⁻¹ · wheelBodyQuat`, giving the pivot world
  quaternion = the physics wheel's quaternion. The spin axis is shared across
  the mirror and a round wheel has no chirality, so the visual rolls in the
  physically correct sense and direction — no commanded-angle integration and
  no sign guessing.
- **Only DRIVEN wheels spin; casters stay fixed.** Casters are free, jointless
  bodies whose rotation tumbles arbitrarily (the revolute joint that keeps a
  driven wheel rolling cleanly about its axle is absent). Binding a visual to
  that free rotation made spike-taxi's front wheels spin constantly, roll
  backwards, and skew on turns. Those wedge-belt front wheels (`4185` + `2815`)
  don't roll on the real model anyway, so their meshes are intentionally left
  inside `loadedModel` as static decoration — they travel and yaw with the
  chassis but never rotate. The free caster physics bodies still provide ground
  contact for stability.
- **Graceful degradation.** If no model mesh matches a wheel (unknown export),
  a warning is logged and that wheel simply doesn't spin; the rest are
  unaffected. `VITE_HIDE_PROCEDURAL_WHEELS=true` stays the intended setting —
  the extracted LDraw wheels are the spinners; the procedural cylinders remain
  hidden.

---

## Block Editor UX

**Files**: `src/components/BlocklyWorkspace.tsx`, `src/App.tsx`, `src/blocks/definitions/robotBlocks.ts`, `src/index.css`

- **Renderer `zelos`**: rounded-edge blocks (Scratch-style), better suited for ages 8–12 than the default `geras`.
- **`move` + `zoom` enabled**: scrollbars on both axes, wheel pan, wheel-zoom, pinch-zoom, on-screen zoom controls. `startScale: 0.9`, `[0.5, 2]` range.
- **`grid.snap: true`** (spacing 20px): drag placement snaps to a grid so the workspace stays tidy.
- **Drawer width is 50vw with `min-w-[420px]`**: fills half the viewport on desktop while staying usable on small screens.
- **Drawer resize timing**: the drawer animates in via a 200ms CSS transform. `App.tsx` schedules `Blockly.svgResize` via a 220ms timeout (not `requestAnimationFrame`) so flyout/toolbox metrics are computed *after* the transform settles. Resizing earlier was the cause of "flyout doesn't reappear on second category click".
- **Toolbox uses `kind: 'label'` instead of `kind: 'sep'`**: the previous separator items rendered visible horizontal bars in the flyout. Labels (`Movimiento`, `Sensores`, `Tiempo`) provide grouping without the bar.
- **Theme contrast**: three distinct shades so the panes visually separate — since the 2026-07 light redesign: toolbox `#FFFFFF`, flyout `#E8EDF4`, workspace `#F8FAFC` (theme `brickcode-light`). `flyoutOpacity: 1` (was 0.9 — caused blending).

---

## SPIKE Essential Blocks & Hub Light Matrix

**Files**: `src/blocks/definitions/robotBlocks.ts`, `src/interpreter/BlockInterpreter.ts`, `src/engine/HubLights.ts`, `src/components/HubMatrixPanel.tsx`, `src/store/simulationStore.ts`

The block palette is being aligned with **LEGO Education SPIKE Essential** (see
`docs/spike-essential-blocks.md` for the full catalog, roadmap, and reference-repo
learnings). We took the **superset** path: the existing distance sensor (a SPIKE
*Prime* sensor) stays, and SPIKE Essential hardware is layered on top, so
`challenge-01` and the physics code are untouched.

### Toolbox restructure

`buildRobotToolbox(includeSensor)` now returns **multiple SPIKE-style categories**
(Eventos · Movimiento · Luz · Sensores · Tiempo) with the SPIKE colour palette,
instead of the previous single "Mi Robot" category. `BlocklyWorkspace` still
appends the built-in Control and Matemáticas categories. `ROBOT_TOOLBOX` remains
exported (`= buildRobotToolbox(true)`) for backward compatibility.

### New blocks (Phase 1)

| Block | Category | Interpreter behaviour |
|-------|----------|------------------------|
| `event_when_started` | Eventos | Cosmetic hat. No-op in `executeStatement`; `executeSequence` runs the blocks connected beneath via `getNextBlock()`. |
| `robot_move_for` | Movimiento | `DIRECTION` (FORWARD/BACKWARD) × `AMOUNT` × `UNIT` (ROTATIONS/DEGREES/SECONDS). Converts amount → drive duration at `MOVE_SPEED_DEG_S = 180` (rotations → ×360 wheel-deg; seconds → used directly), drives both motors, auto-stops. |
| `light_display_matrix` | Luz | Drawable 3×3 pixel editor on the block (official `@blockly/field-bitmap`, Apache-2.0). Field value is `number[][]` of 0/1; `matrixToPattern` flattens row-major and maps lit→100. |
| `light_display_image` | Luz | `hub.displayImage(PRESET_IMAGES[name])` — 9-value row-major patterns (CORAZON, CARA, CUADRADO, EQUIS, FLECHA, LLENO). Quick presets, kept alongside the drawable editor. |
| `light_set_pixel` | Luz | `hub.setPixel(row-1, col-1, brightness)` — block fields are 1-based for kids; hub API is 0-based. |
| `light_off` | Luz | `hub.clearDisplay()`. |
| `motor_run_for` | Motores | `motorsByPort[PORT].setSpeed(±180)` for a computed duration (rotations/degrees/seconds), then stop. Direction dropdown (→/←) sets the sign. |
| `motor_start` / `motor_stop_port` | Motores | Continuous start / stop of one port. |
| `motor_position` *(reporter)* | Motores | `motorsByPort[PORT].getAngle()` → degrees (in `evaluateValue`). |
| `sound_beep` / `sound_play_note` | Sonido | `sound.playTone(hz, ms)` + `await sleep(ms)` (plays until done). Beep = 880 Hz; notes Do–Si map to C4-octave frequencies. |
| `sound_stop` | Sonido | `sound.stop()`. |
| `operator_random` *(reporter)* | Operadores | Random integer in `[FROM, TO]` (in `evaluateValue`; lives in the Matemáticas category). |
| `controls_if` *(extended)* | Control | Now walks `IF0..n`/`DO0..n` else-if arms plus an optional `ELSE` branch, so Blockly's if/else mutation is interpreted. |

### Hub 3×3 light matrix (`IHub` → `HubLights` → store → panel)

SPIKE Essential's signature hub feature is a 3×3 light matrix. It is modelled as
**pure state**, not 3D geometry, so it runs headlessly in Vitest:

- **`IHub`** (in `BlockInterpreter.ts`) is the hub-effects surface
  (`setPixel`, `displayImage`, `clearDisplay`). It is **injected into the
  interpreter constructor** (`new BlockInterpreter(robot, hub)`) rather than
  hung off the robot — the robot interface stays about locomotion, and tests can
  pass a `mockHub` or omit it (light blocks become no-ops).
- **`HubLights`** (`src/engine/HubLights.ts`) implements `IHub`, holds a 9-value
  brightness array (row-major, 0–100, clamped), and pushes a copy to
  `simulationStore.setHubMatrix` on each change. No Three.js/WebGL dependency.
- **`simulationStore.hubMatrix`** (length `HUB_MATRIX_SIZE = 9`) holds the
  current state; `SimulationEngine.resetRobot()` calls `hub.clearDisplay()` so
  the matrix turns off on Reset.
- **`HubMatrixPanel.tsx`** renders the 9 cells as a glowing green grid overlay
  (top-left of the canvas, in a column with the orbit hint), brightness → opacity.

### Why the matrix was pulled forward from Phase 2

It is fully self-contained (no physics, no scene work), the most recognisable
SPIKE Essential feature, and headless-testable — so it shipped in Phase 1
alongside the movement/event blocks. The Color Sensor (the other Essential
sensor) stays in Phase 2 because it needs colored scene objects + a raycast
sensor.

### Motors by port (`motorsByPort`)

SPIKE addresses single motors by hub port. **Both** `SimpleRobot` and
`DynamicRobot` expose `motorsByPort` mapping `A → left`, `B → right` using the
**raw** (un-inverted) `LegoMotor` instances — the per-port blocks carry their own
direction dropdown, so the wrapper inversion used by the movement blocks
(`motors.left`) is bypassed. The robot interface field is optional; a robot
without it makes the `motor_*` blocks no-ops. `motor_position` reuses
`LegoMotor.getAngle()`. (Verified in-browser with the `spike-taxi` `DynamicRobot`
import — the Motores category drives the parsed model's motors.)

### Hub sound (`ISound` → `HubSound`)

`ISound` (`playTone`, `stop`) is injected as the **third** interpreter
constructor arg (`new BlockInterpreter(robot, hub?, sound?)`), same pattern as
`IHub`. `HubSound` (`src/engine/HubSound.ts`) is a WebAudio oscillator with a
**lazily-created `AudioContext`** — browsers block audio until a user gesture, and
the Run button that starts interpretation is that gesture, so a context
created/resumed there may play. It is only constructed in the engine (browser);
headless tests pass a `mockSound` or omit it, so `AudioContext`'s absence in Node
is never hit. `SimulationEngine` disposes it in `dispose()` and stops it in
`resetRobot()`.

### Visual alignment with the SPIKE app

To make the blocks feel like the LEGO SPIKE app (whose reference simulator we
analysed — see `docs/spike-essential-blocks.md`):

- **`@blockly/field-bitmap`** (official Apache-2.0 plugin) backs
  `light_display_matrix` — a drawable 3×3 pixel grid embedded in the block, the
  way SPIKE's "display image" block works. Imported for its registration
  side-effect in `robotBlocks.ts`; the field self-registers as `field_bitmap`
  and ships its own CSS. The reference repo's `field-bitmap.ts` turned out to be
  a (modified, grayscale) copy of this same Google plugin — we use the upstream
  binary version instead of copying their code (their repo has **no LICENSE**).
  We pass `colours: { filled: '#7CFF6B', empty: '#2b2540' }` so a *filled* pixel
  looks **lit** (green, like `HubMatrixPanel`) and empty looks off. The plugin's
  defaults are the opposite (filled = dark `#363d80`, empty = white), which read
  backwards next to the hub card — the value semantics (`1` = lit) were always
  correct; only the editor's colours were inverted.
- **`startHats: true`** on the `brickcode-light` theme gives `event_when_started`
  a rounded hat cap, like SPIKE event blocks.
- **Inline direction icons** via `field_image` image-dropdowns: rotation ↻/↺ on
  the Motores blocks and ←/→ on `robot_turn`. The SVGs are drawn in-house as
  data-URIs in `src/blocks/definitions/blockIcons.ts` (we do **not** copy the
  reference repo's unlicensed icons). The dropdown VALUEs are unchanged
  (`CW`/`CCW`, `LEFT`/`RIGHT`), so the interpreter and existing programs are
  unaffected. Verified in-browser.
- **Leading per-block icons** (SPIKE puts an icon *inside* each block, left of
  its text): `blockIcon(src, alt)` builds a `field_image` used as the first
  `args0` entry, with `%1` prepended to `message0`. Every **action** block gets
  one — flag (events), four-way arrows (movement: `robot_*`), gear (motors:
  `motor_run_for/start/stop_port`), 3×3 dot grid (light: `light_*`), speaker
  (`sound_*`), clock (`wait_seconds`). **Reporters** (`motor_position`,
  `sensor_distance`) and operators get **no** icon. Glyphs are white-stroke 24×24
  SVGs in `blockIcons.ts`; they read on the coloured blocks. Adding a leading
  icon shifts every `%n` in that block's `message0` — the field names/VALUEs are
  untouched, so the interpreter is unaffected. Verified in-browser at 2×.
- **Per-category toolbox icons: deliberately *not* done.** Prototyped (a
  `ContinuousCategory` subclass turning the rail's `.categoryBubble` into a
  coloured chip carrying the glyph, since `@blockly/continuous-toolbox` ignores
  `cssconfig.icon`) and then **reverted** per the user's call that SPIKE icons
  belong inside the pieces, not the rail. The rail keeps its thin colour stripe
  (`src/index.css` `.categoryBubble`). See `docs/spike-essential-blocks.md`.

## Accounts model (CURRENT — supersedes the anon-student design below)

> ⚠️ **Privacy-model change.** The original design (Tasks B1/B2, documented in the
> following sections) had **anonymous, pseudonymous students** with "no PII, ever."
> The project later moved to **mandatory student accounts (email + password)**, like
> the teacher. The sections below describe the historical anon path; this section is
> the authoritative current state.

**Two authenticated roles**, distinguished by `user_metadata.role` set at signup:
- **Teacher** — email/password; `handle_new_user` creates a `teachers` row only when
  `role = 'teacher'` (absent = teacher, back-compat).
- **Student** — email/password (`role:'student'`, no teacher row). Linked to a
  `students` row via `auth_user_id`. Enrolls in a class with the teacher's code via
  the `join_class(code, pseudonym)` DEFINER RPC, then submits runs via
  `submit_session_auth(session, events)` DEFINER RPC (resolves the student by
  `auth.uid()` — no class code/pseudonym sent). The **anonymous `submit_session` RPC
  is removed**; there is no anonymous write path.

**RLS:** a student may read only their own `students` row (`auth_user_id = auth.uid()`,
to check enrollment); they never read sessions/events (writes go through the DEFINER
RPC). Teachers read their own classes/students/sessions/events via `owns_class`.

**Privacy posture (updated):** student **emails are PII held only in `auth.users`** —
teachers cannot read that table, and the dashboard shows **pseudonyms only, never
emails**. Storing minors' emails is a COPPA/GDPR-K consideration; the earlier "no PII"
claim no longer holds and is intentionally relaxed. Client: `StudentAuthGate` +
`StudentLoginForm` gate `/play`; `EnrollmentGate` + the enrollment screen call
`join_class`; `BackendSync` submits via the authenticated client + `submit_session_auth`.

---

## Backend (Supabase) — Task B1

> 🕑 *Historical (anon-student design). Superseded by the Accounts model above —
> `submit_session`/anon paths described here no longer exist.*

A shared backend makes the (future) teacher dashboard real: pseudonymous student
simulators submit learning sessions; a teacher reads them back on another machine.
Stack: **Supabase** (managed Postgres + Auth + RPC). Defined entirely as checked-in
SQL migrations under `supabase/migrations/` so the backend is reproducible and
reviewable. **B1 is backend-only** — the client sync layer/outbox and dashboard
reads (B2), plus the session/event *recording* layer that feeds them, are deferred
(see "Deferred" below).

### Data model

```
teachers  (id = auth.users.id, display_name, created_at)
classes   (id, teacher_id→teachers, name, class_code UNIQUE, created_at)
students  (id, class_id→classes, pseudonym, created_at)        -- NO PII, ever
sessions  (id [client-generated], student_id→students, class_id→classes,
           started_at, ended_at, challenge_ids text[], event_count, schema_version)
events    (id, session_id→sessions, type, t_monotonic, t_wall,
           challenge_id, payload jsonb, schema_version)
```

Indexes: `events(session_id)`, `sessions(student_id)`, `sessions(class_id)`,
`students(class_id)`. `payload jsonb` keeps the event schema flexible and enables
later server-side SQL aggregation. `schema_version` on sessions/events lets the
schema evolve without orphaning old data.

### Privacy & security model

Two very different users, and **students never log in** (they are young children):

- **Teacher (authenticated, email+password):** RLS scopes every row to the owning
  `class.teacher_id = auth.uid()`. A `security-definer` helper `owns_class(class_id)`
  expresses the ownership chain for `students`/`sessions`/`events` without recursive
  policy evaluation. A teacher sees only their own data.
- **Simulator (anon):** has **zero** table privileges (`revoke all ... from anon`)
  and **no** RLS policies. Its only reach is `execute` on the `submit_session` RPC.
  A direct `select` as anon is denied — belt-and-suspenders (grants + RLS).

A teacher row is created automatically on signup via the `handle_new_user()` trigger
on `auth.users`. `classes.class_code` defaults to `gen_class_code()` (6 chars, no
ambiguous glyphs) and `classes.teacher_id` defaults to `auth.uid()`, so creating a
class is a one-field insert that yields a unique code.

### Write path — `submit_session` RPC

`submit_session(p_class_code, p_student_pseudonym, p_session jsonb, p_events jsonb)`
is `SECURITY DEFINER` (`search_path = public`). It (1) validates the class code,
(2) upserts the pseudonymous student by `(class_id, pseudonym)`, (3) inserts the
session, (4) inserts events. **Idempotency:** the session `id` is *client-generated*;
the insert is `on conflict (id) do nothing`, and events are inserted only when that
insert actually created a row (`row_count > 0`). So re-sending a session that already
synced is a clean no-op — no duplicate sessions or events. This is what the B2 outbox
will rely on when retrying after a dropped connection.

### Keys & env

Client uses only `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (see `.env.example`).
The `service_role` key never appears in client code, env files that ship, or docs.

## Recording, Outbox & Sync (Client) — Task B2

B2 wires the app to the B1 backend: a child's program run is recorded locally,
buffered offline, and flushed to Supabase via the `submit_session` RPC, where the
teacher's read functions can retrieve it.

### Recording layer (`src/recording/`)

- **`SessionRecorder`** — records **one program run = one session**. The
  [ControlPanel.tsx](../src/components/ControlPanel.tsx) handlers drive its
  lifecycle: `startSession()` on Run → `recordEvent()` as the program executes →
  `endSession()` on Stop / natural finish (which *seals* it). Events:
  `program_run_started` (`payload.program` = the full Blockly snapshot, see
  *Learning Analytics Pipeline* below), `block_executed` (`payload.blockType`),
  `program_run_ended`, `challenge_evaluated` (`payload.success`). A per-session
  event cap (5000) bounds runaway `while`/`repeat` loops.
- **Interpreter telemetry** — [BlockInterpreter.ts](../src/interpreter/BlockInterpreter.ts)
  takes an optional `onBlock(blockType)` sink, called once per executed statement
  (the single choke point). [SimulationEngine.ts](../src/engine/SimulationEngine.ts)
  passes a sink that forwards to the recorder. The interpreter knows nothing about
  sessions/storage — keeps it framework-agnostic.
- **`outbox.ts`** — `idb`-backed store keyed by session `id`, write-through so
  nothing is lost if the network drops mid-class.

### Session-seal invariant (matches the B1 RPC)

A session `id` is **sealed at first flush** and never gains events afterward.
`submit_session` inserts events only when the session id is new (`row_count > 0`),
so re-flushing an already-synced session is a clean no-op. `program_run_ended`
seals + flushes; the `online`/periodic triggers only *retry* unsynced sealed
sessions, re-sending the identical (idempotent) bundle. A run that is **Reset**
mid-program is discarded (unsealed partials never flush — `endedAt` stays null).

### Sync & reads (`src/backend/`)

- **`BackendSync`** — `flush()` pushes unsynced sealed sessions through the RPC and
  `markSynced` on success; failures stay queued. `startAutoFlush()` retries on the
  `window 'online'` event and a periodic timer. **Privacy invariant:** this path
  *only* calls the RPC — it never reads a table.
- **`dashboardApi`** — authenticated teacher reads (`listClasses`, `listStudents`,
  `listSessions`, `loadSession`, `getClassEventStats`). RLS scopes every result; no
  client-side access filtering.
- **`get_class_event_stats(class_id)`** — `SECURITY INVOKER` SQL aggregation
  (run/failure counts + block-type frequency per student). Being a read, it runs as
  the teacher so the `owns_class` RLS chain scopes it automatically — another
  teacher's `class_id` returns zero rows.

### Identity

The simulator submits under a **class code** resolved by
[identity.ts](../src/backend/identity.ts): `localStorage` (`brickcode:classCode`,
set via the in-app join screen) takes precedence over the `VITE_CLASS_CODE` env
fallback. The pseudonym (`brickcode:pseudonym`) is a nickname the student may set,
else an auto `pupil-xxxx` — never PII.

## Teacher Dashboard & App Routing

The app serves **two audiences** from one Vite build, split by route and lazily
loaded so neither pulls the other's bundle ([main.tsx](../src/main.tsx)):

- `/` → `Home` (lightweight landing: title + teacher login button; eager, tiny).
- `/play` → `SimulatorApp` (Three/Rapier/LDraw/Blockly; behind the LDraw preload gate).
- `/dashboard/*` → `Dashboard` (teacher tool; ~26 kB chunk, none of the 3D stack).

The build confirms the split: `Dashboard-*.js` and `SimulatorApp-*.js` are separate
chunks. SPA history fallback (Vite dev/preview + any static host) resolves `/dashboard`.

### Auth-client separation (important)

Both audiences share one origin/localStorage, so two Supabase clients are used:
- **Teacher** (dashboard): the persisted, authenticatable `getSupabase()` singleton.
- **Simulator** (submit): `createAnonClient()` with `persistSession:false`, so the
  student's write path stays anonymous even if a teacher is signed in on the same
  browser. `BackendSync` uses this; it still only calls the RPC, never reads tables.

### Dashboard structure (`src/dashboard/`)

`AuthGate` (Supabase Auth session; `LoginForm` has a login/signup toggle —
`handle_new_user` makes the teacher row) wraps a react-router drill-down:
`ClassesPage` → `ClassPage` (students + `getClassEventStats`) → `StudentPage`
(sessions) → `SessionPage` (event timeline). All reads go through
[dashboardApi.ts](../src/backend/dashboardApi.ts); RLS scopes every result.

### Hosted Supabase

Local-only for now; `docs/hosting.md` covers `supabase link` + `db push` + env switch
to run against a cloud project (a guided, user-driven follow-up).

## Learning Analytics Pipeline (Data Science layer)

Turns recorded runs into interpretable **computational-thinking (CT) indicators**
for the teacher — the research contribution. Lives in [`src/analytics/`](../src/analytics/),
is **framework-agnostic and Blockly-free** (runs headlessly in Vitest and over
synthetic data), and consumes `LearningSession` read-only. The simulator never
imports it. Grounding for the CT/analytics framing is in `docs/references.md`.

### Instrumentation: program snapshot per run (not authoring events)

The pipeline needs the *structure* of the program at each run. On Run,
[ControlPanel.tsx](../src/components/ControlPanel.tsx) serializes the workspace
(`Blockly.serialization.workspaces.save`) and attaches it as `payload.program`
on `program_run_started`. `events.payload` is already `jsonb` and `loadSession`
reads arbitrary payloads, so **no DB migration / schema bump was needed**. The
serialization is wrapped (`snapshotProgram`) so a failure loses one snapshot but
never aborts the child's run.

**Authoring events (block created/deleted/moved) were deliberately deferred.**
The session model is *one session = one run*, so authoring happens between
sessions when no recorder session is active; capturing it would mean reworking
the sealed-session invariant. The pipeline does not need it: every indicator
derives from the run snapshot's AST + run outcomes, and the trajectory from tree
edit distance between successive run snapshots. (Slide 07 of the deck was worded
to match what is actually captured.)

### Module structure

- **`programTree.ts`** — parses a serialized snapshot into a normalized ordered
  tree. Design decisions: a synthetic `PROGRAM` root holds every top-level stack
  (so the forest becomes one rooted tree); a `next` statement chain becomes
  **siblings** (inserting one block = one edit); value/statement inputs become
  **children** (nesting = real structure). Node **label = block type only** by
  default, so the trajectory measures *structural* change, not number-fiddling
  (`includeFields` folds field values in when a finer signal is wanted). Plus
  `countByType` / `blockCount` / `maxDepth` for the indicators.
- **`treeEditDistance.ts`** — Zhang–Shasha TED over the trees (insert = delete =
  1, relabel = 0/1). Validated against the canonical paper example (distance 2)
  in `tests/analytics/`. Kid programs have tens of nodes, so cost is irrelevant.
- **`indicators.ts`** — the five CT indicators as 0..1 scores, each a documented,
  teacher-explainable heuristic over the reference program + trajectory:
  *loops* / *conditionals* (presence + variety of the loop / `controls_if` +
  `control_wait_until` blocks), *abstraction* (sensor reads + logic/comparison =
  reacting to the world), *decomposition* (nesting depth vs. a flat list),
  *debugging* (share of purposeful small edits across runs, bonus on eventual
  success). These are **proof-of-concept measures, not a trained model.**
- **`report.ts`** — `analyzeStudent(sessions)` → `StudentReport`: orders a
  student's runs, computes the trajectory (TED between successive snapshots), the
  indicators on the reference program (last successful, else latest), and a coarse
  **strategy label**: `decomposing` (reached a solution), `guessing` (changing a
  lot across runs, no success), `stuck` (barely changing, no success), `no-data`.
  The one threshold (`STALLED_EDIT`) is calibrated against the synthetic
  archetypes and documented inline.
- **`synthetic.ts`** — fabricates a class of students following the three
  strategies so the pipeline can be demonstrated at classroom scale despite the
  real cohort being ≈2. Clearly illustrative, separate from real records.

### Dashboard wiring

- [StudentPage.tsx](../src/dashboard/pages/StudentPage.tsx) loads a student's full
  sessions (`listSessions` → `loadSession`, N+1 at PoC scale) and renders
  `StudentReportPanel` — **real** CT indicators + programming-trajectory strip.
- [DemoClassPage.tsx](../src/dashboard/pages/DemoClassPage.tsx) (`/dashboard/demo`,
  linked from `ClassesPage`) runs the same `analyzeStudent` over
  `generateSyntheticClass()` to show the class-level indicator table (deck slide
  09), labelled as synthetic.
- Presentational only: [analyticsView.tsx](../src/dashboard/analyticsView.tsx)
  (`IndicatorBars`, `StatusPill`, `TrajectoryStrip`, `StudentReportPanel`).
