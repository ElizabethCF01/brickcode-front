// Outbox sync: flushes buffered learning sessions to the backend via the
// submit_session RPC. Offline-resilient and idempotent.
//
// Privacy invariant: this is the SIMULATOR's write path — it ONLY ever calls the
// submit_session RPC. It never reads any table. Reading is exclusively the
// teacher's path (dashboardApi). See docs/architecture.md §Backend.
//
// Idempotency: every session carries a client-generated id. The RPC inserts
// events only when that id is new, so re-flushing an already-synced session is a
// clean no-op. A session is SEALED at first flush and never gains events.
//
// Framework-agnostic: no React imports.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAnonClient } from './supabaseClient'
import { getClassCode, getPseudonym } from './identity'
import { getUnsynced, markSynced } from '../recording/outbox'
import type { LearningSession } from './types'

/** Periodic retry cadence while auto-flush is running. */
const RETRY_INTERVAL_MS = 30_000

export class BackendSync {
  private readonly classCode: string
  private readonly pseudonym: string
  private readonly client: SupabaseClient | null
  private timer: ReturnType<typeof setInterval> | null = null
  private flushing = false
  private readonly onlineHandler = () => { void this.flush() }

  constructor(classCode: string, pseudonym: string, client?: SupabaseClient | null) {
    this.classCode = classCode
    this.pseudonym = pseudonym
    this.client = client ?? createAnonClient()
  }

  /**
   * Push every unsynced session to the backend. Sessions that fail (e.g. offline)
   * stay queued for the next flush. Safe to call repeatedly — concurrent calls
   * are coalesced, and already-synced sessions are skipped.
   */
  async flush(): Promise<void> {
    if (!this.client || this.flushing) return
    this.flushing = true
    try {
      // Only flush SEALED sessions (endedAt set). An unsealed partial — e.g. a
      // run that was Reset mid-program — stays buffered and never syncs.
      const pending = (await getUnsynced()).filter((s) => s.endedAt !== null)
      for (const session of pending) {
        try {
          await this.submit(session)
          await markSynced(session.id)
        } catch (err) {
          // Leave it queued; a later flush (online/periodic) will retry.
          // Distinguish a misconfiguration (bad class code → actionable) from a
          // transient network failure (expected offline → stays quiet at debug).
          const message = err instanceof Error ? err.message : String(err)
          if (message.includes('invalid class code')) {
            console.warn(
              `[BackendSync] class code "${this.classCode}" is not valid — session ${session.id} ` +
                `stays queued and will not sync. Create a class and update VITE_CLASS_CODE.`,
            )
          } else {
            console.debug(`[BackendSync] flush failed for session ${session.id}, will retry: ${message}`)
          }
        }
      }
    } finally {
      this.flushing = false
    }
  }

  /** Submit one session via the RPC. Throws on RPC error so flush keeps it queued. */
  private async submit(session: LearningSession): Promise<void> {
    if (!this.client) throw new Error('backend not configured')
    const { error } = await this.client.rpc('submit_session', {
      p_class_code: this.classCode,
      p_student_pseudonym: this.pseudonym,
      p_session: {
        id: session.id,
        started_at: session.startedAt,
        ended_at: session.endedAt,
        challenge_ids: session.challengeIds,
        event_count: session.eventCount,
        schema_version: session.schemaVersion,
      },
      p_events: session.events.map((e) => ({
        type: e.type,
        t_monotonic: e.tMonotonic,
        t_wall: e.tWall,
        challenge_id: e.challengeId ?? null,
        payload: e.payload ?? null,
        schema_version: e.schemaVersion,
      })),
    })
    if (error) throw error
  }

  /** Retry on reconnect and on a periodic timer. Idempotent to call twice. */
  startAutoFlush(): void {
    if (this.timer) return
    if (typeof window !== 'undefined') window.addEventListener('online', this.onlineHandler)
    this.timer = setInterval(() => { void this.flush() }, RETRY_INTERVAL_MS)
  }

  stopAutoFlush(): void {
    if (typeof window !== 'undefined') window.removeEventListener('online', this.onlineHandler)
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}

// ── Shared instance, configured from identity (join-a-class UI / env) ────────

let _sync: BackendSync | null = null
let _syncClassCode: string | null = null

/**
 * Shared BackendSync built from the joined class code (localStorage → VITE_CLASS_CODE
 * fallback) + the student's pseudonym. Returns null when no class code is set or the
 * backend isn't configured — recording still works; nothing flushes until joined.
 * Rebuilds if the class code changed (e.g. the student joined a different class).
 */
export function getBackendSync(): BackendSync | null {
  const classCode = getClassCode()
  const client = createAnonClient()
  if (!classCode || !client) return null
  if (_sync && _syncClassCode === classCode) return _sync
  _sync?.stopAutoFlush()
  _syncClassCode = classCode
  _sync = new BackendSync(classCode, getPseudonym(), client)
  return _sync
}
