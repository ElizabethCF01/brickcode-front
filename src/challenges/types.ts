import type * as THREE from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'
import type { SimpleRobot } from '../interpreter/BlockInterpreter'
import type { ChallengeResult } from '../store/challengeStore'

export type { ChallengeResult }

/**
 * Minimal engine surface a level's `setup()` needs to draw goal geometry.
 * Satisfied by `SimulationEngine`.
 */
export interface ChallengeEngine {
  world: RAPIER.World
  scene: THREE.Scene
}

/**
 * Capability/topic tags a level exercises. Drive the category filter in the
 * level-select screen and map to the SPIKE-style toolbox families.
 */
export type LevelCategory = 'motors' | 'sensors' | 'lights' | 'sound'

/** 1 = easy, 2 = medium, 3 = hard. Orientative only (levels are not locked). */
export type LevelDifficulty = 1 | 2 | 3

/**
 * Level metadata shown in the selection grid. Kept separate from the runtime
 * logic (`setup`/`evaluate`) so a level can appear in the catalog before its
 * scene logic exists (`comingSoon: true`).
 */
export interface LevelMeta {
  id: string
  title: string
  description: string
  difficulty: LevelDifficulty
  tags: LevelCategory[]
  hints: string[]
  /** Shown in the grid but not yet playable (no setup/evaluate). */
  comingSoon?: boolean
}

/** A fully playable level: metadata plus its scene setup and success check. */
export interface LevelDefinition extends LevelMeta {
  setup: (engine: ChallengeEngine) => () => void
  evaluate: (robot: SimpleRobot) => ChallengeResult
}

/** Either a playable level or a catalog-only placeholder. */
export type Level = LevelDefinition | LevelMeta
