import { useEffect, useRef } from 'react'
import * as Blockly from 'blockly'
import { registerContinuousToolbox } from '@blockly/continuous-toolbox'

// Register ContinuousToolbox / ContinuousFlyout / ContinuousMetrics /
// RecyclableBlockFlyoutInflater in Blockly's global registry. Must run before
// any Blockly.inject() call. Idempotent — registry overrides allowed.
registerContinuousToolbox()
import { ROBOT_TOOLBOX } from '../blocks/definitions/robotBlocks'
import { setWorkspace } from '../blocks/workspaceSingleton'

type ToolboxItem = Blockly.utils.toolbox.ToolboxItemInfo

const FULL_TOOLBOX: Blockly.utils.toolbox.ToolboxDefinition = {
  kind: 'categoryToolbox',
  contents: [
    // Spread the robot category from ROBOT_TOOLBOX.
    ...((ROBOT_TOOLBOX as { contents: ToolboxItem[] }).contents),
    {
      kind: 'category',
      name: 'Control 🔁',
      colour: '#FF8C00',
      contents: [
        // controls_repeat (no shadow inputs) instead of controls_repeat_ext
        // (whose default math_number shadow triggers a Blockly bug:
        // "Block not present in workspace's list of top-most blocks" when
        // the flyout disposes blocks during category switch).
        { kind: 'block', type: 'controls_repeat' },
        { kind: 'block', type: 'controls_whileUntil' },
        { kind: 'block', type: 'controls_if' },
      ],
    } as ToolboxItem,
    {
      kind: 'category',
      name: 'Matemáticas 🔢',
      colour: '#5C81A6',
      contents: [
        { kind: 'block', type: 'math_number' },
        { kind: 'block', type: 'math_arithmetic' },
        { kind: 'block', type: 'logic_compare' },
      ],
    } as ToolboxItem,
  ],
}

export default function BlocklyWorkspace() {
  const containerRef = useRef<HTMLDivElement>(null)
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Clear any Blockly DOM left over from a previous inject/dispose cycle
    // (React StrictMode mounts twice; dispose() doesn't guarantee a clean container).
    while (container.firstChild) container.removeChild(container.firstChild)

    const workspace = Blockly.inject(container, {
      toolbox: structuredClone(FULL_TOOLBOX),
      renderer: 'zelos',
      trashcan: true,
      sounds: false,
      // Continuous toolbox: keeps all category blocks rendered in one flyout
      // and scrolls between sections instead of disposing/recreating blocks per
      // category click. Sidesteps a Blockly v12 bug where shadow children get
      // removed twice from the workspace's top-block list, eventually corrupting
      // the flyout so it stops showing any blocks.
      plugins: {
        toolbox: 'ContinuousToolbox',
        flyoutsVerticalToolbox: 'ContinuousFlyout',
        metricsManager: 'ContinuousMetrics',
      },
      move: {
        scrollbars: { horizontal: true, vertical: true },
        drag: true,
        wheel: true,
      },
      zoom: {
        controls: true,
        wheel: true,
        startScale: 0.9,
        maxScale: 2,
        minScale: 0.5,
        scaleSpeed: 1.1,
        pinch: true,
      },
      grid: {
        spacing: 20,
        length: 3,
        colour: '#374151',
        snap: true,
      },
      theme: Blockly.Theme.defineTheme('brickcode-dark', {
        name: 'brickcode-dark',
        base: Blockly.Themes.Classic,
        componentStyles: {
          workspaceBackgroundColour: '#1f2937',
          toolboxBackgroundColour:   '#0f172a',
          toolboxForegroundColour:   '#f9fafb',
          flyoutBackgroundColour:    '#111827',
          flyoutForegroundColour:    '#f9fafb',
          flyoutOpacity:             1,
          scrollbarColour:           '#4b5563',
          scrollbarOpacity:          0.9,
          insertionMarkerColour:     '#fbbf24',
          insertionMarkerOpacity:    0.4,
        },
      }),
    })
    workspaceRef.current = workspace
    setWorkspace(workspace)

    const ro = new ResizeObserver(() => {
      Blockly.svgResize(workspace)
    })
    ro.observe(container)

    Blockly.svgResize(workspace)

    return () => {
      ro.disconnect()
      setWorkspace(null)
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
