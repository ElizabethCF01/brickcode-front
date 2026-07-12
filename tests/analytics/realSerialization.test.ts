import { describe, it, expect } from 'vitest'
import * as Blockly from 'blockly'
import { toProgramTree, countByType, maxDepth } from '../../src/analytics/programTree'
import type { SerializedProgram } from '../../src/analytics/types'

// Closes the loop the hand-authored tests can't: this feeds the parser the OUTPUT
// of the real `Blockly.serialization.workspaces.save()` (not JSON we shaped to
// match our own assumptions), for the load-bearing structures — a statement
// sequence (→ siblings) and a nested body (→ children). Uses built-in Blockly
// blocks; the serialization shape is identical for the app's custom blocks, so
// this validates the structural assumptions `programTree` depends on.
describe('programTree over real Blockly serialization', () => {
  it('parses a nested + sequential program the way the pipeline expects', () => {
    const ws = new Blockly.Workspace()
    try {
      // A repeat loop with an `if` in its body, followed by a while/until block.
      const repeat = ws.newBlock('controls_repeat')
      const ifBlock = ws.newBlock('controls_if')
      const whileBlock = ws.newBlock('controls_whileUntil')

      // if is the body of repeat (statement input → child in our tree)
      repeat.getInput('DO')!.connection!.connect(ifBlock.previousConnection!)
      // while follows repeat at the top level (next chain → sibling in our tree)
      repeat.nextConnection!.connect(whileBlock.previousConnection!)

      const saved = Blockly.serialization.workspaces.save(ws) as SerializedProgram
      const tree = toProgramTree(saved)
      const counts = countByType(tree)

      expect(counts.controls_repeat).toBe(1)
      expect(counts.controls_if).toBe(1)
      expect(counts.controls_whileUntil).toBe(1)
      // repeat and while are top-level siblings under PROGRAM.
      expect(tree.children.map((c) => c.label)).toEqual(['controls_repeat', 'controls_whileUntil'])
      // The `if` nested in the loop body makes the tree non-flat.
      expect(maxDepth(tree)).toBeGreaterThanOrEqual(2)
    } finally {
      ws.dispose()
    }
  })
})
