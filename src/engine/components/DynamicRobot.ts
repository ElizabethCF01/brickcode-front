import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { LegoMotor } from './LegoMotor'
import { LegoDistanceSensor } from './LegoDistanceSensor'
import type { LDrawLibraryManager } from '../ldraw/LDrawLibraryManager'
import type { IMotor, IMotorPort, SimpleRobot as ISimpleRobot } from '../../interpreter/BlockInterpreter'
import type { LDrawInstance } from '../ldraw/ldrParser'
import type { RobotDescription, MotorDriveSpec, WheelSpec } from '../ldraw/RobotDescription'

export interface DynamicRobotConfig {
  description:    RobotDescription
  parts:          LDrawInstance[]
  loadedModel:    THREE.Group
  ldraw:          LDrawLibraryManager
  /**
   * Desired horizontal placement (X,Z) of the chassis. Y is computed
   * automatically so the lowest wheel bottom rests on the floor (y=0).
   */
  position:       THREE.Vector3
  /**
   * Apply a 180° X rotation to the loaded model. Defaults to true to match
   * the buildRobotDescription frame convention (also Rx(π)).
   */
  flipUpsideDown?: boolean
}

/**
 * Robot reconstructed from a parsed `.ldr`.
 *
 * Physics derived from the description:
 *   - Chassis: dynamic body, cuboid collider sized from `hubHalfExtents`.
 *   - Each driven wheel: dynamic cylinder body + LegoMotor revolute joint.
 *     The LegoMotor's procedural cylinder is the VISIBLE wheel mesh — it
 *     spins with physics. The imported model's own wheel mesh stays as
 *     decorative geometry inside the chassis group (kept simple; matching
 *     LDraw sub-meshes to physics bodies is fragile and not worth it for
 *     the demo).
 *   - Each caster: dynamic cylinder body, no joint, also with a procedural
 *     visible cylinder.
 *
 * Visuals:
 *   - The loaded LDraw model is parented to the chassis as a single Group.
 *   - Optional `flipUpsideDown` applies `rotation.x = π` to the model so it
 *     renders right-side-up under LDrawLoader's convention.
 */
export class DynamicRobot implements ISimpleRobot {
  readonly hubBody:         RAPIER.RigidBody
  readonly sensor:          ISimpleRobot['sensor']
  // True only when the parsed `.ldr` contained a sensor part. Imported
  // motors-only robots (e.g. spike-taxi) are `false`, which the UI uses to
  // hide sensor-only panels/blocks.
  readonly hasSensor:       boolean
  readonly wheelBaseWU:     number
  readonly wheelRadiusWU:   number
  readonly turnCalibration: number

  readonly motors: { left: IMotor; right: IMotor }

  /** Per-port motors for the single-motor `motor_*` blocks (A→left, B→right). */
  readonly motorsByPort: Record<string, IMotorPort>

  private readonly world:           RAPIER.World
  private readonly scene:           THREE.Scene
  private readonly chassisGroup:    THREE.Group
  private readonly initialPosition: THREE.Vector3

  private readonly drivenMotors:      LegoMotor[]
  private readonly drivenWheelBodies: { body: RAPIER.RigidBody; centreLocal: THREE.Vector3 }[]
  private readonly casterBodies:    {
    body:        RAPIER.RigidBody
    visualGroup: THREE.Group
    geometry:    THREE.CylinderGeometry
    material:    THREE.MeshStandardMaterial
    centreLocal: THREE.Vector3
  }[]
  private readonly sensorComponent: LegoDistanceSensor | null
  private readonly sensorOriginLocal: THREE.Vector3 | null

  private readonly wheelCollisionGroups:   number
  private readonly chassisCollisionGroups: number
  private readonly virtualCaster: {
    geometry: THREE.SphereGeometry
    material: THREE.MeshStandardMaterial
  } | null = null
  private readonly _tmpVec = new THREE.Vector3()

  // Visible wheel meshes extracted from the imported LDraw model and spun in
  // place by their physics body's rotation each frame. See
  // `_attachSpinningWheelVisuals`.
  private readonly wheelVisuals: { pivot: THREE.Group; body: RAPIER.RigidBody }[] = []
  private readonly _chassisQuatInv = new THREE.Quaternion()
  private readonly _wheelBodyQuat  = new THREE.Quaternion()

