// Turns a student's recorded sessions into the analytics bundle the dashboard
// renders: the programming trajectory (tree edit distance across successive
// runs), the five CT indicators, and a coarse strategy label.
//
// Consumes LearningSession read-only. Each run-session carries one program
// snapshot on its `program_run_started` event (see ControlPanel.handleRun) and
// its outcome on `challenge_evaluated`.

import type { LearningSession } from '../backend/types'
import type {
  SerializedProgram,
  ProgramTree,
  StudentReport,
  StudentStatus,
  TrajectoryStep,
} from './types'
import { toProgramTree } from './programTree'
import { treeEditDistance } from './treeEditDistance'
import { computeIndicators } from './indicators'

/** The program snapshot captured at the start of a run, if present. */
export function extractSnapshot(session: LearningSession): SerializedProgram | null {
  const started = session.events.find((e) => e.type === 'program_run_started')
  const program = started?.payload?.program
  return program ? (program as SerializedProgram) : null
}

/** Whether the run passed the challenge (from the challenge_evaluated event). */
export function runSucceeded(session: LearningSession): boolean {
  const evaluated = session.events.find((e) => e.type === 'challenge_evaluated')
  return evaluated?.payload?.success === true
}

// Strategy-label threshold (heuristic, documented for the thesis). Kid programs
// have only tens of blocks, so tree edit distances are small — an average change
// at or below this reads as "barely touching the program"; more reads as active
// (if unsuccessful) rewriting. Calibrated against the synthetic archetypes.
const STALLED_EDIT = 1.5

/**
 * Coarse strategy bucket shown on the dashboard:
 *   • decomposing — reached a working solution (broke the problem down);
 *   • guessing    — changing the program a lot across runs, still not succeeding;
 *   • stuck       — barely changing the program across runs, no success;
 *   • no-data     — nothing to analyze yet.
 */
function classifyStatus(
  runCount: number,
  successCount: number,
  trajectory: TrajectoryStep[],
): StudentStatus {
  if (runCount === 0) return 'no-data'
  if (successCount > 0) return 'decomposing'
  // A single failed attempt is too little signal to call guessing.
  if (runCount < 2) return 'stuck'

  const edits = trajectory.slice(1).map((s) => s.editDistance)
  const avgEdit = edits.reduce((a, b) => a + b, 0) / edits.length
  return avgEdit <= STALLED_EDIT ? 'stuck' : 'guessing'
}

/** Analyze one student's ordered sessions into the dashboard report. */
export function analyzeStudent(sessions: LearningSession[]): StudentReport {
  // Chronological order; only runs that actually captured a program count.
  const runs = sessions
    .slice()
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map((s) => ({ tree: snapshotTree(s), success: runSucceeded(s) }))
    .filter((r): r is { tree: ProgramTree; success: boolean } => r.tree !== null)

  if (runs.length === 0) {
    return {
      runCount: 0,
      successCount: 0,
      indicators: { abstraction: 0, decomposition: 0, loops: 0, conditionals: 0, debugging: 0 },
      trajectory: [],
      status: 'no-data',
    }
  }

  const trajectory: TrajectoryStep[] = runs.map((run, i) => ({
    run: i + 1,
    editDistance: i === 0 ? 0 : treeEditDistance(runs[i - 1].tree, run.tree),
    success: run.success,
  }))

  const successCount = runs.filter((r) => r.success).length
  // Reference program = the last successful solution, else the latest attempt.
  const lastSuccess = [...runs].reverse().find((r) => r.success)
  const reference = (lastSuccess ?? runs[runs.length - 1]).tree

  return {
    runCount: runs.length,
    successCount,
    indicators: computeIndicators(reference, trajectory),
    trajectory,
    status: classifyStatus(runs.length, successCount, trajectory),
  }
}

function snapshotTree(session: LearningSession): ProgramTree | null {
  const snapshot = extractSnapshot(session)
  return snapshot ? toProgramTree(snapshot) : null
}
