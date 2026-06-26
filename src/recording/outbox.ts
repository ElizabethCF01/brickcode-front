// IndexedDB-backed outbox for learning sessions.
//
// The outbox is an OFFLINE BUFFER, not the source of truth — the backend is.
// Sessions are buffered here as they're recorded so nothing is lost if the
// network drops mid-class, then flushed to the backend by BackendSync. Once a
// session is confirmed synced it stays here (marked) as an ephemeral cache; the
// dashboard never reads from it.
//
// Framework-agnostic: no React, no Supabase imports.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { LearningSession } from '../backend/types'

const DB_NAME = 'brickcode-outbox'
const DB_VERSION = 1
const STORE = 'sessions'

interface OutboxSchema extends DBSchema {
  sessions: {
    key: string
    value: LearningSession
    indexes: { 'by-synced': 'synced' }
  }
}

let _dbPromise: Promise<IDBPDatabase<OutboxSchema>> | null = null

function db(): Promise<IDBPDatabase<OutboxSchema>> {
  if (!_dbPromise) {
    _dbPromise = openDB<OutboxSchema>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        const store = database.createObjectStore(STORE, { keyPath: 'id' })
        // IndexedDB can't index booleans directly; we never query the index by
        // value (getUnsynced filters in memory), so a plain keyPath index over
        // the (numeric-coercible) flag is enough to keep the store shape stable.
        store.createIndex('by-synced', 'synced')
      },
    })
  }
  return _dbPromise
}

/** Insert or replace a session (write-through as it's recorded / sealed). */
export async function putSession(session: LearningSession): Promise<void> {
  await (await db()).put(STORE, session)
}

/** Read a single session by id, or undefined if absent. */
export async function getSession(id: string): Promise<LearningSession | undefined> {
  return (await db()).get(STORE, id)
}

/** Mark a session as synced once the backend confirms the submit. */
export async function markSynced(id: string): Promise<void> {
  const database = await db()
  const tx = database.transaction(STORE, 'readwrite')
  const session = await tx.store.get(id)
  if (session) {
    session.synced = true
    await tx.store.put(session)
  }
  await tx.done
}

/** All sessions not yet confirmed synced (the flush queue). */
export async function getUnsynced(): Promise<LearningSession[]> {
  const all = await (await db()).getAll(STORE)
  return all.filter((s) => !s.synced)
}

/** Test/maintenance helper: drop everything and reset the connection. */
export async function clearOutbox(): Promise<void> {
  await (await db()).clear(STORE)
}
