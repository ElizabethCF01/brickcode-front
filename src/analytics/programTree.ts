// Turns a serialized Blockly program into a normalized ordered tree, plus small
// structural queries the CT indicators rely on.
//
// Tree shape (design decision — documented in docs/architecture.md):
//   • a synthetic root labelled "PROGRAM" holds every top-level stack, so the
//     forest of top blocks becomes a single rooted tree the TED algorithm needs;
//   • a statement sequence (block → next → next …) becomes a list of SIBLINGS,
//     not a nested chain, so inserting one block costs exactly one edit;
//   • a block's value/statement inputs (e.g. a loop body, a comparison operand)
//     become CHILDREN, so nesting depth reflects real structure.
//
// Node label = block TYPE only by default. Field values (e.g. `repeat 4` vs
// `repeat 5`) are intentionally excluded so the trajectory measures STRUCTURAL
// change, not fiddling with numbers — set `includeFields` to fold selected field
// values in when a finer-grained signal is wanted.

import type { SerializedBlock, SerializedProgram, ProgramTree } from './types'

export interface TreeOptions {
  /** Fold field values into node labels (finer, noisier). Default false. */
  includeFields?: boolean
}

const ROOT_LABEL = 'PROGRAM'

function labelOf(block: SerializedBlock, opts: TreeOptions): string {
  if (!opts.includeFields || !block.fields) return block.type
  const fields = Object.keys(block.fields)
    .sort()
    .map((k) => `${k}=${String(block.fields![k])}`)
    .join(',')
  return fields ? `${block.type}(${fields})` : block.type
}

/** Flatten a `next` chain (a statement sequence) into sibling nodes. */
function chainToNodes(head: SerializedBlock | undefined, opts: TreeOptions): ProgramTree[] {
  const out: ProgramTree[] = []
  let block: SerializedBlock | undefined = head
  while (block) {
    out.push(blockToNode(block, opts))
    block = block.next?.block
  }
  return out
}

function blockToNode(block: SerializedBlock, opts: TreeOptions): ProgramTree {
  const children: ProgramTree[] = []
  if (block.inputs) {
    // Stable key order keeps the tree deterministic across serializations.
    for (const key of Object.keys(block.inputs).sort()) {
      const input = block.inputs[key]
      const head = input.block ?? input.shadow
      if (head) children.push(...chainToNodes(head, opts))
    }
  }
  return { label: labelOf(block, opts), children }
}

/** Parse a workspace snapshot into a single rooted tree. */
export function toProgramTree(
  program: SerializedProgram | null | undefined,
  opts: TreeOptions = {},
): ProgramTree {
  const topBlocks = program?.blocks?.blocks ?? []
  const children: ProgramTree[] = []
  for (const top of topBlocks) children.push(...chainToNodes(top, opts))
  return { label: ROOT_LABEL, children }
}

/** Depth-first count of every block type in the tree (excludes the synthetic root). */
export function countByType(tree: ProgramTree): Record<string, number> {
  const counts: Record<string, number> = {}
  const visit = (node: ProgramTree, isRoot: boolean) => {
    if (!isRoot) counts[node.label] = (counts[node.label] ?? 0) + 1
    for (const child of node.children) visit(child, false)
  }
  visit(tree, true)
  return counts
}

/** Total number of real blocks (the synthetic root does not count). */
export function blockCount(tree: ProgramTree): number {
  return Object.values(countByType(tree)).reduce((a, b) => a + b, 0)
}

/** Maximum nesting depth of real blocks (a flat stack under PROGRAM = depth 1). */
export function maxDepth(tree: ProgramTree): number {
  const depthOf = (node: ProgramTree, d: number): number => {
    if (node.children.length === 0) return d
    return Math.max(...node.children.map((c) => depthOf(c, d + 1)))
  }
  // The root is at depth 0; its children (real blocks) start at depth 1.
  return tree.children.length === 0 ? 0 : depthOf(tree, 0)
}
