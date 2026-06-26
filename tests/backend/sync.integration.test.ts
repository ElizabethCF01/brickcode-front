// End-to-end B2 verification against the LIVE local Supabase stack.
//
// The B2 analog of B1's curl proof: record→flush a session as anon, then read it
// back as the authenticated teacher, and prove idempotency + the SQL aggregation.
//
// Gated behind SUPA_IT=1 so the default `pnpm test:run` stays hermetic. Run with:
//   supabase start && supabase db reset
//   SUPA_IT=1 SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=<anon> pnpm vitest run sync.integration

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SessionRecorder } from '../../src/recording/SessionRecorder'
import { clearOutbox } from '../../src/recording/outbox'
import { BackendSync } from '../../src/backend/BackendSync'

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const ANON = process.env.SUPABASE_ANON_KEY ?? ''
const run = process.env.SUPA_IT === '1' && ANON.length > 0

async function newTeacher(name: string): Promise<{ client: SupabaseClient; email: string; pw: string }> {
  const email = `teacher_${name}_${Date.now()}@example.com`
  const pw = 'password123'
  const client = createClient(URL, ANON)
  const { error } = await client.auth.signUp({ email, password: pw, options: { data: { display_name: name } } })
  if (error) throw error
  return { client, email, pw }
}

;(run ? describe : describe.skip)('B2 sync ↔ backend (live local stack)', () => {
  let teacher: SupabaseClient
  let classId: string
  let classCode: string
  let api: typeof import('../../src/backend/dashboardApi')
  const pseudonym = `pupil-${Date.now().toString(36)}`

  beforeAll(async () => {
    await clearOutbox()
    // Configure the dashboardApi singleton against the local stack, then sign in
    // the teacher on it (dashboardApi reads run as the authenticated teacher).
    vi.stubEnv('VITE_SUPABASE_URL', URL)
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', ANON)

    const t = await newTeacher('A')
    teacher = t.client

    const { data, error } = await teacher
      .from('classes').insert({ name: 'Integration Class' })
      .select('id, class_code').single()
    if (error) throw error
    classId = data.id; classCode = data.class_code

    const { getSupabase } = await import('../../src/backend/supabaseClient')
    await getSupabase()!.auth.signInWithPassword({ email: t.email, password: t.pw })
    api = await import('../../src/backend/dashboardApi')
  })

  it('records a run, flushes it as anon, and the teacher reads it back', async () => {
    // ── record one run (anon simulator side) ──
    const recorder = new SessionRecorder()
    const session = recorder.startSession(['challenge-01'])
    recorder.recordEvent('program_run_started', { challengeId: 'challenge-01' })
    recorder.recordEvent('block_executed', { payload: { blockType: 'robot_move_for' } })
    recorder.recordEvent('block_executed', { payload: { blockType: 'robot_turn' } })
    recorder.recordEvent('program_run_ended', { challengeId: 'challenge-01' })
    recorder.recordEvent('challenge_evaluated', { challengeId: 'challenge-01', payload: { success: false } })
    await recorder.endSession()

    const anon = createClient(URL, ANON)
    const sync = new BackendSync(classCode, pseudonym, anon)
    await sync.flush()

    // ── teacher reads it back via dashboardApi (RLS-scoped) ──
    const classes = await api.listClasses()
    expect(classes.map((c) => c.id)).toContain(classId)

    const students = await api.listStudents(classId)
    expect(students.map((s) => s.pseudonym)).toContain(pseudonym)
    const student = students.find((s) => s.pseudonym === pseudonym)!

    const sessions = await api.listSessions(student.id)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].id).toBe(session.id)

    const full = await api.loadSession(session.id)
    expect(full.events.map((e) => e.type)).toContain('program_run_ended')
    expect(full.events.filter((e) => e.type === 'block_executed')).toHaveLength(2)
  })

  it('is idempotent: re-sending the same session id creates no duplicates', async () => {
    const anon = createClient(URL, ANON)
    // Find the student + session recorded above.
    const students = await api.listStudents(classId)
    const student = students.find((s) => s.pseudonym === pseudonym)!
    const before = await api.listSessions(student.id)
    const sid = before[0].id
    const eventsBefore = (await api.loadSession(sid)).events.length

    // Re-send the identical bundle directly via the RPC (what a retry does).
    await anon.rpc('submit_session', {
      p_class_code: classCode,
      p_student_pseudonym: pseudonym,
      p_session: { id: sid, started_at: before[0].startedAt, ended_at: before[0].endedAt, schema_version: 1 },
      p_events: [{ type: 'should_not_duplicate', schema_version: 1 }],
    })

    const after = await api.listSessions(student.id)
    expect(after).toHaveLength(before.length) // no new session
    expect((await api.loadSession(sid)).events.length).toBe(eventsBefore) // no new events
  })

  it('getClassEventStats computes a coherent SQL-side aggregate', async () => {
    const stats = await api.getClassEventStats(classId)
    const row = stats.find((s) => s.pseudonym === pseudonym)!
    expect(row).toBeTruthy()
    expect(row.runCount).toBeGreaterThanOrEqual(1)
    expect(row.failureCount).toBeGreaterThanOrEqual(1)        // we recorded success:false
    expect(row.blockFrequency['robot_move_for']).toBe(1)
    expect(row.blockFrequency['robot_turn']).toBe(1)
  })

  it('a second teacher sees none of the first teacher\'s data', async () => {
    const t2 = await newTeacher('B')
    const { data, error } = await t2.client.from('classes').select('id')
    expect(error).toBeNull()
    expect(data).toEqual([])
    const { data: sess } = await t2.client.from('sessions').select('id')
    expect(sess).toEqual([])
  })
})
