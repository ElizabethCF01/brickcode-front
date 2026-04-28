import { useSimulationStore } from '../store/simulationStore'
import { useChallengeStore } from '../store/challengeStore'
import { getEngine } from '../engine/engineSingleton'
import { getWorkspace } from '../blocks/workspaceSingleton'
import { challenge01 } from '../challenges/challenge-01'

export default function ControlPanel() {
  const { status, setStatus, showEditor, toggleEditor } = useSimulationStore()

  const handleRun = () => {
    const engine    = getEngine()
    const workspace = getWorkspace()
    if (!engine || !workspace || status === 'running') return

    // Clear any previous result and mark running.
    useChallengeStore.getState().setResult(null)
    setStatus('running')

    engine.interpreter.run(workspace).then(() => {
      // Program finished naturally (all blocks executed without Stop).
      setStatus('stopped')
      const result = challenge01.evaluate(engine.robot)
      useChallengeStore.getState().setResult(result)
    })
  }

  const handleStop = () => {
    const engine = getEngine()
    if (!engine) return
    engine.interpreter.stop()
    setStatus('stopped')
    const result = challenge01.evaluate(engine.robot)
    useChallengeStore.getState().setResult(result)
  }

  const handleReset = () => {
    const engine = getEngine()
    if (engine) {
      engine.interpreter.stop()
      engine.resetRobot()
    }
    setStatus('stopped')
    useChallengeStore.getState().setResult(null)
  }

  return (
    <header className="flex items-center gap-4 px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0">
      <span className="text-yellow-400 font-bold text-xl tracking-wide">
        🟡 BrickCode
      </span>

      <div className="flex gap-2 ml-auto">
        <button
          onClick={toggleEditor}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium
            transition-colors ${
              showEditor
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
            }`}
        >
          📝 Bloques
        </button>
        <div className="w-px bg-gray-600 mx-1" />
        <button
          onClick={handleRun}
          disabled={status === 'running'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium
            bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:text-gray-400
            text-white transition-colors"
        >
          ▶ Ejecutar
        </button>

        <button
          onClick={handleStop}
          disabled={status === 'stopped'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium
            bg-red-600 hover:bg-red-500 disabled:bg-gray-600 disabled:text-gray-400
            text-white transition-colors"
        >
          ⏹ Parar
        </button>

        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium
            bg-gray-600 hover:bg-gray-500 text-white transition-colors"
        >
          ↺ Reset
        </button>
      </div>
    </header>

  )
}
