import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type { LDrawLibraryManager } from '../ldraw/LDrawLibraryManager'

// Wheel geometry — roughly a 2-stud-radius LEGO wheel (scale: 1 unit = 10 cm)
const WHEEL_RADIUS  = 0.16   // 2 studs × 0.08 = 16 mm
const WHEEL_WIDTH   = 0.08   // 1 stud = 8 mm

// Motor model constants for configureMotorVelocity(targetVel, damping):
// DRIVE_DAMPING — stiff enough to track target speed against moderate loads.
// Raised from 50 → 300: dynamic chassis bodies built from imported `.ldr`
// (e.g. speed-bot) carry significant mass — at damping 50 the joint motor
// reaches only a fraction of the commanded velocity before the chassis
// inertia dominates, so the robot appears not to drive.
const DRIVE_DAMPING = 300

// At rest we brake with configureMotorVelocity(0, damping) — a viscous
// damper that opposes any angular velocity around the joint axis. Earlier
// we used configureMotorPosition(currentAngle, k, d) to lock the wheel
// at its commanded angle, but that approach failed in two distinct ways:
//
//   1. "Lurch" at end of drive: the integrated `currentAngle` diverges
//      from the physical wheel angle whenever the wheel slips against
//      the floor (any non-trivial drive). At stop(), the PD spring snaps
//      the wheel to the divergent target with high stiffness, kicking
//      the chassis.
//   2. Spontaneous re-acceleration: with a divergent target, the PD can
//      pump energy back into the system over cycles, producing the
//      "robot accelerates without stopping" behaviour.
//
// Velocity-zero brake removes both problems: there is no absolute angle
// target that can diverge, so the brake torque vanishes when the wheel
// is actually still. The earlier objection (residual-velocity fighting
// → lateral drift through the joint) is resolved by the wheel friction
// being low enough (0.5) for Rapier to put the bodies to sleep at rest.
const BRAKE_DAMPING = 100

const DEG_TO_RAD = Math.PI / 180

export interface MotorConfig {
  /** World-space position of the motor axle (must match attachedBody's initial translation). */
  position: THREE.Vector3
  /**
   * The Rapier rigid body this motor will spin.
   * Must be a dynamic body created at the same position as `config.position` so the
   * revolute joint anchor offset is zero in the attachedBody local frame.
   */
  attachedBody: RAPIER.RigidBody
  /** The axis around which the motor rotates, expressed in the local frame of attachedBody. */
  axis: 'x' | 'y' | 'z'
  /**
   * Optional LDraw library manager. When provided, the wheel visual is replaced
   * by the WHEEL_LARGE LDraw clone. The revolute joint and physics are unchanged.
   */
  ldraw?: LDrawLibraryManager
  /**
   * Optional anchor body for the revolute joint. When provided (e.g. a robot
   * chassis), the joint is anchored to this body instead of a fresh world-fixed
   * anchor — letting the motor move with the robot. The motor does not own the
   * anchor body and will not remove it on dispose().
   *
   * When set, `anchorLocalPoint` must give the joint anchor's coordinates in
   * the anchorBody local frame (typically `position − anchorBody.translation`).
   */
  anchorBody?: RAPIER.RigidBody
  /** Joint anchor point in the anchorBody local frame. Defaults to (0,0,0). */
  anchorLocalPoint?: { x: number; y: number; z: number }
}

export class LegoMotor {
  private targetSpeed  = 0   // deg/s — set by setSpeed / stop
  private currentAngle = 0   // deg — integrated from targetSpeed (joint.angle() not in API)

  private readonly joint:        RAPIER.RevoluteImpulseJoint
  private readonly anchor:       RAPIER.RigidBody
  private readonly ownsAnchor:   boolean
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
      // Compose rim (3483) + tyre (3482). Both share the LDraw axle origin so a
      // single Group with both children renders the complete wheel. The tyre
      // mounts concentrically with the rim — no extra offset needed.
      const wheelGroup = new THREE.Group()
      wheelGroup.add(config.ldraw.getPart('WHEEL_LARGE'))
      wheelGroup.add(config.ldraw.getPart('WHEEL_TIRE'))
      wheelGroup.traverse((obj) => {
        const m = obj as THREE.Mesh
        if (m.isMesh) m.castShadow = true
      })
      this.wheelVisual = wheelGroup
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

    // Diagnostic toggle: hide procedural cylinders in DynamicRobot so the
    // imported LDraw model is the only visible thing. Physics stays active.
    if (!config.ldraw && import.meta.env.VITE_HIDE_PROCEDURAL_WHEELS === 'true') {
      this.wheelVisual.visible = false
    }

    // ── Anchor body ────────────────────────────────────────────────────────────
    // External anchor (e.g. robot chassis) lets the motor travel with a moving
    // body. Otherwise create a world-fixed anchor at config.position.
    if (config.anchorBody) {
      this.anchor = config.anchorBody
      this.ownsAnchor = false
    } else {
      const anchorDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
        config.position.x,
        config.position.y,
        config.position.z,
      )
      this.anchor = world.createRigidBody(anchorDesc)
      this.ownsAnchor = true
    }

    // ── RevoluteImpulseJoint ───────────────────────────────────────────────────
    // attachedBody was created at config.position → its local anchor is (0,0,0).
    // anchorBody (when external) needs the joint point expressed in *its* frame.
    const AXES = {
      x: { x: 1, y: 0, z: 0 },
      y: { x: 0, y: 1, z: 0 },
      z: { x: 0, y: 0, z: 1 },
    }
    const localA = config.anchorLocalPoint ?? { x: 0, y: 0, z: 0 }
    const jointDesc = RAPIER.JointData.revolute(
      localA,                // attachment point in anchor local space
      { x: 0, y: 0, z: 0 },  // attachment point in attachedBody local space
      AXES[config.axis],
    )
    this.joint = world.createImpulseJoint(
      jointDesc,
      this.anchor,
      config.attachedBody,
      /* wakeUp */ true,
    ) as RAPIER.RevoluteImpulseJoint

    // Start braked: target velocity 0 with viscous damping.
    this.joint.configureMotorVelocity(0, BRAKE_DAMPING)
  }

  /** Spin the motor at `degreesPerSecond`. Negative values reverse direction. */
  setSpeed(degreesPerSecond: number): void {
    this.targetSpeed = degreesPerSecond
    this.joint.configureMotorVelocity(degreesPerSecond * DEG_TO_RAD, DRIVE_DAMPING)
  }

  /** Brake the motor to a stop — viscous damping of any joint-axis angular velocity. */
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

  /** Hide/show the wheel visual without affecting the rigid body or joint. */
  setVisualVisible(visible: boolean): void {
    this.group.visible = visible
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
    if (this.ownsAnchor) this.world.removeRigidBody(this.anchor)
    // attachedBody (and external anchorBody) are owned by the caller — not removed here
  }
}
