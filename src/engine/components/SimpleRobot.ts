import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { LegoMotor } from './LegoMotor'
import { LegoDistanceSensor } from './LegoDistanceSensor'
import type { LDrawLibraryManager } from '../ldraw/LDrawLibraryManager'
import type { IMotor, SimpleRobot as ISimpleRobot } from '../../interpreter/BlockInterpreter'

// All values in world units (1 WU = 10 cm).
//
// Layout (robot faces −Z; +X is right):
//
//          ┌──────────────────┐
//          │    Hub EV3       │   half (0.565, 0.56, 0.225)
//          │ ┌──┐        ┌──┐ │
//   ◯──────┤  │          │  ├──────◯   wheels: r=0.28, half-h=0.07
//          │ └──┘        └──┘ │      motors M: half (0.12, 0.19, 0.19)
//          │       ▲          │
//          └───────│──────────┘      sensor on front face
//                  │  half (0.28, 0.14, 0.13)
//
// Coordinates are chosen so wheel bottoms touch the floor (y = 0).

const HUB_HALF      = { x: 0.565, y: 0.56,  z: 0.225 }
const MOTOR_HALF    = { x: 0.12,  y: 0.19,  z: 0.19  }   // M motor, X-thin axis
const SENSOR_HALF   = { x: 0.28,  y: 0.14,  z: 0.13  }
const WHEEL_RADIUS  = 0.28
const WHEEL_HALF_W  = 0.07

const WHEEL_Y       = WHEEL_RADIUS                                   // wheel centre Y
const HUB_Y         = 0.6                                            // hub centre Y (bottom at 0.04)
const MOTOR_X       = HUB_HALF.x + MOTOR_HALF.x                      // 0.685
const WHEEL_X       = HUB_HALF.x + 2 * MOTOR_HALF.x + WHEEL_HALF_W   // 0.875
const SENSOR_Z      = -(HUB_HALF.z + SENSOR_HALF.z)                  // -0.355
const SENSOR_Y      = 0.4

// Local-to-hub offsets used both for compound colliders and for parenting visuals.
const MOTOR_LOCAL_L = { x: -MOTOR_X, y: WHEEL_Y - HUB_Y, z: 0          }
const MOTOR_LOCAL_R = { x: +MOTOR_X, y: WHEEL_Y - HUB_Y, z: 0          }
const SENSOR_LOCAL  = { x:  0,       y: SENSOR_Y - HUB_Y, z: SENSOR_Z  }

// Wheel anchor in hub local frame (joint connection point).
const WHEEL_ANCHOR_L = { x: -WHEEL_X, y: WHEEL_Y - HUB_Y, z: 0 }
const WHEEL_ANCHOR_R = { x: +WHEEL_X, y: WHEEL_Y - HUB_Y, z: 0 }

const WHEEL_BASE_WU = 2 * WHEEL_X   // 1.75

export interface SimpleRobotConfig {
  /** Initial world-space position of the hub centre. */
  position: THREE.Vector3
  /** Optional LDraw manager — when present, hub/motors/wheels/sensor use LDraw clones. */
  ldraw?: LDrawLibraryManager
}

/**
 * Full LEGO robot: dynamic Hub EV3 with compound collider (hub + 2 motors + sensor),
 * 2 dynamic wheels driven by `LegoMotor` revolute joints, and a front
 * `LegoDistanceSensor` whose origin tracks the hub.
 *
 * Implements the `ISimpleRobot` shape consumed by `BlockInterpreter`.
 */
export class SimpleRobot implements ISimpleRobot {
  readonly hubBody:       RAPIER.RigidBody
  readonly sensor:        LegoDistanceSensor
  readonly wheelBaseWU:   number = WHEEL_BASE_WU
  readonly wheelRadiusWU: number = WHEEL_RADIUS

  /** IMotor wrappers consumed by BlockInterpreter (left side inverts direction). */
  readonly motors: { left: IMotor; right: IMotor }

  // Raw underlying motors — both spin around +X. Direction inversion lives in
  // `motors.left` so a positive setSpeed on both produces forward motion.
  private readonly leftRawMotor:   LegoMotor
  private readonly rightRawMotor:  LegoMotor

  private readonly world:           RAPIER.World
  private readonly scene:           THREE.Scene
  private readonly leftWheelBody:   RAPIER.RigidBody
  private readonly rightWheelBody:  RAPIER.RigidBody
  private readonly hubGroup:        THREE.Group
  private readonly initialPosition: THREE.Vector3
  // primitive fallback resources (only populated when ldraw is absent)
  private readonly hubGeo:    THREE.BoxGeometry | null
  private readonly motorGeo:  THREE.BoxGeometry | null
  private readonly hubMat:    THREE.MeshStandardMaterial | null
  private readonly motorMat:  THREE.MeshStandardMaterial | null

