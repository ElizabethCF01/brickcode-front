import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type { SimpleRobot } from '../interpreter/BlockInterpreter'
import type { ChallengeResult } from '../store/challengeStore'

// Scale: 1 world unit = 10 cm — see docs/architecture.md §Scale Convention.
const WU_PER_CM = 0.1

/**
 * Minimal engine surface that setup() needs.
 * Satisfied by SimulationEngine once it exists.
 */
export interface ChallengeEngine {
  world: RAPIER.World
  scene: THREE.Scene
}

export type { ChallengeResult }

// Wall dimensions (all in world units, scale 1 WU = 10 cm). Sized to read as
// an obstacle next to the SimpleRobot (~1.75 WU wide × 1.16 WU tall).
const WALL_WIDTH_WU  = 1.6    // 16 cm
const WALL_HEIGHT_WU = 0.6    // 6 cm
const WALL_DEPTH_WU  = 0.2    // 2 cm

// Front face of wall sits at z = -0.5 WU (exactly 50 cm from the robot origin along −z).
// Body centre is half the depth further back.
const WALL_CENTER_Z = -(50 * WU_PER_CM + WALL_DEPTH_WU / 2)

const SUCCESS_MIN_CM = 15
const SUCCESS_MAX_CM = 25

export const challenge01 = {
  id:          'challenge-01',
  title:       '🚗 ¡Para antes de chocar!',
  description: 'Programa el robot para que avance y se detenga solo cuando detecte un obstáculo a menos de 20 cm.',
  hints: [
    'Usa el bloque "Distancia frontal" para saber qué tan lejos está el obstáculo',
    'El bloque "si... entonces" puede ayudarte a tomar decisiones',
    'Recuerda que el robot necesita seguir moviéndose en un bucle',
  ],

  /**
   * Places a static red wall 50 cm in front of the robot origin (along −z).
   * Returns a dispose callback; call it when tearing the challenge down.
   *
   * The wall is a fixed Rapier body, not a stack of dynamic LegoBricks. Dynamic
   * bricks tip over on contact, which makes sensor-based evaluation unreliable.
   * The visual appearance is a solid red block — a future sprint can texture it
   * with a LEGO stud pattern.
   *
   * The robot itself (chassis + motors + sensor) is created separately by the
   * caller; this function only adds the obstacle.
   */
  setup(engine: ChallengeEngine): () => void {
    const { world, scene } = engine

    // ── Three.js wall mesh ────────────────────────────────────────────────────
    const geo  = new THREE.BoxGeometry(WALL_WIDTH_WU, WALL_HEIGHT_WU, WALL_DEPTH_WU)
    const mat  = new THREE.MeshStandardMaterial({ color: '#E53935' })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.castShadow    = true
    mesh.receiveShadow = true
    // Place the bottom of the wall flush with the floor (y = 0).
    mesh.position.set(0, WALL_HEIGHT_WU / 2, WALL_CENTER_Z)
    scene.add(mesh)

    // ── Rapier fixed body + collider ──────────────────────────────────────────
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
      0,
      WALL_HEIGHT_WU / 2,
      WALL_CENTER_Z,
    )
    const body = world.createRigidBody(bodyDesc)
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(WALL_WIDTH_WU / 2, WALL_HEIGHT_WU / 2, WALL_DEPTH_WU / 2),
      body,
    )

    return () => {
      geo.dispose()
      mat.dispose()
      scene.remove(mesh)
      world.removeRigidBody(body)
    }
  },

  /**
   * Returns success when the front distance sensor reads 15–25 cm.
   *
   * Call this after the user's program has stopped (e.g. on the Stop button).
   *
   * Limitation: LegoMotor exposes no public getSpeed(), so "robot is actually
   * still" cannot be verified here. Evaluation is implicitly at-stop.
   */
  evaluate(robot: SimpleRobot): ChallengeResult {
    const dist = robot.sensor.getValue()

    if (dist >= SUCCESS_MIN_CM && dist <= SUCCESS_MAX_CM) {
      return {
        success: true,
        message: `¡Perfecto! El robot paró a ${Math.round(dist)} cm del obstáculo.`,
      }
    }

    if (dist < SUCCESS_MIN_CM) {
      return {
        success: false,
        message: `Demasiado cerca: ${Math.round(dist)} cm. Intenta detectar el obstáculo antes.`,
      }
    }

    return {
      success: false,
      message: `El robot paró demasiado lejos (${Math.round(dist)} cm). ¿El bucle se detuvo a tiempo?`,
    }
  },
} as const
