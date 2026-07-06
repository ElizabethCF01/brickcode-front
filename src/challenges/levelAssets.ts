import type { PartKey } from '../engine/ldraw/LDrawLibraryManager'
import type { LevelDefinition } from './types'

export interface LevelAssets {
  /** Catalog parts (`BRICKCODE_PARTS` keys) the level's robot needs cached. */
  parts: PartKey[]
  /** Packed model / source URLs the level fetches at runtime. */
  models: string[]
}

// Parts the procedural SimpleRobot builds from (SimpleRobot + LegoMotor +
// LegoDistanceSensor `getPart` calls). The colour sensor has no visual and the
// remaining catalog parts (bricks, beams, baseplate, motor-L) are used by no
// current level — that's why the old "always 11 parts" preload was misleading.
const SIMPLE_ROBOT_PARTS: PartKey[] = [
  'HUB_EV3', 'MOTOR_M', 'WHEEL_LARGE', 'WHEEL_TIRE', 'SENSOR_DISTANCE',
]

/**
 * What a level actually loads, for a realistic loading screen: the robot's
 * catalog parts plus every packed model the level fetches (imported robot
 * geometry + its source `.ldr`, and the level's `decorModels`).
 *
 * The SimpleRobot parts are included even for `robot: 'imported'` levels:
 * `SimulationEngine` falls back to a SimpleRobot when the import fails, and
 * `getPart` throws on cache misses — the fallback must never crash.
 *
 * `importedModelUrl`/`importedSourceUrl` default to the env config; tests pass
 * them explicitly.
 */
export function levelAssets(
  level: LevelDefinition,
  // `null` = explicitly no imported model (tests); `undefined` = use the env.
  importedModelUrl: string | null | undefined =
    import.meta.env.VITE_IMPORTED_ROBOT_MODEL as string | undefined,
  importedSourceUrl: string | null | undefined =
    import.meta.env.VITE_IMPORTED_ROBOT_SOURCE as string | undefined,
): LevelAssets {
  const models: string[] = []

  const robot = level.robot ?? 'imported'
  if (robot === 'imported' && importedModelUrl) {
    models.push(importedModelUrl)
    // Same derivation as SimulationEngine: packed .mpd → source .ldr.
    models.push(
      importedSourceUrl
        ?? importedModelUrl.replace('/packed/', '/source/').replace(/\.mpd$/i, '.ldr'),
    )
  }
  models.push(...(level.decorModels ?? []))

  return { parts: [...SIMPLE_ROBOT_PARTS], models }
}
