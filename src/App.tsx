import { useEffect } from 'react'
import { X } from 'lucide-react'
import ControlPanel from './components/ControlPanel'
import SensorPanel from './components/SensorPanel'
import Attribution from './components/Attribution'
import ChallengePanel from './components/ChallengePanel'
import HubMatrixPanel from './components/HubMatrixPanel'
import BlocklyWorkspace from './components/BlocklyWorkspace'
import SimulatorCanvas from './engine/renderer/SimulatorCanvas'
import { useSimulationStore } from './store/simulationStore'
import { resizeWorkspace } from './blocks/workspaceSingleton'
import { getBackendSync } from './backend/BackendSync'

interface AppProps {
  /** Return to the level-select screen. */
  onBackToLevels?: () => void
}

export default function App({ onBackToLevels }: Readonly<AppProps>) {
  const { showEditor, toggleEditor } = useSimulationStore()

  // Retry flushing buffered sessions on reconnect / periodically. No-op when the
  // backend isn't configured (getBackendSync returns null).
  useEffect(() => {
    const sync = getBackendSync()
    sync?.startAutoFlush()
    return () => sync?.stopAutoFlush()
  }, [])

  // The drawer slides in via a 200ms CSS transform transition. Resizing
  // Blockly before the transition completes leaves it with stale flyout/toolbox
  // metrics — the symptom is that the flyout doesn't reappear on the second
  // category click. Wait until after the transition to call svgResize.
  useEffect(() => {
    if (!showEditor) return
    const t = window.setTimeout(resizeWorkspace, 220)
    return () => window.clearTimeout(t)
  }, [showEditor])

  // Keyboard path for dismissing the drawer; on close, hand focus back to the
  // Blocks toggle so keyboard users aren't stranded on a hidden element.
  useEffect(() => {
    if (!showEditor) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      toggleEditor()
      document.getElementById('blocks-toggle')?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showEditor, toggleEditor])

  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden bg-canvas">
      <ControlPanel onBackToLevels={onBackToLevels} />

      {/* Main area: 3D viewport fills the whole space */}
      <div className="flex-1 relative overflow-hidden">
        <SimulatorCanvas />

        {/* Top-left overlay stack: orbit hint + hub 3×3 light matrix */}
        <div className="absolute top-3 left-3 flex flex-col gap-2 items-start">
          <div className="bg-surface/90 text-ink-muted text-xs font-semibold px-2.5 py-1 rounded-lg shadow-sm pointer-events-none">
            Drag to orbit · Scroll to zoom
          </div>
          <HubMatrixPanel />
        </div>

        {/* Challenge strip pinned to the bottom of the canvas */}
        <div className="absolute bottom-0 left-0 right-0">
          <ChallengePanel />
        </div>

        {/* Dim backdrop — only when editor is open (Escape also closes) */}
        {showEditor && (
          <div
            className="absolute inset-0 bg-ink/20"
            onClick={toggleEditor}
            aria-hidden="true"
          />
        )}

        {/* Blockly editor drawer — always in the DOM so blocks are never lost.
            Visibility toggled via CSS so Blockly's workspace isn't disposed. */}
        <aside
          id="block-editor-drawer"
          aria-label="Block editor"
          className={`absolute top-0 right-0 bottom-0 w-1/2 min-w-[420px] flex flex-col
            bg-surface border-l border-line shadow-2xl z-10
            transition-transform duration-200
            ${showEditor ? 'translate-x-0' : 'translate-x-full'}`}
        >
          {/* Drawer header */}
          <div className="flex items-center justify-between pl-3 pr-1.5 py-1 bg-surface-2 border-b border-line shrink-0">
            <span className="text-xs font-semibold text-ink-muted">Block editor</span>
            <button
              onClick={toggleEditor}
              aria-label="Close block editor"
              className="h-9 w-9 grid place-items-center rounded-lg text-ink-muted hover:text-ink
                hover:bg-line transition-colors
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <BlocklyWorkspace />
        </aside>
      </div>

      <SensorPanel />
      <Attribution />
    </div>
  )
}
