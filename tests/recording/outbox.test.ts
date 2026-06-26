import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  putSession,
  getSession,
  markSynced,
  getUnsynced,
  clearOutbox,
} from '../../src/recording/outbox'
import { type LearningSession, SCHEMA_VERSION } from '../../src/backend/types'

function makeSession(id: string, overrides: Partial<LearningSession> = {}): LearningSession {
  return {
    id,
    startedAt: new Date().toISOString(),
    endedAt: null,
    challengeIds: ['challenge-01'],
    events: [],
    eventCount: 0,
    schemaVersion: SCHEMA_VERSION,
    synced: false,
    ...overrides,
  }
}

describe('outbox', () => {
  beforeEach(async () => {
    await clearOutbox()
  })

  it('stores and reads back a session', async () => {
    await putSession(makeSession('a'))
    const got = await getSession('a')
    expect(got?.id).toBe('a')
  })

  it('overwrites on put (write-through of the whole session)', async () => {
    await putSession(makeSession('a'))
    await putSession(makeSession('a', { eventCount: 5 }))
    expect((await getSession('a'))?.eventCount).toBe(5)
  })

  it('getUnsynced returns only unsynced sessions', async () => {
    await putSession(makeSession('a'))
    await putSession(makeSession('b', { synced: true }))
    const unsynced = await getUnsynced()
    expect(unsynced.map((s) => s.id)).toEqual(['a'])
  })

  it('markSynced flips the flag', async () => {
    await putSession(makeSession('a'))
    await markSynced('a')
    expect((await getSession('a'))?.synced).toBe(true)
    expect(await getUnsynced()).toHaveLength(0)
  })
})