  constructor(config: DynamicRobotConfig, world: RAPIER.World, scene: THREE.Scene) {
    this.world = world
    this.scene = scene

    const { description, loadedModel, position } = config

    // Determine chassis Y so lowest wheel rests on floor (y = 0).
    // wheelBottom_world = chassisY + centreLocal.y - radius. Set chassisY so
    // the minimum wheelBottom_world over all wheels equals 0.
    const allWheels: WheelSpec[] = [
      ...description.motors.map((m) => m.wheel),
      ...description.casters,
    ]
    let chassisY = 0.6 // default if no wheels at all
    if (allWheels.length > 0) {
      let minBottomLocal = Infinity
      for (const w of allWheels) {
        const bottomLocal = w.centreLocal.y - w.radius
        if (bottomLocal < minBottomLocal) minBottomLocal = bottomLocal
      }
      chassisY = -minBottomLocal
    }
    const finalPos = new THREE.Vector3(position.x, chassisY, position.z)
    this.initialPosition = finalPos.clone()

    // ── Chassis body + cuboid collider ─────────────────────────────────────
    // Collision groups: chassis is in bit 0, wheels in bit 1, floor implicit
    // in everything else. Chassis filters OUT wheel bit, wheels filter OUT
    // chassis bit — so the chassis cuboid (which is wider/taller than the
    // wheelbase for some imported models) doesn't push wheels around or get
    // pushed by them. They still collide with the floor normally.
    const CHASSIS_GROUPS = (0x0001 << 16) | 0xFFFD
    const WHEEL_GROUPS   = (0x0002 << 16) | 0xFFFE
    this.wheelCollisionGroups   = WHEEL_GROUPS
    this.chassisCollisionGroups = CHASSIS_GROUPS

    const half = description.hubHalfExtents
    // Lift the chassis cuboid so its bottom face sits CLEARANCE above the
    // floor regardless of how tall the AABB is. Without this, on imported
    // models with a deep hub AABB (half.y ≳ 0.4), the
    // cuboid bottom (= chassisY − half.y) ends up below y=0, the chassis
    // rests on the floor, the wheel bodies get dragged down by the joints
    // and partially sink into the ground — so the wheels can't roll even
    // when configureMotorVelocity is firing.
    const FLOOR_CLEARANCE = 0.05
    const wheelMaxRadius = allWheels.length > 0
      ? Math.max(...allWheels.map((w) => w.radius))
      : 0.28
    // Chassis bottom should clear the floor; cuboid centre = bottom + half.y.
    // Local offset (relative to the hub body translation, which sits at
    // wheel-top height = chassisY) is therefore:
    //   offset = (wheelMaxRadius + clearance + half.y) − chassisY
    // chassisY ≈ wheelMaxRadius (set above so the lowest wheel kisses the
    // floor), which simplifies to clearance + half.y.
    const chassisLocalY = FLOOR_CLEARANCE + half.y - (chassisY - wheelMaxRadius)
    // Angular damping depends on whether a virtual ball caster will be added:
    //   - 2-wheel-only models (no real casters): the virtual caster
    //     (_buildVirtualCaster) provides a stable ground contact that absorbs
    //     yaw wobble, so 8 is enough.
    //   - models with real casters (e.g. spike-taxi): the casters are
    //     SEPARATE dynamic bodies with no joint to the chassis — they don't
    //     stabilise yaw. Without help, ±0.07 rad/s of yaw oscillation persists
    //     at rest (translates to a visible side-to-side wobble at the wheels).
    //     12 kills it without making robot_turn feel sluggish at 180 deg/s.
    const willAddVirtualCaster = description.casters.length === 0 && description.motors.length >= 2
    // Why these numbers:
    //   - virtual-caster branch (8): the synthesised low-friction ball provides
    //     a stable yaw-damping ground contact, so 8 is plenty.
    //   - real-caster branch (6): MEASURED bottleneck during robot_turn. With
    //     opposite-spinning wheels, the joint motors' chassis reactions ADD
    //     into a net yaw torque, and `angularDamping × ω_yaw` is the only
    //     sink. At 12, equilibrium was at ω_yaw ≈ 0.52 rad/s vs the ~1.26
    //     rad/s implied by the commanded differential — 41% of ideal. Halving
    //     to 6 frees the turn without losing post-brake wobble control,
    //     because caster friction was also reduced (0.5 → 0.1) and the wheel
    //     friction at 0.5 already lets the bodies sleep.
    const angularDamping = willAddVirtualCaster ? 8.0 : 6.0
    this.hubBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(finalPos.x, finalPos.y, finalPos.z)
        .setLinearDamping(1.5)
        // Yaw is the only free rotation (pitch and roll locked below).
        .setAngularDamping(angularDamping)
        // Speed-bot and similar 2-wheel imported models have no driven
        // caster, so the chassis is free to pitch/roll around the wheel
        // axis on the first torque pulse — it tips over and the cuboid
        // pins itself to the floor. Locking pitch (X) and roll (Z) leaves
        // only yaw (Y) free, which is what differential-drive robots need.
        // Rapier 0.19 spelling: enabledRotations(x, y, z).
        .enabledRotations(false, true, false),
    )
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
        .setTranslation(0, chassisLocalY, 0)
        .setFriction(0.7)
        .setCollisionGroups(CHASSIS_GROUPS),
      this.hubBody,
    )

    // ── Visual root ─────────────────────────────────────────────────────────
    this.chassisGroup = new THREE.Group()
    this.chassisGroup.position.copy(finalPos)
    scene.add(this.chassisGroup)

    // Visual alignment with physics is non-trivial: THREE.LDrawLoader applies
    // its own Y-flip *and* an Rx(π) so the loaded model can land in a
    // different orientation than buildRobotDescription's parser. Rather than
    // trying to predict the loader's exact transform pipeline, we measure:
    //
    //   1. Try the model as-is. If its centroid sits below y=0 (model
    //      "hanging down"), rotate Rx(π) — that's the common Studio export
    //      mode where the model loads upside-down.
    //   2. Recentre the centroid to (0, 0, 0) so the chassis Group's origin
    //      matches the centre of the visible robot, regardless of where the
    //      .ldr's internal origin landed.
    //
    // chassisFlipped from the description is now only a fallback — the AABB
    // measurement supersedes it.
    loadedModel.updateMatrixWorld(true)
    const probeBox = new THREE.Box3().setFromObject(loadedModel)
    const probeCentre = new THREE.Vector3()
    probeBox.getCenter(probeCentre)
    // Empirically THREE.LDrawLoader hands us these models upside-down relative
    // to our parser's frame. Default to flipping; allow explicit opt-out via
    // VITE_IMPORTED_ROBOT_FLIP=false for `.ldr` files that don't need it.
    const flipEnv = import.meta.env.VITE_IMPORTED_ROBOT_FLIP
    const wantsFlip = flipEnv === undefined || String(flipEnv).toLowerCase() !== 'false'
    if (wantsFlip) {
      loadedModel.rotation.x = Math.PI
    }
    loadedModel.updateMatrixWorld(true)
    const finalBox = new THREE.Box3().setFromObject(loadedModel)
    const finalCentre = new THREE.Vector3()
    finalBox.getCenter(finalCentre)
    // Centre the model on X/Z by its centroid, but align Y so the model's
    // bbox bottom sits at the floor (world y = 0). In hub-local coords the
    // floor is at y = -chassisY, so we want bbox.min.y → -chassisY:
    //   model.position.y = -chassisY - finalBox.min.y
    // This removes the "suspended in air" look caused by centroid-only
    // alignment — the visible robot's wheels now meet the floor where the
    // physics wheels actually contact it.
    loadedModel.position.x -= finalCentre.x
    loadedModel.position.z -= finalCentre.z
    // Optional tuning bias — bbox alignment is approximate (e.g. decorative
    // wedge wheels at the rear can dip slightly below the bbox of the actual
    // driven wheels). Set VITE_IMPORTED_ROBOT_LIFT_Y in .env.local to nudge.
    const liftEnv = import.meta.env.VITE_IMPORTED_ROBOT_LIFT_Y
    const liftY = liftEnv !== undefined ? Number(liftEnv) : 0.01
    loadedModel.position.y = -chassisY - finalBox.min.y + liftY
    this.chassisGroup.add(loadedModel)

    // ── Driven wheels: physics + LegoMotor (visible procedural cylinder) ────
    this.drivenMotors = []
    this.drivenWheelBodies = []
    for (const m of description.motors) {
      const built = this._buildDrivenWheel(m, world, scene)
      this.drivenMotors.push(built.motor)
      this.drivenWheelBodies.push({ body: built.body, centreLocal: m.wheel.centreLocal.clone() })
    }

    // ── Casters: free dynamic body + visible cylinder synced each frame ─────
    this.casterBodies = []
    for (const c of description.casters) {
      this.casterBodies.push(this._buildCaster(c, world, scene))
    }

    // ── Make the imported model's OWN wheels spin ───────────────────────────
    // The procedural cylinders above are the physics-driven spinners but are
    // hidden by VITE_HIDE_PROCEDURAL_WHEELS; extract the matching LDraw wheel
    // sub-groups from `loadedModel` and rotate them in place to match physics.
    this._attachSpinningWheelVisuals(loadedModel, description, config.parts)

    // ── Virtual ball caster (2-wheel models only) ───────────────────────────
    // Real differential robots use a passive caster ball as their third
    // ground contact. Imported 2-wheel-only models ship without one, so we
    // synthesise one here: a low-friction sphere fixed to the
    // chassis at the end opposite the wheels. Pitch/roll are already locked
    // on the chassis, so attaching the sphere as a child collider of the hub
    // body (rather than a separate body + joint) is sufficient and stable.
    if (description.casters.length === 0 && description.motors.length >= 2) {
      this.virtualCaster = this._buildVirtualCaster(
        description.hubHalfExtents,
        description.motors[0].wheel.axisLocal,
        chassisY,
        world,
      )
    }

    // ── Sensor (optional) ──────────────────────────────────────────────────
    this.hasSensor = description.sensors.length > 0
    if (description.sensors.length > 0) {
      const s = description.sensors[0]
      this.sensorOriginLocal = s.originLocal.clone()
      this.sensorComponent = new LegoDistanceSensor(
        {
          position:  finalPos.clone().add(s.originLocal),
          direction: s.directionLocal.clone(),
          maxRange:  200,
          ldraw:     config.ldraw,
        },
        scene,
      )
      this.sensor = this.sensorComponent
    } else {
      this.sensorComponent = null
      this.sensorOriginLocal = null
      this.sensor = { getValue: () => Infinity }
    }

    // ── Drive convention ────────────────────────────────────────────────────
    const findMotor = (predicate: (s: MotorDriveSpec) => boolean):
      { motor: LegoMotor; spec: MotorDriveSpec } | null => {
      for (let i = 0; i < description.motors.length; i++) {
        if (predicate(description.motors[i])) {
          return { motor: this.drivenMotors[i], spec: description.motors[i] }
        }
      }
      return null
    }
    // "Left vs right" is along the wheel-axle direction. For axle=±X we
    // split on centreLocal.x; for axle=±Z we split on centreLocal.z.
    const axleAxis = description.motors[0]?.wheel.axisLocal
    const splitOnZ = axleAxis ? Math.abs(axleAxis.z) > Math.abs(axleAxis.x) : false
    const sideOf = (s: MotorDriveSpec) => splitOnZ ? s.wheel.centreLocal.z : s.wheel.centreLocal.x
    const leftFound = findMotor((s) => sideOf(s) < 0)
    const rightFound = findMotor((s) => sideOf(s) > 0)
    const noop: IMotor = { setSpeed: () => {}, stop: () => {} }
    const wrap = (m: LegoMotor | null, invert: boolean): IMotor => {
      if (!m) return noop
      return {
        setSpeed: (s) => m.setSpeed(invert ? -s : s),
        stop:     () => m.stop(),
      }
    }
    // Both wheel axles are snapped to the same world direction (e.g. +X), so
    // a positive joint motor velocity makes both wheels spin the SAME way
    // around that shared axis. For the typical Studio export with the chassis
    // facing −Z, that direction happens to push the robot backwards in world
    // coords; flip BOTH sides so `setSpeed(+n)` corresponds to "forward" as
    // kids expect.
    this.motors = {
      left:  wrap(leftFound?.motor ?? null, true),
      right: wrap(rightFound?.motor ?? null, true),
    }

    // Per-port motors for the single-motor `motor_*` blocks (A→left, B→right).
    // Uses the raw (un-inverted) LegoMotors so the block's own direction
    // dropdown decides the sign; `getAngle()` backs the `motor_position` reporter.
    // Falls back to a no-op port when a side wasn't found in the parsed model.
    const port = (m: LegoMotor | null): IMotorPort =>
      m
        ? { setSpeed: (s) => m.setSpeed(s), stop: () => m.stop(), getAngle: () => m.getAngle() }
        : { setSpeed: () => {}, stop: () => {}, getAngle: () => 0 }
    this.motorsByPort = {
      A: port(leftFound?.motor ?? null),
      B: port(rightFound?.motor ?? null),
    }

    const sideCoord = (s: MotorDriveSpec) =>
      splitOnZ ? s.wheel.centreLocal.z : s.wheel.centreLocal.x
    if (leftFound && rightFound) {
      this.wheelBaseWU = Math.abs(sideCoord(rightFound.spec) - sideCoord(leftFound.spec))
    } else if (description.motors.length >= 2) {
      this.wheelBaseWU = Math.abs(
        sideCoord(description.motors[0]) - sideCoord(description.motors[1]),
      )
    } else {
      this.wheelBaseWU = 1.0
    }

    // Driven-wheel radius (used by BlockInterpreter for robot_turn duration).
    // Falls back to the SimpleRobot procedural value if no motor is defined.
    this.wheelRadiusWU = description.motors[0]?.wheel.radius ?? 0.28

    // Empirical calibration for robot_turn. Kinematic formula assumes pure
    // pivot at commanded wheel speed; reality (joint saturation + chassis
    // angularDamping + caster drag + wheel-floor lateral skid) loses
    // significant rotation. Measured on spike-taxi for a 90° command:
    //   cal=1.00 → 54°  (uncalibrated kinematic prediction)
    //   cal=1.67 → 78°  (linear extrapolation under-shoots: extra damping
    //                    accumulates over the longer duration)
    //   cal=1.80 → 85°  (chosen sweet spot — measured)
    // 1.80 is a deliberate middle ground: close enough to commanded that
    // simple programs feel correct, but with ~5° residual slip preserved so
    // a future gyro-feedback turn block has visible pedagogical value. Same
    // trade-off the real LEGO Spike Essential makes with its default turn
    // block, which uses motor encoders and not the hub's IMU.
    this.turnCalibration = 1.80
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private _buildDrivenWheel(
    spec: MotorDriveSpec,
    world: RAPIER.World,
    scene: THREE.Scene,
  ): { motor: LegoMotor; body: RAPIER.RigidBody } {
    const wheelWorldPos = spec.wheel.centreLocal.clone().add(this.initialPosition)
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(wheelWorldPos.x, wheelWorldPos.y, wheelWorldPos.z)
        .setAngularDamping(1.0),
    )
    const colliderQuat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      spec.wheel.axisLocal,
    )
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(spec.wheel.halfWidth, spec.wheel.radius)
        .setRotation({ x: colliderQuat.x, y: colliderQuat.y, z: colliderQuat.z, w: colliderQuat.w })
        // 1.4 → 0.5: lateral friction at the contact creates torque around
        // the chassis-forward axis that the revolute joint cannot fully
        // counter (8 PGS iters leak ~0.5 rad/s perpendicular to the joint's
        // free axis, producing a "barrel roll" mode that translates the wheel
        // laterally and drags the chassis). Lowering friction reduces the
        // exciting torque. Drive traction may suffer — measure separately.
        .setFriction(0.5)
        .setRestitution(0.0)
        .setDensity(5.0)
        .setCollisionGroups(this.wheelCollisionGroups),
      body,
    )
    const dominantAxis = this._dominantAxis(spec.wheel.axisLocal)
    const motor = new LegoMotor(
      {
        position:         wheelWorldPos.clone(),
        attachedBody:     body,
        axis:             dominantAxis,
        anchorBody:       this.hubBody,
        anchorLocalPoint: { x: spec.wheel.centreLocal.x, y: spec.wheel.centreLocal.y, z: spec.wheel.centreLocal.z },
        // No ldraw — we want LegoMotor to use its procedural cylinder, which
        // is the visible spinning wheel for the user.
      },
      world,
      scene,
    )
    return { motor, body }
  }

  private _buildCaster(
    spec: WheelSpec,
    world: RAPIER.World,
    scene: THREE.Scene,
  ): DynamicRobot['casterBodies'][number] {
    const wheelWorldPos = spec.centreLocal.clone().add(this.initialPosition)
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(wheelWorldPos.x, wheelWorldPos.y, wheelWorldPos.z)
        .setAngularDamping(1.0),
    )
    const colliderQuat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      spec.axisLocal,
    )
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(spec.halfWidth, spec.radius)
        .setRotation({ x: colliderQuat.x, y: colliderQuat.y, z: colliderQuat.z, w: colliderQuat.w })
        // Real LEGO casters are passive idler wheels with very low rolling/
        // lateral resistance. 0.5 made them drag like skating brakes during
        // robot_turn — joint motor only delivered ~50% of commanded angvel.
        // 0.1 frees the chassis to yaw without affecting brake quality (which
        // comes from the joint motor on the driven wheels, not caster friction).
        .setFriction(0.1)
        .setRestitution(0.0)
        .setDensity(5.0)
        .setCollisionGroups(this.wheelCollisionGroups),
      body,
    )

    // Visible cylinder. Default cylinder axle is Y; rotate the mesh so its
    // axle aligns with axisLocal in the wheel body's local frame (which
    // starts identity, so axisLocal in body-local = axisLocal in world here).
    const geometry = new THREE.CylinderGeometry(spec.radius, spec.radius, spec.halfWidth * 2, 24)
    const material = new THREE.MeshStandardMaterial({ color: '#444444' })
    const mesh = new THREE.Mesh(geometry, material)
    const meshQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), spec.axisLocal)
    mesh.quaternion.copy(meshQuat)
    mesh.castShadow = true
    const visualGroup = new THREE.Group()
    visualGroup.position.copy(wheelWorldPos)
    visualGroup.add(mesh)
    if (import.meta.env.VITE_HIDE_PROCEDURAL_WHEELS === 'true') {
      visualGroup.visible = false
    }
    scene.add(visualGroup)

    return { body, visualGroup, geometry, material, centreLocal: spec.centreLocal.clone() }
  }

  private _buildVirtualCaster(
    half:      THREE.Vector3,
    axleAxis:  THREE.Vector3,
    chassisY:  number,
    world:     RAPIER.World,
  ): { geometry: THREE.SphereGeometry; material: THREE.MeshStandardMaterial } {
    // Wheel separation runs along axleAxis; forward/back is the perpendicular
    // horizontal axis. Average the driven-wheel positions so the caster sits
    // centred between them on the separation axis, and on the OPPOSITE side of
    // the hub origin along the forward axis (mirror + cap inside the AABB).
    const splitOnZ = Math.abs(axleAxis.z) > Math.abs(axleAxis.x)
    let sepMid = 0
    let fwdMid = 0
    for (const w of this.drivenWheelBodies) {
      if (splitOnZ) { sepMid += w.centreLocal.z; fwdMid += w.centreLocal.x }
      else          { sepMid += w.centreLocal.x; fwdMid += w.centreLocal.z }
    }
    sepMid /= this.drivenWheelBodies.length
    fwdMid /= this.drivenWheelBodies.length

    const halfFwd = splitOnZ ? half.x : half.z
    const fwdSign = fwdMid >= 0 ? -1 : 1
    // Twice the wheel-to-hub offset gives a long moment arm against yaw, but
    // stay inside the chassis AABB so the ball doesn't poke out past the
    // visible robot. The 0.05 margin matches the chassis FLOOR_CLEARANCE.
    const fwdMag = Math.min(Math.abs(fwdMid) * 2 + 0.1, Math.max(halfFwd - 0.05, 0.1))
    const ballFwd = fwdSign * fwdMag

    const radius = 0.06
    const x = splitOnZ ? sepMid : ballFwd
    const z = splitOnZ ? ballFwd : sepMid
    // Hub-local Y so the ball just kisses the floor (world y = 0).
    const y = radius - chassisY

    world.createCollider(
      RAPIER.ColliderDesc.ball(radius)
        .setTranslation(x, y, z)
        .setFriction(0.05)
        .setRestitution(0.0)
        .setDensity(0.5)
        .setCollisionGroups(this.chassisCollisionGroups),
      this.hubBody,
    )

    const geometry = new THREE.SphereGeometry(radius, 16, 12)
    const material = new THREE.MeshStandardMaterial({ color: '#888888' })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = true
    const visualGroup = new THREE.Group()
    visualGroup.position.set(x, y, z)
    visualGroup.add(mesh)
    this.chassisGroup.add(visualGroup)

    return { geometry, material }
  }

  private _dominantAxis(v: THREE.Vector3): 'x' | 'y' | 'z' {
    const ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z)
    if (ax >= ay && ax >= az) return 'x'
    if (ay >= az) return 'y'
    return 'z'
  }

  /**
   * Extract each wheel's mesh from the imported LDraw model and re-parent it to
   * a pivot Group that spins with the wheel's physics body.
   *
   * Why not just attach the mesh to the physics body's world transform?
   * `LDrawLoader`'s frame plus DynamicRobot's `Rx(π)` flip leave the imported
   * model **Z-mirrored** relative to `buildRobotDescription`'s frame: the
   * visible wheel and its physics body share X but have opposite Z. Snapping
   * the mesh onto the body would teleport it to the wrong (mirrored) Z and make
   * it orbit. Instead we KEEP the mesh where it visually sits (a child of the
   * chassis at its model position) and only copy the body's *rotation*: each
   * frame `pivot.worldQuat = wheelBodyQuat`. The spin axis (X here) is shared
   * across the mirror and a round wheel has no chirality, so the visual rolls
   * in the correct sense.
   *
   * Only DRIVEN wheels are extracted. Casters (free, jointless bodies) tumble
   * arbitrarily, and spike-taxi's wedge-belt front wheels don't roll on the
   * real model anyway — so their meshes are left in `loadedModel` as static
   * decoration that travels with the chassis but never spins.
   *
   * Matching is by part filename + side (axle-axis coordinate), NOT by nearest
   * 3D distance — the Z-mirror makes 3D-nearest pair driven wheels with casters.
   */
  private _attachSpinningWheelVisuals(
    loadedModel: THREE.Group,
    description: RobotDescription,
    parts: LDrawInstance[],
  ): void {
    this.chassisGroup.updateMatrixWorld(true)
    loadedModel.updateMatrixWorld(true)

    // Snapshot every model child with its world-space centre BEFORE any
    // re-parenting (attach() mutates loadedModel.children).
    const candidates = loadedModel.children.map((obj) => {
      const world = new THREE.Vector3()
      new THREE.Box3().setFromObject(obj).getCenter(world)
      return { obj, world, used: false }
    })

    const baseName = (p: string) => p.toLowerCase().replace(/^.*\//, '')

    // Claim the model child for a wheel: filter by part name, then nearest on
    // the axle axis (the side coordinate — preserved across the Z-mirror).
    const claim = (
      partFile: string,
      axle: 'x' | 'y' | 'z',
      sideValue: number,
    ): { obj: THREE.Object3D; world: THREE.Vector3 } | null => {
      const want = baseName(partFile)
      let best: (typeof candidates)[number] | null = null
      let bestD = Infinity
      for (const c of candidates) {
        if (c.used) continue
        if (baseName(c.obj.name) !== want) continue
        const d = Math.abs(c.world[axle] - sideValue)
        if (d < bestD) { bestD = d; best = c }
      }
      if (!best) return null
      best.used = true
      return { obj: best.obj, world: best.world }
    }

    // Build a spinning pivot at `primary`'s world centre, pulling in any other
    // unused child within `clusterRadius` (e.g. a separate tyre part 2815 that
    // rides on a rim 4185), and bind it to the physics body.
    const buildPivot = (
      primary: { obj: THREE.Object3D; world: THREE.Vector3 },
      clusterRadius: number,
      body: RAPIER.RigidBody,
    ): void => {
      const members = [primary.obj]
      for (const c of candidates) {
        if (c.used) continue
        if (c.world.distanceTo(primary.world) <= clusterRadius) {
          c.used = true
          members.push(c.obj)
        }
      }
      const pivot = new THREE.Group()
      pivot.position.copy(this.chassisGroup.worldToLocal(primary.world.clone()))
      this.chassisGroup.add(pivot)
      this.chassisGroup.updateMatrixWorld(true)
      for (const m of members) pivot.attach(m) // attach() preserves world transform
      this.wheelVisuals.push({ pivot, body })
    }

    // Driven wheels (one part each; integral tyre on spike-taxi's 65834p01).
    description.motors.forEach((m, i) => {
      const partFile = parts[m.wheel.partIndex]?.partFile
      if (!partFile) return
      const axle = this._dominantAxis(m.wheel.axisLocal)
      const body = this.drivenWheelBodies[i].body
      const claimed = claim(partFile, axle, body.translation()[axle])
      if (!claimed) {
        console.warn(`[DynamicRobot] no LDraw mesh matched driven wheel ${baseName(partFile)} — visual wheel will not spin`)
        return
      }
      // 65834p01 is a single integral-tyre part — claim only the exact rim
      // (tiny cluster radius so nearby pins/bushes aren't dragged in).
      buildPivot(claimed, 0.02, body)
    })

    // Casters (e.g. spike-taxi's wedge-belt front wheels 4185 + 2815) are
    // intentionally NOT extracted/spun: this wheel type does not roll on the
    // real model — it stays fixed. Leaving its meshes inside `loadedModel`
    // keeps them as decoration that moves with the chassis but never rotates.
    // (Their free physics bodies still provide ground contact for stability;
    // those bodies tumble freely, which is exactly why we must NOT bind the
    // visual to them — doing so made the front wheels spin and skew on turns.)
  }

  // ── ISimpleRobot lifecycle ──────────────────────────────────────────────────

  /** Current world-space position of the chassis centre (world units). */
  getPosition(): { x: number; y: number; z: number } {
    const t = this.hubBody.translation()
    return { x: t.x, y: t.y, z: t.z }
  }

  step(deltaTime: number): void {
    for (const m of this.drivenMotors) m.step(deltaTime)

    const t = this.hubBody.translation()
    const r = this.hubBody.rotation()
    this.chassisGroup.position.set(t.x, t.y, t.z)
    this.chassisGroup.quaternion.set(r.x, r.y, r.z, r.w)

    // Spin each extracted wheel mesh to match its physics body. The pivot is a
    // child of chassisGroup, so setting its LOCAL quat = chassisQuat⁻¹·bodyQuat
    // gives it WORLD quat = bodyQuat — the visual wheel rotates exactly as the
    // physics wheel, while staying at its (Z-mirrored) visual position.
    if (this.wheelVisuals.length > 0) {
      this._chassisQuatInv.copy(this.chassisGroup.quaternion).invert()
      for (const wv of this.wheelVisuals) {
        const br = wv.body.rotation()
        this._wheelBodyQuat.set(br.x, br.y, br.z, br.w)
        wv.pivot.quaternion.copy(this._chassisQuatInv).multiply(this._wheelBodyQuat)
      }
    }

    for (const c of this.casterBodies) {
      const ct = c.body.translation()
      const cr = c.body.rotation()
      c.visualGroup.position.set(ct.x, ct.y, ct.z)
      c.visualGroup.quaternion.set(cr.x, cr.y, cr.z, cr.w)
    }

    if (this.sensorComponent && this.sensorOriginLocal) {
      this._tmpVec.copy(this.sensorOriginLocal)
        .applyQuaternion(this.chassisGroup.quaternion)
        .add(this.chassisGroup.position)
      this.sensorComponent.setWorldPosition(this._tmpVec)
    }
  }

  reset(): void {
    const p = this.initialPosition
    const zero = { x: 0, y: 0, z: 0 }
    this.hubBody.setTranslation({ x: p.x, y: p.y, z: p.z }, true)
    this.hubBody.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
    this.hubBody.setLinvel(zero, true)
    this.hubBody.setAngvel(zero, true)

    for (const w of this.drivenWheelBodies) {
      const wp = w.centreLocal.clone().add(p)
      w.body.setTranslation({ x: wp.x, y: wp.y, z: wp.z }, true)
      w.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
      w.body.setLinvel(zero, true)
      w.body.setAngvel(zero, true)
    }
    for (const c of this.casterBodies) {
      const cp = c.centreLocal.clone().add(p)
      c.body.setTranslation({ x: cp.x, y: cp.y, z: cp.z }, true)
      c.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
      c.body.setLinvel(zero, true)
      c.body.setAngvel(zero, true)
    }

    for (const m of this.drivenMotors) m.stop()
  }

  dispose(): void {
    for (const m of this.drivenMotors) m.dispose()
    for (const w of this.drivenWheelBodies) {
      this.world.removeRigidBody(w.body)
    }
    for (const c of this.casterBodies) {
      this.world.removeRigidBody(c.body)
      this.scene.remove(c.visualGroup)
      c.geometry.dispose()
      c.material.dispose()
    }
    this.sensorComponent?.dispose()
    if (this.virtualCaster) {
      this.virtualCaster.geometry.dispose()
      this.virtualCaster.material.dispose()
    }
    this.world.removeRigidBody(this.hubBody)
    this.scene.remove(this.chassisGroup)
  }
}
