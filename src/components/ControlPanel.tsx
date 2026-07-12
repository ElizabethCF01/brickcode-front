import { useEffect } from 'react'
import { ArrowLeft, Blocks, LogOut, Play, RotateCcw, Square } from 'lucide-react'
import * as Blockly from 'blockly'
import { useSimulationStore } from '../store/simulationStore'
import { useChallengeStore } from '../store/challengeStore'
import { getEngine } from '../engine/engineSingleton'
import { getWorkspace } from '../blocks/workspaceSingleton'
import { markLevelCompleted } from '../challenges/completion'
import { getRecorder } from '../recording/recordingSingleton'
import { getBackendSync } from '../backend/BackendSync'
import { getSupabase } from '../backend/supabaseClient'

interface ControlPanelProps {
  onBackToLevels?: () => void
}

/**
 * Serialize the program's block structure for the analytics trajectory. Wrapped
 * so a serialization hiccup only loses one snapshot — it must never abort the
 * child's run. Returns null when the workspace can't be serialized.
 */
function snapshotProgram(workspace: Blockly.Workspace): Record<string, unknown> | null {
  try {
    return Blockly.serialization.workspaces.save(workspace)
  } catch {
    return null
  }
}

/**
 * Seal the active recording session (program ended naturally or via Stop) and
 * flush it to the backend. Guarded by isRecording() so run-then-stop seals once.
 */
async function finishSession(challengeId: string, success: boolean): Promise<void> {
  const recorder = getRecorder()
  if (!recorder.isRecording()) return
  recorder.recordEvent('program_run_ended', { challengeId })
  recorder.recordEvent('challenge_evaluated', {
    challengeId,
    payload: { success },
  })
  await recorder.endSession()
  await getBackendSync()?.flush()
}

export default function ControlPanel({ onBackToLevels }: Readonly<ControlPanelProps>) {
  const { status, setStatus, showEditor, toggleEditor } = useSimulationStore()
  const autoStopRequested = useSimulationStore((s) => s.autoStopRequested)

  // End the current run — from manual Stop, a finite program finishing, or a
  // scripted scenario auto-stopping. Evaluates once (guarded on running status),
  // records the result, and seals the session. Reads fresh state so the guard
  // holds even when several of those paths fire in the same run.
  const finishRun = () => {
    const engine = getEngine()
    const level  = useChallengeStore.getState().activeLevel
    if (!engine || !level) return
    if (useSimulationStore.getState().status !== 'running') return
    engine.interpreter.stop()
    setStatus('stopped')
    const result = level.evaluate(engine.robot)
    useChallengeStore.getState().setResult(result)
    if (result.success) markLevelCompleted(level.id)
    void finishSession(level.id, result.success)
  }

  // A scripted scenario (e.g. the crocodile reaching the boat) asked to end the
  // run — the reactive `forever` program never resolves on its own.
  useEffect(() => {
    if (!autoStopRequested) return
    finishRun()
    useSimulationStore.getState().clearAutoStop()
    // finishRun reads fresh state; re-running only when the flag flips is correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStopRequested])

  const handleRun = () => {
    const engine    = getEngine()
    const workspace = getWorkspace()
    const level     = useChallengeStore.getState().activeLevel
    if (!engine || !workspace || !level || status === 'running') return

    // Clear any previous result, reset the scripted scene, and mark running.
    useChallengeStore.getState().setResult(null)
    useSimulationStore.getState().clearAutoStop()
    engine.resetChallenge()
    setStatus('running')

    // Begin recording this run (events stream in via the interpreter sink).
    // Snapshot the program's block structure (Blockly serialization JSON) so the
    // analytics pipeline can measure the programming trajectory — tree edit
    // distance between the snapshots of a student's successive runs. The snapshot
    // rides as opaque payload on program_run_started (events.payload is jsonb;
    // no schema/DB change needed).
    const recorder = getRecorder()
    recorder.startSession([level.id])
    recorder.recordEvent('program_run_started', {
      challengeId: level.id,
      payload: { program: snapshotProgram(workspace) },
    })

    // Resolves when a finite program ends; for a reactive `forever` program it
    // resolves only after finishRun() calls interpreter.stop() (the status guard
    // makes that a no-op the second time).
    //
    // Scenario-driven levels opt out of ending on natural program completion:
    // the scene keeps playing (crocodile keeps approaching, hub keeps its
    // lights) until the scenario latches a verdict and requests the auto-stop.
    // Otherwise "repetir hasta que ve verde → luces" would be evaluated the
    // instant the program ends, long before the outcome is decided.
    engine.interpreter.run(workspace).then(() => {
      if (!level.scenarioDecidesEnd) finishRun()
    })
  }

  const handleStop = () => {
    finishRun()
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
    useSimulationStore.getState().clearAutoStop()
    useChallengeStore.getState().setResult(null)
  }

  return (
    <header className="flex items-center gap-3 px-4 py-2 bg-surface border-b border-line shrink-0">
      <span className="flex items-center gap-2 text-ink font-extrabold text-xl tracking-wide">
        <img src="/logo.png" alt="" className="h-7 w-7" />
        <span>BrickCode</span>
      </span>

      {onBackToLevels && (
        <button
          onClick={onBackToLevels}
          className="flex items-center gap-1.5 min-h-11 px-4 rounded-lg text-sm font-semibold
            bg-surface-2 hover:bg-line text-ink transition-colors
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Levels
        </button>
      )}

      <button
        onClick={() => getSupabase()?.auth.signOut()}
        className="flex items-center gap-1.5 min-h-11 px-4 rounded-lg text-sm font-semibold
          bg-surface-2 hover:bg-line text-ink transition-colors
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <LogOut size={16} aria-hidden="true" />
        Sign out
      </button>

      <div className="flex gap-2 ml-auto">
        <button
          id="blocks-toggle"
          onClick={toggleEditor}
          aria-pressed={showEditor}
          aria-controls="block-editor-drawer"
          className={`flex items-center gap-1.5 min-h-11 px-4 rounded-lg text-sm font-semibold
            transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
              showEditor
                ? 'bg-action-600 hover:bg-action-500 text-white'
                : 'bg-surface-2 hover:bg-line text-ink'
            }`}
        >
          <Blocks size={16} aria-hidden="true" />
          Blocks
        </button>
        <div className="w-px bg-line mx-1" />
        <button
          onClick={handleRun}
          disabled={status === 'running'}
          className="flex items-center gap-1.5 min-h-11 px-5 rounded-xl text-sm font-bold
            bg-success-700 hover:bg-success-600 disabled:bg-line disabled:text-ink-muted
            text-white transition-colors
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
        >
          <Play size={16} fill="currentColor" aria-hidden="true" />
          Run
        </button>

        <button
          onClick={handleStop}
          disabled={status === 'stopped'}
          className="flex items-center gap-1.5 min-h-11 px-5 rounded-xl text-sm font-bold
            bg-danger-600 hover:bg-danger-700 disabled:bg-line disabled:text-ink-muted
            text-white transition-colors
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
        >
          <Square size={16} fill="currentColor" aria-hidden="true" />
          Stop
        </button>

        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 min-h-11 px-4 rounded-xl text-sm font-semibold
            bg-surface-2 hover:bg-line text-ink transition-colors
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <RotateCcw size={16} aria-hidden="true" />
          Reset
        </button>
      </div>
    </header>

  )
}
