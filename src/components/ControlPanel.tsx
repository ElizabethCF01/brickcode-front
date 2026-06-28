import { useEffect, useState } from 'react'
import { useSimulationStore } from '../store/simulationStore'
import { useChallengeStore } from '../store/challengeStore'
import { getEngine } from '../engine/engineSingleton'
import { getWorkspace } from '../blocks/workspaceSingleton'
import { challenge01 } from '../challenges/challenge-01'
import { getRecorder } from '../recording/recordingSingleton'
import { getBackendSync } from '../backend/BackendSync'
import { getClassCode, hasJoinedClass } from '../backend/identity'
import JoinClassModal from '../simulator/JoinClassModal'

/**
 * Seal the active recording session (program ended naturally or via Stop) and
 * flush it to the backend. Guarded by isRecording() so run-then-stop seals once.
 */
async function finishSession(success: boolean): Promise<void> {
  const recorder = getRecorder()
  if (!recorder.isRecording()) return
  recorder.recordEvent('program_run_ended', { challengeId: challenge01.id })
  recorder.recordEvent('challenge_evaluated', {
    challengeId: challenge01.id,
    payload: { success },
  })
  await recorder.endSession()
  await getBackendSync()?.flush()
}

export default function ControlPanel() {
  const { status, setStatus, showEditor, toggleEditor } = useSimulationStore()
  const [showJoin, setShowJoin] = useState(false)
  const [classCode, setClassCodeState] = useState<string | null>(getClassCode())

  // Prompt to join a class once on first run if none is configured.
  useEffect(() => {
    if (!hasJoinedClass()) setShowJoin(true)
  }, [])

  const closeJoin = () => {
    setShowJoin(false)
    setClassCodeState(getClassCode())
  }

  const handleRun = () => {
    const engine    = getEngine()
    const workspace = getWorkspace()
    if (!engine || !workspace || status === 'running') return

    // Clear any previous result and mark running.
    useChallengeStore.getState().setResult(null)
    setStatus('running')

    // Begin recording this run (events stream in via the interpreter sink).
    const recorder = getRecorder()
    recorder.startSession([challenge01.id])
    recorder.recordEvent('program_run_started', { challengeId: challenge01.id })

    engine.interpreter.run(workspace).then(() => {
      // Program finished naturally (all blocks executed without Stop).
      setStatus('stopped')
      const result = challenge01.evaluate(engine.robot)
      useChallengeStore.getState().setResult(result)
      void finishSession(result.success)
    })
  }

  const handleStop = () => {
    const engine = getEngine()
    if (!engine) return
    engine.interpreter.stop()
    setStatus('stopped')
    const result = challenge01.evaluate(engine.robot)
    useChallengeStore.getState().setResult(result)
    void finishSession(result.success)
  }

  const handleReset = () => {
    const engine = getEngine()
    if (engine) {
      engine.interpreter.stop()
      engine.resetRobot()
    }
    // Discard any in-progress recording — a reset is an intentional abort, not a
    // completed run, so it should not be sealed or flushed.
    getRecorder().dispose()
    setStatus('stopped')
    useChallengeStore.getState().setResult(null)
  }

  return (
    <header className="flex items-center gap-4 px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0">
      <span className="flex items-center gap-2 text-yellow-400 font-bold text-xl tracking-wide">
        <img src="/logo.png" alt="" className="h-7 w-7" />
        <span>BrickCode</span>
      </span>

      <button
        onClick={() => setShowJoin(true)}
        className="text-xs px-2.5 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
        title="Unirse a una clase"
      >
        {classCode ? `🎓 Clase: ${classCode}` : '🎓 Unirse a una clase'}
      </button>

      {showJoin && <JoinClassModal onClose={closeJoin} />}

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
