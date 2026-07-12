// Verifies the app-level recording wiring in ControlPanel: clicking Run/Stop
// drives the SessionRecorder lifecycle and triggers a flush. This covers the
// seam that the backend integration test (which calls the recorder directly)
// does not — interpreter/engine/store singletons are mocked.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor, act } from '@testing-library/react'
import ControlPanel from '../../src/components/ControlPanel'
import { useSimulationStore } from '../../src/store/simulationStore'
import { useChallengeStore } from '../../src/store/challengeStore'
import { challenge01 } from '../../src/challenges/challenge-01'

// ── Mocks for the singletons ControlPanel reaches into ──────────────────────
const recorder = {
  startSession: vi.fn(),
  recordEvent: vi.fn(),
  endSession: vi.fn().mockResolvedValue(null),
  isRecording: vi.fn(() => true),
  dispose: vi.fn(),
}
const sync = { flush: vi.fn().mockResolvedValue(undefined) }

const engine = {
  interpreter: { run: vi.fn().mockResolvedValue(undefined), stop: vi.fn() },
  robot: { getPosition: () => ({ x: 0, y: 0, z: -3 }) },
  resetRobot: vi.fn(),
  resetChallenge: vi.fn(),
}

const signOut = vi.fn()
vi.mock('../../src/recording/recordingSingleton', () => ({ getRecorder: () => recorder }))
vi.mock('../../src/backend/BackendSync', () => ({ getBackendSync: () => sync }))
vi.mock('../../src/backend/supabaseClient', () => ({ getSupabase: () => ({ auth: { signOut } }) }))
vi.mock('../../src/engine/engineSingleton', () => ({ getEngine: () => engine }))
vi.mock('../../src/blocks/workspaceSingleton', () => ({ getWorkspace: () => ({ getTopBlocks: () => [] }) }))

describe('ControlPanel recording wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    recorder.isRecording.mockReturnValue(true)
    useSimulationStore.setState({ status: 'stopped', autoStopRequested: false })
    // ControlPanel now reads the active level from the store (level-select
    // refactor); without one, Run/Stop bail out early.
    useChallengeStore.setState({ activeLevel: challenge01 })
  })

  it('Run starts a session, records program_run_started, then seals + flushes', async () => {
    const { getByRole } = render(<ControlPanel />)
    fireEvent.click(getByRole('button', { name: 'Run' }))

    expect(recorder.startSession).toHaveBeenCalledWith(['challenge-01'])
    expect(recorder.recordEvent).toHaveBeenCalledWith('program_run_started', expect.anything())
    expect(engine.interpreter.run).toHaveBeenCalled()

    // After the (resolved) run promise settles, the session is sealed + flushed.
    await waitFor(() => expect(sync.flush).toHaveBeenCalled())
    expect(recorder.recordEvent).toHaveBeenCalledWith('program_run_ended', expect.anything())
    expect(recorder.recordEvent).toHaveBeenCalledWith('challenge_evaluated', expect.objectContaining({
      payload: expect.objectContaining({ success: expect.any(Boolean) }),
    }))
    expect(recorder.endSession).toHaveBeenCalled()
  })

  it('Sign out signs the student out', () => {
    const { getByRole } = render(<ControlPanel />)
    fireEvent.click(getByRole('button', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalled()
  })

  it('Stop seals + flushes the active session', async () => {
    useSimulationStore.setState({ status: 'running' })
    const { getByRole } = render(<ControlPanel />)
    fireEvent.click(getByRole('button', { name: 'Stop' }))

    expect(engine.interpreter.stop).toHaveBeenCalled()
    await waitFor(() => expect(sync.flush).toHaveBeenCalled())
    expect(recorder.endSession).toHaveBeenCalled()
  })

  it('scenarioDecidesEnd: program finishing does not seal; the scenario auto-stop does', async () => {
    useChallengeStore.setState({
      activeLevel: { ...challenge01, scenarioDecidesEnd: true },
    })
    const { getByRole } = render(<ControlPanel />)
    fireEvent.click(getByRole('button', { name: 'Run' }))

    // The mocked run() resolves immediately — but the run must stay live.
    await waitFor(() => expect(engine.interpreter.run).toHaveBeenCalled())
    expect(recorder.endSession).not.toHaveBeenCalled()
    expect(useSimulationStore.getState().status).toBe('running')

    // The scripted scene latches its verdict and requests the stop.
    act(() => useSimulationStore.getState().requestAutoStop())
    await waitFor(() => expect(recorder.endSession).toHaveBeenCalled())
    expect(useSimulationStore.getState().status).toBe('stopped')
    expect(sync.flush).toHaveBeenCalled()
  })

  it('Reset discards the in-progress recording without flushing', () => {
    const { getByRole } = render(<ControlPanel />)
    fireEvent.click(getByRole('button', { name: 'Reset' }))

    expect(recorder.dispose).toHaveBeenCalled()
    expect(recorder.endSession).not.toHaveBeenCalled()
    expect(sync.flush).not.toHaveBeenCalled()
  })
})
