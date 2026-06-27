import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { BackendSync } from '../../src/backend/BackendSync'
import { putSession, getUnsynced, clearOutbox } from '../../src/recording/outbox'
import { type LearningSession, SCHEMA_VERSION } from '../../src/backend/types'

function sealedSession(id: string, overrides: Partial<LearningSession> = {}): LearningSession {
  return {
    id,
    startedAt: '2026-06-25T10:00:00.000Z',
    endedAt: '2026-06-25T10:01:00.000Z',
    challengeIds: ['challenge-01'],
    events: [
      { type: 'program_run_started', tMonotonic: 0, tWall: 1, schemaVersion: SCHEMA_VERSION },
      { type: 'block_executed', tMonotonic: 1, tWall: 2, payload: { blockType: 'robot_move_for' }, schemaVersion: SCHEMA_VERSION },
    ],
    eventCount: 2,
    schemaVersion: SCHEMA_VERSION,
    synced: false,
    ...overrides,
  }
}

function mockClient(rpc = vi.fn().mockResolvedValue({ data: 'id', error: null })) {
  return { client: { rpc } as never, rpc }
}

describe('BackendSync', () => {
  beforeEach(async () => {
    await clearOutbox()
  })

  it('flushes a sealed session via the submit_session RPC and marks it synced', async () => {
    await putSession(sealedSession('a'))
    const { client, rpc } = mockClient()
    const sync = new BackendSync('CODE01', 'pupil-1', client)

    await sync.flush()

    expect(rpc).toHaveBeenCalledTimes(1)
    const [fn, args] = rpc.mock.calls[0]
    expect(fn).toBe('submit_session')
    expect(args.p_class_code).toBe('CODE01')
    expect(args.p_student_pseudonym).toBe('pupil-1')
    expect(args.p_session.id).toBe('a')
    expect(args.p_session.event_count).toBe(2)
    expect(args.p_events).toHaveLength(2)
    expect(args.p_events[1].payload).toEqual({ blockType: 'robot_move_for' })
    expect(await getUnsynced()).toHaveLength(0)
  })

  it('is idempotent: a second flush sends nothing (already synced)', async () => {
    await putSession(sealedSession('a'))
    const { client, rpc } = mockClient()
    const sync = new BackendSync('CODE01', 'pupil-1', client)

    await sync.flush()
    await sync.flush()

    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('keeps a session queued when the RPC errors (offline)', async () => {
    await putSession(sealedSession('a'))
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error('offline') })
    const sync = new BackendSync('CODE01', 'pupil-1', { rpc } as never)

    await sync.flush()

    expect(await getUnsynced()).toHaveLength(1)
  })

  it('warns (not silently) when the class code is invalid', async () => {
    await putSession(sealedSession('a'))
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error('invalid class code') })
    const sync = new BackendSync('NOPE99', 'pupil-1', { rpc } as never)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await sync.flush()

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('NOPE99'))
    expect(await getUnsynced()).toHaveLength(1) // still queued
    warn.mockRestore()
  })

  it('skips unsealed (endedAt null) sessions', async () => {
    await putSession(sealedSession('a', { endedAt: null }))
    const { client, rpc } = mockClient()
    const sync = new BackendSync('CODE01', 'pupil-1', client)

    await sync.flush()

    expect(rpc).not.toHaveBeenCalled()
    expect(await getUnsynced()).toHaveLength(1)
  })
})
