// Shared types for the recording layer, outbox sync, and dashboard reads.
//
// These mirror the B1 backend schema and the submit_session RPC payload
// (see supabase/migrations/ and docs/architecture.md §Backend). Keep the field
// shapes in sync with the RPC: BackendSync serialises a LearningSession into the
// p_session / p_events JSON the RPC expects.

/** Bumped when the recorded session/event shape changes. Stored on every row. */
export const SCHEMA_VERSION = 1

/** A single recorded event within a session. */
export interface LearningEvent {
  type: string
  /** High-resolution monotonic clock (ms) since run start — performance.now(). */
  tMonotonic: number
  /** Wall-clock timestamp (ms since epoch) — Date.now(). */
  tWall: number
  challengeId?: string
  payload?: Record<string, unknown>
  schemaVersion: number
}

/**
 * One program run, recorded locally then flushed to the backend.
 *
 * `id` is client-generated (a UUID) and is the idempotency key: the RPC inserts
 * events only when the session id is new, so a session is SEALED at first flush
 * and must never gain events afterwards (see docs/architecture.md).
 */
export interface LearningSession {
  id: string
  startedAt: string            // ISO 8601
  endedAt: string | null       // ISO 8601, null until sealed
  challengeIds: string[]
  events: LearningEvent[]
  eventCount: number
  schemaVersion: number
  /** Local-only outbox bookkeeping; never sent to the backend. */
  synced: boolean
}

// ── Dashboard read shapes (teacher side) ────────────────────────────────────

export interface ClassSummary {
  id: string
  name: string
  classCode: string
  createdAt: string
}

export interface StudentSummary {
  id: string
  pseudonym: string
  createdAt: string
}

/** Session metadata only — no events (use loadSession for the full bundle). */
export interface SessionSummary {
  id: string
  startedAt: string
  endedAt: string | null
  challengeIds: string[]
  eventCount: number
}

/** Per-student aggregate computed server-side by get_class_event_stats. */
export interface StudentEventStats {
  studentId: string
  pseudonym: string
  runCount: number
  failureCount: number
  /** Map of block type → times executed across the student's sessions. */
  blockFrequency: Record<string, number>
}

export type EventStats = StudentEventStats[]
