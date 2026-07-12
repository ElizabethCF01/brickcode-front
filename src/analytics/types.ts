// Shared types for the learning-analytics pipeline (the Data Science layer).
//
// This module is deliberately framework-agnostic and Blockly-free: it works on a
// minimal structural view of a serialized program so it can run headlessly in
// Node (Vitest) and over synthetic data, exactly like the physics engine tests.
// The only coupling to the rest of the app is `LearningSession` from the backend
// types, consumed read-only.

/** A single serialized Blockly block, as produced by
 *  `Blockly.serialization.workspaces.save()`. Only the fields the analytics need
 *  are modelled; everything else is ignored. */
export interface SerializedBlock {
  type: string
  fields?: Record<string, unknown>
  /** Value/statement inputs, each holding a real `block` and/or a `shadow`. */
  inputs?: Record<string, { block?: SerializedBlock; shadow?: SerializedBlock }>
  /** The next statement in a sequence (statement connection). */
  next?: { block?: SerializedBlock; shadow?: SerializedBlock }
}

/** The workspace snapshot object stored on each `program_run_started` event. */
export interface SerializedProgram {
  blocks?: { blocks?: SerializedBlock[] }
}

/** A normalized, ordered tree used by the tree-edit-distance algorithm. */
export interface ProgramTree {
  label: string
  children: ProgramTree[]
}

/**
 * The five computational-thinking indicators, each a 0..1 score. Every score has
 * a documented, conceptually-grounded heuristic (see `indicators.ts`) so it is
 * explainable to a teacher — the north-star requirement. These are proof-of-
 * concept measures, NOT the output of a trained model.
 */
export interface CtIndicators {
  /** Reacting to the world via sensors + logic rather than fixed sequences. */
  abstraction: number
  /** Breaking the solution into nested structure instead of a flat list. */
  decomposition: number
  /** Presence and variety of loop constructs. */
  loops: number
  /** Presence and variety of conditional constructs. */
  conditionals: number
  /** Iterative debugging: converging small edits across runs, ending in success. */
  debugging: number
}

/** Coarse engagement/strategy label shown on the dashboard (slide 09). */
export type StudentStatus = 'decomposing' | 'guessing' | 'stuck' | 'no-data'

/** One point on a student's programming trajectory. */
export interface TrajectoryStep {
  /** 1-based run index within the ordered session list. */
  run: number
  /** Tree edit distance from the previous run's program (0 for the first run). */
  editDistance: number
  /** Whether this run passed the challenge. */
  success: boolean
}

/** The full per-student analytics bundle consumed by the dashboard. */
export interface StudentReport {
  runCount: number
  successCount: number
  indicators: CtIndicators
  trajectory: TrajectoryStep[]
  status: StudentStatus
}
