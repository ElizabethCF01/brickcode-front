// Verifies the app-level recording wiring in ControlPanel: clicking Run/Stop
// drives the SessionRecorder lifecycle and triggers a flush. This covers the
// seam that the backend integration test (which calls the recorder directly)
// does not — interpreter/engine/store singletons are mocked.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import ControlPanel from '../../src/components/ControlPanel'
import { useSimulationStore } from '../../src/store/simulationStore'

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
}

vi.mock('../../src/recording/recordingSingleton', () => ({ getRecorder: () => recorder }))
vi.mock('../../src/backend/BackendSync', () => ({ getBackendSync: () => sync }))
vi.mock('../../src/engine/engineSingleton', () => ({ getEngine: () => engine }))
vi.mock('../../src/blocks/workspaceSingleton', () => ({ getWorkspace: () => ({ getTopBlocks: () => [] }) }))

describe('ControlPanel recording wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    recorder.isRecording.mockReturnValue(true)
    useSimulationStore.setState({ status: 'stopped' })
  })

  it('Run starts a session, records program_run_started, then seals + flushes', async () => {
    const { getByText } = render(<ControlPanel />)
    fireEvent.click(getByText('▶ Ejecutar'))

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

  it('Stop seals + flushes the active session', async () => {
    useSimulationStore.setState({ status: 'running' })
    const { getByText } = render(<ControlPanel />)
    fireEvent.click(getByText('⏹ Parar'))

    expect(engine.interpreter.stop).toHaveBeenCalled()
    await waitFor(() => expect(sync.flush).toHaveBeenCalled())
    expect(recorder.endSession).toHaveBeenCalled()
  })

  it('Reset discards the in-progress recording without flushing', () => {
    const { getByText } = render(<ControlPanel />)
    fireEvent.click(getByText('↺ Reset'))

    expect(recorder.dispose).toHaveBeenCalled()
    expect(recorder.endSession).not.toHaveBeenCalled()
    expect(sync.flush).not.toHaveBeenCalled()
  })
})
