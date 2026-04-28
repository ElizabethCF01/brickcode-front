import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type { LDrawLibraryManager } from '../ldraw/LDrawLibraryManager'

// Wheel geometry — roughly a 2-stud-radius LEGO wheel (scale: 1 unit = 10 cm)
const WHEEL_RADIUS  = 0.16   // 2 studs × 0.08 = 16 mm
const WHEEL_WIDTH   = 0.08   // 1 stud = 8 mm

// Motor model constants for configureMotorVelocity(targetVel, damping):
// DRIVE_DAMPING — stiff enough to track target speed against moderate loads.
// BRAKE_DAMPING — ~10× higher to kill residual velocity quickly on stop().
const DRIVE_DAMPING = 50
const BRAKE_DAMPING = 500

const DEG_TO_RAD = Math.PI / 180

export interface MotorConfig {
  /** World-space position of the motor axle (must match attachedBody's initial translation). */
  position: THREE.Vector3
  /**
   * The Rapier rigid body this motor will spin.
   * Must be a dynamic body created at the same position as `config.position` so the
   * revolute joint anchor offset is zero in both local frames.
   */
  attachedBody: RAPIER.RigidBody
  /** The axis around which the motor rotates, expressed in the local frame of attachedBody. */
  axis: 'x' | 'y' | 'z'
  /**
   * Optional LDraw library manager. When provided, the wheel visual is replaced
   * by the WHEEL_LARGE LDraw clone. The revolute joint and physics are unchanged.
   */
  ldraw?: LDrawLibraryManager
}

export class LegoMotor {
  private targetSpeed  = 0   // deg/s — set by setSpeed / stop
  private currentAngle = 0   // deg — integrated from targetSpeed (joint.angle() not in API)

  private readonly joint:        RAPIER.RevoluteImpulseJoint
  private readonly anchor:       RAPIER.RigidBody
  private readonly group:        THREE.Group
  private readonly wheelVisual:  THREE.Object3D
  private readonly geometry:     THREE.CylinderGeometry | null
  private readonly material:     THREE.MeshStandardMaterial | null
  private readonly attachedBody: RAPIER.RigidBody
  private readonly world:        RAPIER.World
  private readonly scene:        THREE.Scene

  constructor(config: MotorConfig, world: RAPIER.World, scene: THREE.Scene) {
    this.world        = world
    this.scene        = scene
    this.attachedBody = config.attachedBody

    // ── Three.js wheel visual ──────────────────────────────────────────────────
    if (config.ldraw) {
      this.wheelVisual = config.ldraw.getPart('WHEEL_LARGE')
      this.wheelVisual.traverse((obj) => {
        const m = obj as THREE.Mesh
        if (m.isMesh) m.castShadow = true
      })
      this.geometry = null
      this.material = null
    } else {
      this.material = new THREE.MeshStandardMaterial({ color: '#444444' })
      this.geometry = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 24)
      const mesh = new THREE.Mesh(this.geometry, this.material)
      mesh.castShadow = true
      this.wheelVisual = mesh
    }

    // Wheel default orientation has the axle along Y (cylinder default; LDraw
    // wheel 3483 also authored axle-along-Y after LDrawLoader's Y-flip).
    // Rotate so the wheel face is perpendicular to the spin axis.
    // The group receives the physics transform; this rotation is a local offset.
    if (config.axis === 'x') this.wheelVisual.rotation.z = Math.PI / 2
    else if (config.axis === 'z') this.wheelVisual.rotation.x = Math.PI / 2

    this.group = new THREE.Group()
    this.group.position.copy(config.position)
    this.group.add(this.wheelVisual)
    scene.add(this.group)

    // ── Rapier anchor (fixed body — the motor housing) ─────────────────────────
    const anchorDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
      config.position.x,
      config.position.y,
      config.position.z,
    )
    this.anchor = world.createRigidBody(anchorDesc)

    // ── RevoluteImpulseJoint ───────────────────────────────────────────────────
    // Both local anchors at origin (0,0,0) — valid when attachedBody was created
    // at the same world position as config.position.
    const AXES = {
      x: { x: 1, y: 0, z: 0 },
      y: { x: 0, y: 1, z: 0 },
      z: { x: 0, y: 0, z: 1 },
    }
    const jointDesc = RAPIER.JointData.revolute(
      { x: 0, y: 0, z: 0 },  // attachment point in anchor local space
      { x: 0, y: 0, z: 0 },  // attachment point in attachedBody local space
      AXES[config.axis],
    )
    this.joint = world.createImpulseJoint(
      jointDesc,
      this.anchor,
      config.attachedBody,
      /* wakeUp */ true,
    ) as RAPIER.RevoluteImpulseJoint
  }

  /** Spin the motor at `degreesPerSecond`. Negative values reverse direction. */
  setSpeed(degreesPerSecond: number): void {
    this.targetSpeed = degreesPerSecond
    this.joint.configureMotorVelocity(degreesPerSecond * DEG_TO_RAD, DRIVE_DAMPING)
  }

  /** Brake the motor to a stop. */
  stop(): void {
    this.targetSpeed = 0
    this.joint.configureMotorVelocity(0, BRAKE_DAMPING)
  }

  /**
   * Current rotation in degrees, integrated from commanded speed.
   * Note: this reflects commanded motion, not physics-observed motion.
   * If the wheel is physically blocked, the value may diverge from reality.
   */
  getAngle(): number {
    return this.currentAngle
  }

  /** Called by SimulationEngine each frame, after the Rapier step. */
  step(deltaTime: number): void {
    // Sync wheel visual from physics body (post-physics-step transform)
    const t = this.attachedBody.translation()
    const r = this.attachedBody.rotation()
    this.group.position.set(t.x, t.y, t.z)
    this.group.quaternion.set(r.x, r.y, r.z, r.w)

    // Integrate commanded angle — Rapier 0.19 does not expose joint.angle() in the TS API
    this.currentAngle += this.targetSpeed * deltaTime
  }

  dispose(): void {
    this.geometry?.dispose()
    this.material?.dispose()
    // LDraw clone: dispose its (cloned) geometries; materials are shared with the cache.
    this.wheelVisual.traverse((obj) => {
      const m = obj as THREE.Mesh
      if (m.isMesh && m.geometry !== this.geometry) m.geometry?.dispose()
    })
    this.scene.remove(this.group)
    this.world.removeImpulseJoint(this.joint, /* wakeUp */ true)
    this.world.removeRigidBody(this.anchor)
    // attachedBody is owned by the caller — not removed here
  }
}
