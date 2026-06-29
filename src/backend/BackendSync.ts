// Outbox sync: flushes buffered learning sessions to the backend via the
// submit_session_auth RPC. Offline-resilient and idempotent.
//
// Students are authenticated (mandatory login). This runs as the signed-in
// student: the RPC resolves their student row by auth.uid(), so no class code or
// pseudonym is sent. The student only ever WRITES — reading is the teacher's path.
//
// Idempotency: every session carries a client-generated id. The RPC inserts
// events only when that id is new, so re-flushing an already-synced session is a
// clean no-op. A session is SEALED at first flush and never gains events.
//
// Framework-agnostic: no React imports.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabase } from './supabaseClient'
import { getUnsynced, markSynced } from '../recording/outbox'
import type { LearningSession } from './types'

/** Periodic retry cadence while auto-flush is running. */
const RETRY_INTERVAL_MS = 30_000

export class BackendSync {
  private readonly client: SupabaseClient | null
  private timer: ReturnType<typeof setInterval> | null = null
  private flushing = false
  private readonly onlineHandler = () => { void this.flush() }

  constructor(client?: SupabaseClient | null) {
    this.client = client ?? getSupabase()
  }

  /**
   * Push every unsynced sealed session to the backend. Sessions that fail (e.g.
   * offline, or not enrolled yet) stay queued for the next flush. Safe to call
   * repeatedly — concurrent calls are coalesced, synced sessions are skipped.
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
          const message = err instanceof Error ? err.message : String(err)
          if (message.includes('not enrolled')) {
            console.warn(
              `[BackendSync] not enrolled in a class — session ${session.id} stays queued. ` +
                `Join a class to sync.`,
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

  /** Submit one session via the authenticated RPC. Throws on error so flush keeps it queued. */
  private async submit(session: LearningSession): Promise<void> {
    if (!this.client) throw new Error('backend not configured')
    const { error } = await this.client.rpc('submit_session_auth', {
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

// ── Shared instance ─────────────────────────────────────────────────────────

let _sync: BackendSync | null = null

/**
 * Shared BackendSync bound to the authenticated Supabase client. Returns null
 * when the backend isn't configured — recording still works locally; nothing
 * flushes. Submits run as the signed-in student (RPC resolves them by auth.uid()).
 */
export function getBackendSync(): BackendSync | null {
  const client = getSupabase()
  if (!client) return null
  if (!_sync) _sync = new BackendSync(client)
  return _sync
}
