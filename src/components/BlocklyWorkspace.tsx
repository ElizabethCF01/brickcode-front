import { useEffect, useRef } from 'react'
import * as Blockly from 'blockly'
import { ROBOT_TOOLBOX } from '../blocks/definitions/robotBlocks'

const FULL_TOOLBOX: Blockly.utils.toolbox.ToolboxDefinition = {
  kind: 'categoryToolbox',
  contents: [
    // Spread robot category from ROBOT_TOOLBOX
    ...((ROBOT_TOOLBOX as { contents: object[] }).contents),
    {
      kind: 'category',
      name: 'Control 🔁',
      colour: '#FF8C00',
      contents: [
        { kind: 'block', type: 'controls_repeat_ext' },
        { kind: 'block', type: 'controls_whileUntil' },
        { kind: 'block', type: 'controls_if' },
      ],
    },
    {
      kind: 'category',
      name: 'Matemáticas 🔢',
      colour: '#5C81A6',
      contents: [
        { kind: 'block', type: 'math_number' },
        { kind: 'block', type: 'math_arithmetic' },
        { kind: 'block', type: 'math_compare' },
      ],
    },
  ],
}

export default function BlocklyWorkspace() {
  const containerRef = useRef<HTMLDivElement>(null)
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const workspace = Blockly.inject(container, {
      toolbox: FULL_TOOLBOX,
      scrollbars: true,
      trashcan: true,
      theme: Blockly.Theme.defineTheme('brickcode-dark', {
        name: 'brickcode-dark',
        base: Blockly.Themes.Classic,
        componentStyles: {
          workspaceBackgroundColour: '#1f2937',
          toolboxBackgroundColour: '#111827',
          toolboxForegroundColour: '#f9fafb',
          flyoutBackgroundColour: '#1f2937',
          flyoutForegroundColour: '#f9fafb',
          flyoutOpacity: 0.9,
          scrollbarColour: '#4b5563',
          scrollbarOpacity: 0.8,
        },
      }),
    })
    workspaceRef.current = workspace

    const ro = new ResizeObserver(() => {
      Blockly.svgResize(workspace)
    })
    ro.observe(container)

    // Initial size pass — the container may already have dimensions
    Blockly.svgResize(workspace)

    return () => {
      ro.disconnect()
      workspace.dispose()
      workspaceRef.current = null
    }
  }, [])

  return (
    <div className="flex flex-col h-full bg-gray-900">
      <div className="px-3 py-1.5 bg-gray-800 border-b border-gray-700 text-xs text-gray-400 shrink-0">
        Bloques
      </div>
      <div ref={containerRef} className="flex-1" />
    </div>
  )
}
