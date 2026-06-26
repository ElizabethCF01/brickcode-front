import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { SessionRecorder } from '../../src/recording/SessionRecorder'
import { clearOutbox, getSession } from '../../src/recording/outbox'

describe('SessionRecorder', () => {
  beforeEach(async () => {
    await clearOutbox()
  })

  it('starts a session with a generated id and challenge ids', () => {
    const r = new SessionRecorder()
    const s = r.startSession(['challenge-01'])
    expect(s.id).toMatch(/[0-9a-f-]{36}/)
    expect(s.challengeIds).toEqual(['challenge-01'])
    expect(s.endedAt).toBeNull()
    expect(r.isRecording()).toBe(true)
  })

  it('records events and seals on endSession', async () => {
    const r = new SessionRecorder()
    r.startSession([])
    r.recordEvent('program_run_started')
    r.recordEvent('block_executed', { payload: { blockType: 'robot_move_for' } })
    const sealed = await r.endSession()
    expect(sealed).not.toBeNull()
    expect(sealed!.endedAt).not.toBeNull()
    expect(sealed!.events).toHaveLength(2)
    expect(sealed!.eventCount).toBe(2)
    expect(r.isRecording()).toBe(false)
  })

  it('endSession is idempotent (second call returns null)', async () => {
    const r = new SessionRecorder()
    r.startSession([])
    expect(await r.endSession()).not.toBeNull()
    expect(await r.endSession()).toBeNull()
  })

  it('recordEvent is a no-op with no active session', () => {
    const r = new SessionRecorder()
    expect(() => r.recordEvent('block_executed')).not.toThrow()
  })

  it('caps events and emits a single events_capped marker', async () => {
    const r = new SessionRecorder()
    r.startSession([])
    for (let i = 0; i < 5200; i++) r.recordEvent('block_executed')
    const sealed = await r.endSession()
    // 5000 real events + exactly one cap marker
    expect(sealed!.events).toHaveLength(5001)
    expect(sealed!.events.filter((e) => e.type === 'events_capped')).toHaveLength(1)
  })

  it('write-through persists the session to the outbox', async () => {
    const r = new SessionRecorder()
    const s = r.startSession([])
    // allow the fire-and-forget putSession to settle
    await new Promise((res) => setTimeout(res, 0))
    expect((await getSession(s.id))?.id).toBe(s.id)
  })
})
