// Shared SessionRecorder, mirroring engineSingleton / workspaceSingleton.
//
// The interpreter's event sink (wired in SimulationEngine) and the ControlPanel
// run handlers both talk to this one recorder instance.

import { SessionRecorder } from './SessionRecorder'

let _recorder: SessionRecorder | null = null

export function getRecorder(): SessionRecorder {
  if (!_recorder) _recorder = new SessionRecorder()
  return _recorder
}

/** Test helper: drop the singleton so each test starts clean. */
export function resetRecorder(): void {
  _recorder?.dispose()
  _recorder = null
}
