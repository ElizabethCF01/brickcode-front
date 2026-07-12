// Derives the five computational-thinking indicators from a program's structure
// and the student's run trajectory.
//
// Every indicator is a 0..1 score with a documented, teacher-explainable
// heuristic. These are proof-of-concept measures grounded in what the block
// vocabulary means pedagogically — NOT a trained model. The thresholds are
// deliberately simple and named so they can be tuned and justified in the thesis.

import type { CtIndicators, ProgramTree, TrajectoryStep } from './types'
import { countByType, maxDepth } from './programTree'

// ── Block-type vocabulary (mirrors src/interpreter/BlockInterpreter.ts) ──────
const LOOP_TYPES = ['control_forever', 'controls_repeat', 'controls_repeat_ext', 'controls_whileUntil']
const CONDITIONAL_TYPES = ['controls_if', 'control_wait_until']
const SENSOR_TYPES = ['sensor_distance', 'sensor_sees_color', 'motor_position']
const LOGIC_TYPES = ['logic_compare', 'logic_operation', 'logic_negate', 'math_arithmetic', 'operator_random']

/** A run whose edit distance from the previous run is in (0, MODERATE] counts as
 *  a purposeful tweak; larger jumps read as rewrites/thrashing. */
const MODERATE_EDIT = 5

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))

function sumOfTypes(counts: Record<string, number>, types: string[]): number {
  return types.reduce((total, t) => total + (counts[t] ?? 0), 0)
}

/**
 * Iterative debugging from the trajectory: reward several runs made of purposeful
 * (small, non-zero) edits, bonus when the student eventually succeeds. One run,
 * or re-running with no change, scores 0.
 */
export function debuggingScore(trajectory: TrajectoryStep[]): number {
  // Edits between successive runs (run 1's baseline distance of 0 is excluded).
  const edits = trajectory.slice(1).map((s) => s.editDistance)
  if (edits.length === 0) return 0
  const purposeful = edits.filter((d) => d > 0 && d <= MODERATE_EDIT).length
  const ratio = purposeful / edits.length
  const succeeded = trajectory.some((s) => s.success)
  return clamp01(ratio * (succeeded ? 1 : 0.6))
}

/** Compute all five CT indicators from the reference program + trajectory. */
export function computeIndicators(
  referenceProgram: ProgramTree,
  trajectory: TrajectoryStep[],
): CtIndicators {
  const counts = countByType(referenceProgram)

  const loopCount = sumOfTypes(counts, LOOP_TYPES)
  const conditionalCount = sumOfTypes(counts, CONDITIONAL_TYPES)
  const sensorCount = sumOfTypes(counts, SENSOR_TYPES)
  const logicCount = sumOfTypes(counts, LOGIC_TYPES)
  const depth = maxDepth(referenceProgram)

  return {
    // Presence + a little variety: one loop → 0.6, two+ → 1.0.
    loops: loopCount === 0 ? 0 : clamp01(0.6 + 0.4 * (loopCount - 1)),
    conditionals: conditionalCount === 0 ? 0 : clamp01(0.6 + 0.4 * (conditionalCount - 1)),
    // Reacting to the world: sensor reads combined with logic/comparison blocks.
    abstraction: clamp01((sensorCount + logicCount) / 3),
    // Nested structure vs. a flat list: depth 1 → 0, deeper → higher.
    decomposition: clamp01((depth - 1) / 3),
    debugging: debuggingScore(trajectory),
  }
}
