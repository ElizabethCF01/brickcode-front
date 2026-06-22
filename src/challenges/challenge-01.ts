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

// ── Goal geometry ───────────────────────────────────────────────────────────
// The robot faces −Z and drives forward toward −Z (see docs/architecture.md
// §SimpleRobot / §DynamicRobot drive direction). The goal is a flat marked zone
// on the floor a fixed distance ahead; the kid must drive forward and stop
// inside it — a pure motors challenge (no sensor required).
const GOAL_FORWARD_CM = 30                       // target forward distance
const GOAL_TOL_CM     = 7                         // ± depth tolerance of the zone
const LATERAL_TOL_CM  = 12                        // max sideways drift to stay "straight"

const GOAL_FORWARD_WU = GOAL_FORWARD_CM * WU_PER_CM   // 3.0 WU
const GOAL_TOL_WU     = GOAL_TOL_CM * WU_PER_CM       // 0.7 WU
const LATERAL_TOL_WU  = LATERAL_TOL_CM * WU_PER_CM    // 1.2 WU

// Floor marker dimensions (world units). Depth spans the full success band so
// the green patch visually communicates exactly where to stop.
const ZONE_WIDTH_WU = LATERAL_TOL_WU * 2          // 2.4 WU
const ZONE_DEPTH_WU = GOAL_TOL_WU * 2             // 1.4 WU
const ZONE_CENTER_Z = -GOAL_FORWARD_WU            // ahead of the robot (−Z)

export const challenge01 = {
  id:          'challenge-01',
  title:       '🏁 ¡Llega a la meta!',
  description: 'Programa el robot para que avance y se detenga dentro de la zona verde, a unos 30 cm hacia adelante.',
  hints: [
    'Usa el bloque "Mover adelante" e indica cuántos segundos avanza',
    'Ajusta la velocidad o el tiempo: si te quedas corto, aumenta; si te pasas, reduce',
    'Conduce recto — si el robot gira, se saldrá de la zona por un lado',
  ],

  /**
   * Draws a flat green goal zone on the floor `GOAL_FORWARD_CM` ahead of the
   * robot (along −z). Returns a dispose callback; call it when tearing the
   * challenge down.
   *
   * The zone is purely visual (no Rapier collider) — the robot drives onto it.
   * The robot itself (chassis + motors) is created separately by the caller;
   * this function only adds the target marker.
   */
  setup(engine: ChallengeEngine): () => void {
    const { scene } = engine

    // Thin translucent green slab sitting just above the floor (y ≈ 0) to avoid
    // z-fighting with the baseplate / floor plane.
    const geo = new THREE.BoxGeometry(ZONE_WIDTH_WU, 0.02, ZONE_DEPTH_WU)
    const mat = new THREE.MeshStandardMaterial({
      color:       '#22C55E',
      transparent: true,
      opacity:     0.55,
      emissive:    '#16A34A',
      emissiveIntensity: 0.3,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.receiveShadow = true
    mesh.position.set(0, 0.011, ZONE_CENTER_Z)
    scene.add(mesh)

    return () => {
      geo.dispose()
      mat.dispose()
      scene.remove(mesh)
    }
  },

  /**
   * Returns success when the robot has stopped inside the goal zone: it drove
   * roughly `GOAL_FORWARD_CM` forward (within ±`GOAL_TOL_CM`) without drifting
   * sideways more than `LATERAL_TOL_CM`.
   *
   * Call this after the user's program has stopped (e.g. on the Stop button or
   * when the program finishes naturally).
   */
  evaluate(robot: SimpleRobot): ChallengeResult {
    const pos = robot.getPosition?.()
    if (!pos) {
      return { success: false, message: 'No se pudo leer la posición del robot.' }
    }

    // Forward distance is along −z; sideways drift is |x|.
    const forwardWU = -pos.z
    const lateralWU = Math.abs(pos.x)
    const forwardCm = Math.round(forwardWU / WU_PER_CM)

    const inDepthBand = Math.abs(forwardWU - GOAL_FORWARD_WU) <= GOAL_TOL_WU
    const isStraight  = lateralWU <= LATERAL_TOL_WU

    if (inDepthBand && isStraight) {
      return {
        success: true,
        message: `¡Llegaste a la meta! Te detuviste a ${forwardCm} cm.`,
      }
    }

    if (!isStraight) {
      return {
        success: false,
        message: 'El robot se salió de la zona por un lado. Intenta conducir más recto.',
      }
    }

    if (forwardWU < GOAL_FORWARD_WU - GOAL_TOL_WU) {
      return {
        success: false,
        message: `Te quedaste corto: avanzaste ${forwardCm} cm. Aumenta el tiempo o la velocidad.`,
      }
    }

    return {
      success: false,
      message: `Te pasaste: avanzaste ${forwardCm} cm. Reduce el tiempo o la velocidad.`,
    }
  },
} as const
