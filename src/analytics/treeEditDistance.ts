// Zhang–Shasha tree edit distance over ordered, labelled trees.
//
// TED = the minimum number of node insertions, deletions, and relabels to turn
// one tree into another. Applied to successive program snapshots, it quantifies
// how much a student's program changed between runs — the raw signal of the
// programming-trajectory analysis (slides 08–09). Cost model: insert = delete =
// 1, relabel = 0 when labels are equal else 1.
//
// Reference: Zhang & Shasha (1989), "Simple fast algorithms for the editing
// distance between trees and related problems." Kid programs have only tens of
// nodes, so the classic O(n²·min(depth,leaves)²) cost is irrelevant here.

import type { ProgramTree } from './types'

/** Post-order flattening with the auxiliary arrays Zhang–Shasha needs. */
interface Postorder {
  labels: string[]
  /** Post-order index of the leftmost-leaf descendant of each node. */
  lld: number[]
  /** Key roots: the roots of the subtrees the outer DP iterates over. */
  keyroots: number[]
}

function postorder(root: ProgramTree): Postorder {
  const labels: string[] = []
  const lld: number[] = []

  // Returns the post-order index of the subtree's leftmost-leaf descendant.
  const visit = (node: ProgramTree): number => {
    let leftmost = -1
    node.children.forEach((child, i) => {
      const childLeftmost = visit(child)
      if (i === 0) leftmost = childLeftmost
    })
    labels.push(node.label)
    const idx = labels.length - 1
    lld.push(leftmost === -1 ? idx : leftmost)
    return lld[idx]
  }
  visit(root)

  // A key root is the highest node for each distinct leftmost-leaf value —
  // keeping the last post-order index seen per lld does exactly that.
  const lastPerLld = new Map<number, number>()
  for (let i = 0; i < labels.length; i++) lastPerLld.set(lld[i], i)
  const keyroots = [...lastPerLld.values()].sort((a, b) => a - b)

  return { labels, lld, keyroots }
}

/** Tree edit distance between two program trees. */
export function treeEditDistance(t1: ProgramTree, t2: ProgramTree): number {
  const a = postorder(t1)
  const b = postorder(t2)
  const n = a.labels.length
  const m = b.labels.length

  // Permanent tree-distance table, filled at each pair of key roots.
  const td: number[][] = Array.from({ length: n }, () => new Array<number>(m).fill(0))

  for (const ki of a.keyroots) {
    for (const kj of b.keyroots) {
      const li = a.lld[ki]
      const lj = b.lld[kj]
      const rows = ki - li + 2
      const cols = kj - lj + 2

      // Forest distance for the sub-forests rooted at ki / kj.
      const fd: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0))
      for (let i = 1; i < rows; i++) fd[i][0] = fd[i - 1][0] + 1 // delete from a
      for (let j = 1; j < cols; j++) fd[0][j] = fd[0][j - 1] + 1 // insert into a

      for (let i = 1; i < rows; i++) {
        for (let j = 1; j < cols; j++) {
          const ai = li + i - 1
          const bj = lj + j - 1
          const del = fd[i - 1][j] + 1
          const ins = fd[i][j - 1] + 1
          if (a.lld[ai] === li && b.lld[bj] === lj) {
            // Both are keyroot-aligned subtrees: relabel their roots.
            const rel = fd[i - 1][j - 1] + (a.labels[ai] === b.labels[bj] ? 0 : 1)
            fd[i][j] = Math.min(del, ins, rel)
            td[ai][bj] = fd[i][j]
          } else {
            // Combine the already-computed subtree distance with the forest prefix.
            const rel = fd[a.lld[ai] - li][b.lld[bj] - lj] + td[ai][bj]
            fd[i][j] = Math.min(del, ins, rel)
          }
        }
      }
    }
  }

  return td[n - 1][m - 1]
}
