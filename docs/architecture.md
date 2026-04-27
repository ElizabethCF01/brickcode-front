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
