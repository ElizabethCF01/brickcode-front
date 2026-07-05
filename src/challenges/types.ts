import type * as THREE from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'
import type { SimpleRobot } from '../interpreter/BlockInterpreter'
import type { ChallengeResult } from '../store/challengeStore'

export type { ChallengeResult }

/**
 * The slice of the robot a level's `setup()` may touch — currently just
 * swapping the procedural visual for an imported LDraw model (e.g. the boat).
 * Optional because not every runtime robot supports it (only `SimpleRobot`).
 */
export type ChallengeRobot = SimpleRobot & {
  attachImportedVisual?(
    group: THREE.Group,
    options?: { extraOffset?: THREE.Vector3; extraRotationY?: number },
  ): void
  /** Hide the procedural robot visual so a decorative model can stand in for it. */
  setVisualHidden?(hidden: boolean): void
}

/**
 * Minimal engine surface a level's `setup()` needs to draw goal geometry and
 * animate a scripted scene. Satisfied by `SimulationEngine`.
 */
export interface ChallengeEngine {
  world: RAPIER.World
  scene: THREE.Scene
  robot: ChallengeRobot
}

/**
 * Capability/topic tags a level exercises. Drive the category filter in the
 * level-select screen and map to the SPIKE-style toolbox families.
 */
export type LevelCategory = 'motors' | 'sensors' | 'lights' | 'sound'

/** 1 = easy, 2 = medium, 3 = hard. Orientative only (levels are not locked). */
export type LevelDifficulty = 1 | 2 | 3

/**
 * Which robot the level runs with.
 * - `imported` (default): the env-var LDraw model (e.g. the motors-only taxi).
 * - `simple`: the procedural `SimpleRobot`, which always carries a front
 *   distance sensor — required by reactive/sensor levels.
 */
export type RobotKind = 'simple' | 'imported'

/**
 * Live handle a level's `setup()` returns so the engine can animate a scripted
 * scene (e.g. a crocodile approaching) and reset it between runs.
 */
export interface ChallengeHandle {
  /** Tear down scene objects / physics bodies. */
  dispose: () => void
  /** Advance the scene by `dt` seconds. Called each physics step while running. */
  update?: (dt: number) => void
  /**
   * Purely cosmetic animation (e.g. water waves). Called once per rendered
   * frame regardless of run state, so ambience keeps moving while the student
   * is still dragging blocks. Must not affect gameplay or physics.
   */
  ambient?: (dt: number) => void
  /** Restore the scene to its start state (called on run-start and Reset). */
  reset?: () => void
}

/** A level's `setup()` may return a bare dispose fn (static scenes) or a handle. */
export type ChallengeSetupResult = (() => void) | ChallengeHandle

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
  /** Robot to load for this level. Defaults to `imported` when omitted. */
  robot?: RobotKind
  /**
   * Which sensors this level's robot carries (applies to the `simple` robot;
   * imported robots derive theirs from the parsed model). Omitted = both.
   * Lets a level mirror the real kit — e.g. the boat carries only the SPIKE
   * Essential colour sensor, so `{ distance: false, color: true }`.
   */
  sensors?: { distance?: boolean; color?: boolean }
  /**
   * When true, a finite program ending does NOT end the run: the scripted
   * scene keeps playing (and reading the hub/sensors) until it decides the
   * outcome itself via `requestAutoStop()`. Without this, "repetir hasta que
   * ve verde → luces" would be evaluated the instant the program ends — before
   * the crocodile ever reaches the danger zone.
   */
  scenarioDecidesEnd?: boolean
  setup: (engine: ChallengeEngine) => ChallengeSetupResult
  evaluate: (robot: SimpleRobot) => ChallengeResult
}

/** Either a playable level or a catalog-only placeholder. */
export type Level = LevelDefinition | LevelMeta