  // Reused per-frame to avoid allocations
  private readonly _sensorWorld = new THREE.Vector3()

  constructor(config: SimpleRobotConfig, world: RAPIER.World, scene: THREE.Scene) {
    this.world           = world
    this.scene           = scene
    this.initialPosition = config.position.clone()
    const p              = config.position

    // ── Hub dynamic body + compound collider (hub box + motor boxes + sensor box) ─
    const hubDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(p.x, p.y, p.z)
      // Slight linear damping keeps the robot from coasting forever after stop.
      .setLinearDamping(0.4)
      .setAngularDamping(2.0)
    this.hubBody = world.createRigidBody(hubDesc)

    world.createCollider(
      RAPIER.ColliderDesc.cuboid(HUB_HALF.x, HUB_HALF.y, HUB_HALF.z).setFriction(0.7),
      this.hubBody,
    )
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(MOTOR_HALF.x, MOTOR_HALF.y, MOTOR_HALF.z)
        .setTranslation(MOTOR_LOCAL_L.x, MOTOR_LOCAL_L.y, MOTOR_LOCAL_L.z),
      this.hubBody,
    )
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(MOTOR_HALF.x, MOTOR_HALF.y, MOTOR_HALF.z)
        .setTranslation(MOTOR_LOCAL_R.x, MOTOR_LOCAL_R.y, MOTOR_LOCAL_R.z),
      this.hubBody,
    )
    // NOTE: the sensor body is intentionally *not* a collider on the hub —
    // the ray would self-hit and read 0 cm. The sensor is visual-only, matching
    // the architectural decision in `LegoDistanceSensor` (no rigid body).

    // ── Wheel dynamic bodies (cylinder colliders, axis along X) ───────────────
    // Rapier's cylinder is Y-axis by default; rotate 90° around Z so the cylinder
    // axis aligns with world X (matches the revolute joint axis = 'x').
    const xAxisQuat = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      Math.PI / 2,
    )
    const wheelColliderRot = { x: xAxisQuat.x, y: xAxisQuat.y, z: xAxisQuat.z, w: xAxisQuat.w }

    const leftWheelPos  = { x: p.x + WHEEL_ANCHOR_L.x, y: p.y + WHEEL_ANCHOR_L.y, z: p.z }
    const rightWheelPos = { x: p.x + WHEEL_ANCHOR_R.x, y: p.y + WHEEL_ANCHOR_R.y, z: p.z }

    this.leftWheelBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(leftWheelPos.x, leftWheelPos.y, leftWheelPos.z)
        .setAngularDamping(1.0),
    )
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(WHEEL_HALF_W, WHEEL_RADIUS)
        .setRotation(wheelColliderRot)
        .setFriction(1.4)
        .setRestitution(0.0)
        .setDensity(5.0),
      this.leftWheelBody,
    )

    this.rightWheelBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(rightWheelPos.x, rightWheelPos.y, rightWheelPos.z)
        .setAngularDamping(1.0),
    )
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(WHEEL_HALF_W, WHEEL_RADIUS)
        .setRotation(wheelColliderRot)
        .setFriction(1.4)
        .setRestitution(0.0)
        .setDensity(5.0),
      this.rightWheelBody,
    )

    // ── LegoMotors: anchor on hub, drive each wheel ───────────────────────────
    this.leftRawMotor = new LegoMotor(
      {
        position:         new THREE.Vector3(leftWheelPos.x, leftWheelPos.y, leftWheelPos.z),
        attachedBody:     this.leftWheelBody,
        axis:             'x',
        ldraw:            config.ldraw,
        anchorBody:       this.hubBody,
        anchorLocalPoint: WHEEL_ANCHOR_L,
      },
      world,
      scene,
    )
    this.rightRawMotor = new LegoMotor(
      {
        position:         new THREE.Vector3(rightWheelPos.x, rightWheelPos.y, rightWheelPos.z),
        attachedBody:     this.rightWheelBody,
        axis:             'x',
        ldraw:            config.ldraw,
        anchorBody:       this.hubBody,
        anchorLocalPoint: WHEEL_ANCHOR_R,
      },
      world,
      scene,
    )

    // Drive convention (BlockInterpreter): left.setSpeed(+n) and right.setSpeed(+n)
    // both produce forward motion. Both motors share axis 'x', so positive
    // rotation spins them the same way relative to the body — wrap the left
    // motor to invert direction.
    const leftRaw  = this.leftRawMotor
    const rightRaw = this.rightRawMotor
    this.motors = {
      left:  { setSpeed: (s) => leftRaw.setSpeed(-s),  stop: () => leftRaw.stop()  },
      right: { setSpeed: (s) => rightRaw.setSpeed(s),  stop: () => rightRaw.stop() },
    }

    // ── Hub visual group (Three.js) ───────────────────────────────────────────
    this.hubGroup = new THREE.Group()
    this.hubGroup.position.copy(p)
    scene.add(this.hubGroup)

    if (config.ldraw) {
      const hubMesh = config.ldraw.getPart('HUB_EV3')
      // LDraw 95646 is authored upside-down relative to the LDrawLoader's
      // Y-flip convention — display would face the floor and the labels read
      // mirrored from any side. Rotate 180° around X to flip it right-side up.
      // (This also swaps front/back: motors A/B/C/D end up on the −Z face and
      // sensors 1/2/3/4 on +Z, which is the inverse of a real EV3 layout but
      // keeps both label sets readable.)
      hubMesh.rotation.x = Math.PI
      // After the X flip, the part's bottom is now at +HUB_HALF.y in its local
      // frame; offset it down by the same amount so the bottom sits at y=0.
      hubMesh.position.y = HUB_HALF.y
      hubMesh.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true } })
      this.hubGroup.add(hubMesh)

      const motorL = config.ldraw.getPart('MOTOR_M')
      motorL.position.set(MOTOR_LOCAL_L.x, MOTOR_LOCAL_L.y - MOTOR_HALF.y, MOTOR_LOCAL_L.z)
      motorL.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = true })
      this.hubGroup.add(motorL)

      const motorR = config.ldraw.getPart('MOTOR_M')
      motorR.position.set(MOTOR_LOCAL_R.x, MOTOR_LOCAL_R.y - MOTOR_HALF.y, MOTOR_LOCAL_R.z)
      motorR.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = true })
      this.hubGroup.add(motorR)

      this.hubGeo   = null
      this.motorGeo = null
      this.hubMat   = null
      this.motorMat = null
    } else {
      // Primitive fallback (tests / pre-LDraw)
      this.hubMat   = new THREE.MeshStandardMaterial({ color: '#1565C0' })
      this.motorMat = new THREE.MeshStandardMaterial({ color: '#37474F' })
      this.hubGeo   = new THREE.BoxGeometry(HUB_HALF.x * 2, HUB_HALF.y * 2, HUB_HALF.z * 2)
      this.motorGeo = new THREE.BoxGeometry(MOTOR_HALF.x * 2, MOTOR_HALF.y * 2, MOTOR_HALF.z * 2)

      const hubMesh = new THREE.Mesh(this.hubGeo, this.hubMat)
      hubMesh.castShadow = true; hubMesh.receiveShadow = true
      this.hubGroup.add(hubMesh)

      const motorL = new THREE.Mesh(this.motorGeo, this.motorMat)
      motorL.position.set(MOTOR_LOCAL_L.x, MOTOR_LOCAL_L.y, MOTOR_LOCAL_L.z)
      motorL.castShadow = true
      this.hubGroup.add(motorL)

      const motorR = new THREE.Mesh(this.motorGeo, this.motorMat)
      motorR.position.set(MOTOR_LOCAL_R.x, MOTOR_LOCAL_R.y, MOTOR_LOCAL_R.z)
      motorR.castShadow = true
      this.hubGroup.add(motorR)
    }

    // ── Distance sensor (no body — ray cast from world origin updated each tick) ─
    this.sensor = new LegoDistanceSensor(
      {
        position:  new THREE.Vector3(p.x, p.y + SENSOR_LOCAL.y, p.z + SENSOR_LOCAL.z),
        direction: new THREE.Vector3(0, 0, -1),
        maxRange:  200,
        ldraw:     config.ldraw,
      },
      scene,
    )
  }

  /**
   * Attach a user-imported LDraw model (e.g. a Studio 2.0 `.ldr` packed via
   * `npm run pack-ldraw`) as a decorative child of the hub. The procedural
   * hub/motor visuals are hidden so they don't bleed through; the wheel
   * cylinders stay because they belong to separate physics bodies and have to
   * keep spinning.
   *
   * Centring: the imported group's bounding box is computed and the group is
   * translated so its bottom-centre sits at the hub's local origin. After
   * that, callers may apply `extraOffset` / `extraRotation` to fine-tune.
   *
   * Visual-only — physics colliders are unchanged. See architecture.md
   * "Imported LDraw Models (level 1)" for the path to wiring physics from
   * the model itself.
   */
  attachImportedVisual(
    group: THREE.Group,
    options?: { extraOffset?: THREE.Vector3; extraRotationY?: number },
  ): void {
    // Hide procedural visuals: hub + motor boxes (children of hubGroup), the
    // two wheel cylinders (owned by LegoMotors, parented to scene root), and
    // the LDraw distance-sensor body (parented to scene root). Underlying
    // physics bodies and joints remain — only meshes are hidden.
    this.hubGroup.children.forEach((child) => { child.visible = false })
    this.leftRawMotor.setVisualVisible(false)
    this.rightRawMotor.setVisualVisible(false)
    this.sensor.setBodyVisible(false)

    // LDraw uses Y-down; LDrawLoader flips Y for individual parts but
    // Studio 2.0 full-model exports often come out inverted relative to
    // BrickCode's Y-up scene (same issue documented for the EV3 hub
    // 95646.dat). Apply the same 180° X-flip so studs point up.
    group.rotation.x = Math.PI

    // Compute bbox AFTER the rotation. Group is still unparented here, so
    // bbox is effectively in hub-local coords once we add it.
    const bbox = new THREE.Box3().setFromObject(group)
    const centre = new THREE.Vector3()
    bbox.getCenter(centre)

    // Align horizontally by centroid (X/Z) and vertically by bottom-to-floor.
    // The hub centre sits at world y = HUB_Y; the floor is at world y = 0.
    // In hub-local space, the floor is at y = -HUB_Y. Setting
    // group.position.y so that bbox.min.y maps to -HUB_Y puts the model's
    // bottom flush with the ground. This is the visual you want for a robot
    // that's "standing on its wheels" and removes the floating-above-ground
    // illusion caused by centroid alignment.
    group.position.x -= centre.x
    group.position.y = -HUB_Y - bbox.min.y
    group.position.z -= centre.z

    if (options?.extraOffset) group.position.add(options.extraOffset)
    if (options?.extraRotationY !== undefined) group.rotation.y += options.extraRotationY

    group.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.castShadow = true
        m.receiveShadow = true
      }
    })
    this.hubGroup.add(group)
  }

  /** Step motors and update sensor origin from the hub transform. Call after world.step(). */
  step(deltaTime: number): void {
    this.leftRawMotor.step(deltaTime)
    this.rightRawMotor.step(deltaTime)

    // Sync hub visual to the dynamic body
    const t = this.hubBody.translation()
    const r = this.hubBody.rotation()
    this.hubGroup.position.set(t.x, t.y, t.z)
    this.hubGroup.quaternion.set(r.x, r.y, r.z, r.w)

    // Move sensor origin to the (rotated) hub-local sensor offset.
    this._sensorWorld.set(SENSOR_LOCAL.x, SENSOR_LOCAL.y, SENSOR_LOCAL.z)
      .applyQuaternion(this.hubGroup.quaternion)
      .add(this.hubGroup.position)
    this.sensor.setWorldPosition(this._sensorWorld)
  }

  /** Reposition the robot at its initial pose, zero velocities, brake motors. */
  reset(): void {
    const p = this.initialPosition
    const zero = { x: 0, y: 0, z: 0 }

    this.hubBody.setTranslation({ x: p.x, y: p.y, z: p.z }, true)
    this.hubBody.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
    this.hubBody.setLinvel(zero, true)
    this.hubBody.setAngvel(zero, true)

    this.leftWheelBody.setTranslation(
      { x: p.x + WHEEL_ANCHOR_L.x, y: p.y + WHEEL_ANCHOR_L.y, z: p.z },
      true,
    )
    this.leftWheelBody.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
    this.leftWheelBody.setLinvel(zero, true)
    this.leftWheelBody.setAngvel(zero, true)

    this.rightWheelBody.setTranslation(
      { x: p.x + WHEEL_ANCHOR_R.x, y: p.y + WHEEL_ANCHOR_R.y, z: p.z },
      true,
    )
    this.rightWheelBody.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
    this.rightWheelBody.setLinvel(zero, true)
    this.rightWheelBody.setAngvel(zero, true)

    this.motors.left.stop()
    this.motors.right.stop()
  }

  dispose(): void {
    this.sensor.dispose()
    this.leftRawMotor.dispose()
    this.rightRawMotor.dispose()
    this.world.removeRigidBody(this.leftWheelBody)
    this.world.removeRigidBody(this.rightWheelBody)
    this.world.removeRigidBody(this.hubBody)
    this.scene.remove(this.hubGroup)
    this.hubGeo?.dispose()
    this.motorGeo?.dispose()
    this.hubMat?.dispose()
    this.motorMat?.dispose()
  }
}

