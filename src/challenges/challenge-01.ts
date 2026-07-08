import * as THREE from 'three'
import { placeProps } from '../engine/ldraw/decorProps'
import { buildSkyDome } from '../engine/renderer/skyDome'
import type { SimpleRobot } from '../interpreter/BlockInterpreter'
import type { ChallengeEngine, ChallengeResult, LevelDefinition } from './types'

// Scale: 1 world unit = 10 cm — see docs/architecture.md §Scale Convention.
const WU_PER_CM = 0.1

// `ChallengeEngine` moved to ./types (shared across levels). Re-exported so the
// existing `SimulationEngine` import keeps working.
export type { ChallengeEngine, ChallengeResult }

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

const PINE_MODEL   = '/ldraw/models/packed/tree-pine.mpd'
const ROCK_MODEL   = '/ldraw/models/packed/rock-big.mpd'
const FLOWER_MODEL = '/ldraw/models/packed/flowers.mpd'

export const challenge01 = {
  id:          'challenge-01',
  title:       '🏁 Reach the goal!',
  description: 'Program the robot to drive forward and stop inside the green zone, about 30 cm ahead.',
  difficulty:  1,
  tags:        ['motors'],
  hints: [
    'Use the "Move forward" block and set how many seconds it drives',
    'Adjust the speed or the time: if you fall short, increase it; if you overshoot, reduce it',
    'Drive straight — if the robot turns, it will drift out of the zone to one side',
  ],
  // Drives the per-level loading screen (see levelAssets).
  decorModels: [PINE_MODEL, ROCK_MODEL, FLOWER_MODEL],

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

    // Daytime sky dome. Horizon matches the scene's fog/background (#9fd8f2) so
    // distant props fade seamlessly into it — no need to touch scene.fog.
    const sky = buildSkyDome({ sun: { direction: [-10, 18, 6], color: '#fff4d6', size: 7 } })
    scene.add(sky.group)

    // Decorative LEGO props around the field perimeter. Pure visuals (no
    // colliders) and well clear of the robot's straight run at x ≈ 0, z 0→−5.
    const props = [
      placeProps(scene, PINE_MODEL, [
        { x: -6, z: -6, rotationY: 0.3 },
        { x: 6, z: -7, rotationY: 2.4, scale: 0.8 },
        { x: -7, z: 3, rotationY: 4.1, scale: 1.15 },
        { x: 7, z: 5, rotationY: 1.2 },
        { x: 5.5, z: -3, rotationY: 5.3, scale: 0.7 },
      ], { fitLongest: 1.5 }),
      placeProps(scene, ROCK_MODEL, [
        { x: -4.5, z: -2, rotationY: 0.8 },
        { x: 4, z: 2.5, rotationY: 2.9, scale: 0.75 },
      ], { fitLongest: 1 }),
      placeProps(scene, FLOWER_MODEL, [
        { x: -3.5, z: 4 },
        { x: 3.8, z: -5.5, rotationY: 1.9 },
        { x: 6.5, z: -1, rotationY: 3.7 },
      ], { fitLongest: 1.3 }),
    ]

    return () => {
      geo.dispose()
      mat.dispose()
      scene.remove(mesh)
      scene.remove(sky.group)
      sky.dispose()
      props.forEach((p) => p.dispose())
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
      return { success: false, message: 'Could not read the robot\'s position.' }
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
        message: `You reached the goal! You stopped at ${forwardCm} cm.`,
      }
    }

    if (!isStraight) {
      return {
        success: false,
        message: 'The robot drifted out of the zone to one side. Try driving straighter.',
      }
    }

    if (forwardWU < GOAL_FORWARD_WU - GOAL_TOL_WU) {
      return {
        success: false,
        message: `You fell short: you drove ${forwardCm} cm. Increase the time or the speed.`,
      }
    }

    return {
      success: false,
      message: `You overshot: you drove ${forwardCm} cm. Reduce the time or the speed.`,
    }
  },
} satisfies LevelDefinition
