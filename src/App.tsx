import { useEffect } from 'react'
import ControlPanel from './components/ControlPanel'
import SensorPanel from './components/SensorPanel'
import ChallengePanel from './components/ChallengePanel'
import BlocklyWorkspace from './components/BlocklyWorkspace'
import SimulatorCanvas from './engine/renderer/SimulatorCanvas'
import { useSimulationStore } from './store/simulationStore'
import { resizeWorkspace } from './blocks/workspaceSingleton'

export default function App() {
  const { showEditor, toggleEditor } = useSimulationStore()

  // The drawer slides in via a 200ms CSS transform transition. Resizing
  // Blockly before the transition completes leaves it with stale flyout/toolbox
  // metrics — the symptom is that the flyout doesn't reappear on the second
  // category click. Wait until after the transition to call svgResize.
  useEffect(() => {
    if (!showEditor) return
    const t = window.setTimeout(resizeWorkspace, 220)
    return () => window.clearTimeout(t)
  }, [showEditor])

  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden bg-gray-900">
      <ControlPanel />

      {/* Main area: 3D viewport fills the whole space */}
      <div className="flex-1 relative overflow-hidden">
        <SimulatorCanvas />

        {/* Orbit hint */}
        <div className="absolute top-3 left-3 bg-black/50 text-white text-xs px-2 py-1 rounded pointer-events-none">
          Arrastra para orbitar · Rueda para zoom
        </div>

        {/* Challenge strip pinned to the bottom of the canvas */}
        <div className="absolute bottom-0 left-0 right-0">
          <ChallengePanel />
        </div>

        {/* Dim backdrop — only when editor is open */}
        {showEditor && (
          <div
            className="absolute inset-0 bg-black/40"
            onClick={toggleEditor}
          />
        )}

        {/* Blockly editor drawer — always in the DOM so blocks are never lost.
            Visibility toggled via CSS so Blockly's workspace isn't disposed. */}
        <div
          className={`absolute top-0 right-0 bottom-0 w-1/2 min-w-[420px] flex flex-col
            bg-gray-900 border-l border-gray-700 shadow-2xl z-10
            transition-transform duration-200
            ${showEditor ? 'translate-x-0' : 'translate-x-full'}`}
        >
          {/* Drawer header */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 border-b border-gray-700 shrink-0">
            <span className="text-xs text-gray-400">Editor de bloques</span>
            <button
              onClick={toggleEditor}
              className="text-gray-400 hover:text-white text-lg leading-none px-1"
              title="Cerrar editor"
            >
              ✕
            </button>
          </div>
          <BlocklyWorkspace />
        </div>
      </div>

      <SensorPanel />
    </div>
  )
}
