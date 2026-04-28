import * as Blockly from 'blockly'
import type { WorkspaceSvg } from 'blockly'

let _workspace: WorkspaceSvg | null = null

export function setWorkspace(ws: WorkspaceSvg | null): void {
  _workspace = ws
}

export function getWorkspace(): WorkspaceSvg | null {
  return _workspace
}

/** Call after the Blockly container becomes visible so the SVG resizes correctly. */
export function resizeWorkspace(): void {
  if (_workspace) Blockly.svgResize(_workspace)
}
