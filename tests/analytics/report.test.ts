import { describe, it, expect } from 'vitest'
import { analyzeStudent } from '../../src/analytics/report'
import { generateStudentSessions, generateSyntheticClass } from '../../src/analytics/synthetic'

describe('analyzeStudent', () => {
  it('returns no-data for a student with no runs', () => {
    const report = analyzeStudent([])
    expect(report.status).toBe('no-data')
    expect(report.runCount).toBe(0)
    expect(report.trajectory).toHaveLength(0)
  })

  it('labels a decomposer as decomposing and captures the successful solution', () => {
    const report = analyzeStudent(generateStudentSessions('decomposer'))
    expect(report.status).toBe('decomposing')
    expect(report.runCount).toBe(4)
    expect(report.successCount).toBe(1)
    // Final solution uses a loop, a sensor-driven conditional and reacts to the world.
    expect(report.indicators.loops).toBeGreaterThan(0)
    expect(report.indicators.conditionals).toBeGreaterThan(0)
    expect(report.indicators.abstraction).toBeGreaterThan(0)
    expect(report.indicators.debugging).toBeGreaterThan(0)
    // First run has no predecessor, so its edit distance is the baseline 0.
    expect(report.trajectory[0].editDistance).toBe(0)
  })

  it('labels a guesser as guessing: lots of change across runs, no success', () => {
    const report = analyzeStudent(generateStudentSessions('guesser'))
    expect(report.status).toBe('guessing')
    expect(report.successCount).toBe(0)
  })

  it('labels a stalled student as stuck, changing far less than a guesser', () => {
    const stuck = analyzeStudent(generateStudentSessions('stuck'))
    const guesser = analyzeStudent(generateStudentSessions('guesser'))
    expect(stuck.status).toBe('stuck')
    expect(stuck.successCount).toBe(0)
    // The distinguishing signal: a stuck student's average edit is much smaller.
    const avg = (r: typeof stuck) => {
      const e = r.trajectory.slice(1).map((s) => s.editDistance)
      return e.reduce((a, b) => a + b, 0) / e.length
    }
    expect(avg(stuck)).toBeLessThan(avg(guesser))
  })

  it('analyzes a whole synthetic class end-to-end', () => {
    const students = generateSyntheticClass(9)
    expect(students).toHaveLength(9)
    const reports = students.map((s) => analyzeStudent(s.sessions))
    // Every student produces a usable report with a concrete status.
    expect(reports.every((r) => r.runCount > 0 && r.status !== 'no-data')).toBe(true)
    // The three strategies are all represented across the class.
    const statuses = new Set(reports.map((r) => r.status))
    expect(statuses).toEqual(new Set(['decomposing', 'guessing', 'stuck']))
  })
})
