// Records one program run as a LearningSession, writing through to the outbox.
//
// Lifecycle (driven by ControlPanel): startSession() on Run → recordEvent() as
// the program executes → endSession() on Stop / natural finish, which SEALS the
// session. After sealing, BackendSync flushes it to the backend. A sealed
// session never gains events (see docs/architecture.md §session-seal invariant).
//
// Framework-agnostic: no React imports.

import { putSession } from './outbox'
import { type LearningSession, type LearningEvent, SCHEMA_VERSION } from '../backend/types'

/** Hard cap on buffered events so a runaway while/repeat can't grow unbounded. */
const MAX_EVENTS_PER_SESSION = 5000

/**
 * Persist a whole-session checkpoint every N events. Bounds data loss on a crash
 * mid-run without a costly read-modify-write per event (the session is sealed and
 * persisted in full on endSession regardless).
 */
const CHECKPOINT_EVERY = 100

function uuid(): string {
  // crypto.randomUUID is available in modern browsers and Node 19+.
  return crypto.randomUUID()
}

export class SessionRecorder {
  private current: LearningSession | null = null
  /** performance.now() at session start, for monotonic event timestamps. */
  private startPerf = 0
  private capped = false

  /** Begin a new session. Any unsealed prior session is discarded. */
  startSession(challengeIds: string[]): LearningSession {
    this.startPerf = performance.now()
    this.capped = false
    this.current = {
      id: uuid(),
      startedAt: new Date().toISOString(),
      endedAt: null,
      challengeIds: [...challengeIds],
      events: [],
      eventCount: 0,
      schemaVersion: SCHEMA_VERSION,
      synced: false,
    }
    // Write-through immediately so a crash mid-run still leaves a record.
    void putSession(this.current)
    return this.current
  }

  /**
   * Append an event to the active session (in memory). No-op if there's no active
   * session. Once the per-session cap is hit, a single `events_capped` marker is
   * recorded and further events are dropped (keeps memory/storage bounded).
   * Persistence happens at checkpoints + on seal, not per event.
   */
  recordEvent(
    type: string,
    opts: { challengeId?: string; payload?: Record<string, unknown> } = {},
  ): void {
    const session = this.current
    if (!session) return

    if (session.events.length >= MAX_EVENTS_PER_SESSION) {
      if (!this.capped) {
        this.capped = true
        session.events.push(this.makeEvent('events_capped', {}))
        session.eventCount = session.events.length
      }
      return
    }

    session.events.push(this.makeEvent(type, opts))
    session.eventCount = session.events.length
    if (session.events.length % CHECKPOINT_EVERY === 0) void putSession(session)
  }

  /**
   * Seal the active session (sets endedAt + eventCount, persists) and return it
   * for flushing. Returns null if no session is active. Idempotent guard: a
   * second call returns null so run-then-stop can't seal twice.
   */
  async endSession(): Promise<LearningSession | null> {
    const session = this.current
    if (!session) return null
    this.current = null
    session.endedAt = new Date().toISOString()
    session.eventCount = session.events.length
    await putSession(session)
    return session
  }

  /** Whether a session is currently being recorded. */
  isRecording(): boolean {
    return this.current !== null
  }

  /** Drop the in-memory session without sealing (per CLAUDE.md dispose rule). */
  dispose(): void {
    this.current = null
  }

  private makeEvent(
    type: string,
    opts: { challengeId?: string; payload?: Record<string, unknown> },
  ): LearningEvent {
    return {
      type,
      tMonotonic: performance.now() - this.startPerf,
      tWall: Date.now(),
      challengeId: opts.challengeId,
      payload: opts.payload,
      schemaVersion: SCHEMA_VERSION,
    }
  }
}
