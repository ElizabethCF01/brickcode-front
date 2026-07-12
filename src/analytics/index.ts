// Public API of the learning-analytics pipeline (the Data Science layer).
//
// Flow: LearningSession[] → analyzeStudent → StudentReport
//   { trajectory (tree edit distance across runs), CT indicators, status }.
// The dashboard consumes StudentReport; the simulator never imports this.

export type {
  CtIndicators,
  StudentReport,
  StudentStatus,
  TrajectoryStep,
  ProgramTree,
  SerializedProgram,
  SerializedBlock,
} from './types'

export { analyzeStudent, extractSnapshot, runSucceeded } from './report'
export { computeIndicators, debuggingScore } from './indicators'
export { treeEditDistance } from './treeEditDistance'
export { toProgramTree, countByType, blockCount, maxDepth } from './programTree'
export {
  generateSyntheticClass,
  generateStudentSessions,
  type Archetype,
  type SyntheticStudent,
} from './synthetic'
