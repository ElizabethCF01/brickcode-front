import { describe, it, expect } from 'vitest'
import { treeEditDistance } from '../../src/analytics/treeEditDistance'
import { toProgramTree } from '../../src/analytics/programTree'
import type { ProgramTree, SerializedProgram } from '../../src/analytics/types'

// Tiny tree builder: node('f', node('a'), node('b')) === f with children a, b.
function node(label: string, ...children: ProgramTree[]): ProgramTree {
  return { label, children }
}

describe('treeEditDistance', () => {
  it('is zero for identical trees', () => {
    const t = node('PROGRAM', node('move'), node('turn'))
    expect(treeEditDistance(t, structuredClone(t))).toBe(0)
  })

  it('is symmetric', () => {
    const t1 = node('PROGRAM', node('move'))
    const t2 = node('PROGRAM', node('move'), node('turn'), node('wait'))
    expect(treeEditDistance(t1, t2)).toBe(treeEditDistance(t2, t1))
  })

  it('counts a single inserted leaf as distance 1', () => {
    const t1 = node('PROGRAM', node('a'), node('b'))
    const t2 = node('PROGRAM', node('a'), node('b'), node('c'))
    expect(treeEditDistance(t1, t2)).toBe(1)
  })

  it('counts a single relabel as distance 1', () => {
    const t1 = node('PROGRAM', node('a'))
    const t2 = node('PROGRAM', node('x'))
    expect(treeEditDistance(t1, t2)).toBe(1)
  })

  it('counts an inserted block inside a loop body as distance 1', () => {
    const t1 = node('PROGRAM', node('control_forever', node('move')))
    const t2 = node('PROGRAM', node('control_forever', node('move'), node('turn')))
    expect(treeEditDistance(t1, t2)).toBe(1)
  })

  // Canonical Zhang–Shasha example: T1 = f(d(a, c(b)), e),
  // T2 = f(c(d(a, b)), e). The published edit distance is 2.
  it('matches the canonical Zhang–Shasha example (distance 2)', () => {
    const t1 = node('f', node('d', node('a'), node('c', node('b'))), node('e'))
    const t2 = node('f', node('c', node('d', node('a'), node('b'))), node('e'))
    expect(treeEditDistance(t1, t2)).toBe(2)
  })

  it('works end-to-end from serialized Blockly snapshots', () => {
    const p1: SerializedProgram = {
      blocks: { blocks: [{ type: 'event_when_started', next: { block: { type: 'move_forward' } } }] },
    }
    // Same program with one extra statement appended after move_forward.
    const p2: SerializedProgram = {
      blocks: {
        blocks: [
          {
            type: 'event_when_started',
            next: { block: { type: 'move_forward', next: { block: { type: 'robot_stop' } } } },
          },
        ],
      },
    }
    expect(treeEditDistance(toProgramTree(p1), toProgramTree(p2))).toBe(1)
  })
})
