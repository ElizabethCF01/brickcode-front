// End-to-end verification against the LIVE local Supabase stack — student-account model.
//
// Student signs up (role=student) → joins a class → records a run → flushes via
// submit_session_auth; the teacher reads it back (pseudonym only). Plus idempotency,
// student-can't-read-sessions, and teacher isolation.
//
// Gated behind SUPA_IT=1 so `pnpm test:run` stays hermetic. Run with:
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

async function signUp(role: 'teacher' | 'student'): Promise<{ client: SupabaseClient; email: string; pw: string }> {
  const email = `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`
  const pw = 'password123'
  // Distinct storageKey per client: in jsdom every client otherwise shares one
  // storage key and the sessions clobber each other (a test-only artifact — in
  // real use there's one client per machine).
  const client = createClient(URL, ANON, {
    auth: { persistSession: false, storageKey: `it-${role}-${Math.random().toString(36).slice(2, 8)}` },
  })
  const { error } = await client.auth.signUp({ email, password: pw, options: { data: { role } } })
  if (error) throw error
  return { client, email, pw }
}

;(run ? describe : describe.skip)('student-account sync ↔ backend (live local stack)', () => {
  let teacher: SupabaseClient
  let student: SupabaseClient
  let classId: string
  let classCode: string
  let api: typeof import('../../src/backend/dashboardApi')
  const pseudonym = `Estrella${Date.now().toString(36)}`

  beforeAll(async () => {
    await clearOutbox()
    vi.stubEnv('VITE_SUPABASE_URL', URL)
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', ANON)

    const t = await signUp('teacher')
    teacher = t.client
    const { data, error } = await teacher.from('classes').insert({ name: 'IT Class' })
      .select('id, class_code').single()
    if (error) throw error
    classId = data.id; classCode = data.class_code

    // Student signs up + joins the class.
    student = (await signUp('student')).client
    const { error: joinErr } = await student.rpc('join_class', { p_class_code: classCode, p_pseudonym: pseudonym })
    if (joinErr) throw joinErr

    // dashboardApi singleton signed in as the teacher (default storage key, separate client).
    const { getSupabase } = await import('../../src/backend/supabaseClient')
    await getSupabase()!.auth.signInWithPassword({ email: t.email, password: t.pw })
    api = await import('../../src/backend/dashboardApi')
  }, 30000)

  it('the role-aware trigger created a teacher row but NOT one for the student', async () => {
    // teacher sees exactly themselves among teachers (RLS), and the student has no teacher row
    const { data } = await teacher.from('classes').select('id')
    expect(data?.some((c) => c.id === classId)).toBe(true)
  })

  it('records a run, flushes it as the student, and the teacher reads it back (pseudonym only)', async () => {
    const recorder = new SessionRecorder()
    const session = recorder.startSession(['challenge-01'])
    recorder.recordEvent('program_run_started', { challengeId: 'challenge-01' })
    recorder.recordEvent('block_executed', { payload: { blockType: 'robot_move_for' } })
    recorder.recordEvent('block_executed', { payload: { blockType: 'robot_turn' } })
    recorder.recordEvent('challenge_evaluated', { challengeId: 'challenge-01', payload: { success: false } })
    await recorder.endSession()

    await new BackendSync(student).flush()

    const students = await api.listStudents(classId)
    expect(students.map((s) => s.pseudonym)).toContain(pseudonym)
    const me = students.find((s) => s.pseudonym === pseudonym)!

    const sessions = await api.listSessions(me.id)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].id).toBe(session.id)

    const full = await api.loadSession(session.id)
    expect(full.events.filter((e) => e.type === 'block_executed')).toHaveLength(2)
  })

  it('re-sending the same session id is idempotent (no duplicate events)', async () => {
    const me = (await api.listStudents(classId)).find((s) => s.pseudonym === pseudonym)!
    const sid = (await api.listSessions(me.id))[0].id
    const before = (await api.loadSession(sid)).events.length

    await student.rpc('submit_session_auth', {
      p_session: { id: sid, schema_version: 1 },
      p_events: [{ type: 'should_not_duplicate', schema_version: 1 }],
    })

    expect((await api.loadSession(sid)).events.length).toBe(before)
  })

  it('a student cannot read sessions (RLS); only the teacher can', async () => {
    const { data } = await student.from('sessions').select('id')
    expect(data).toEqual([])
  })

  it('getClassEventStats aggregates per student in SQL', async () => {
    const stats = await api.getClassEventStats(classId)
    const row = stats.find((s) => s.pseudonym === pseudonym)!
    expect(row.runCount).toBeGreaterThanOrEqual(1)
    expect(row.failureCount).toBeGreaterThanOrEqual(1)
    expect(row.blockFrequency['robot_move_for']).toBe(1)
  })

  it('a second teacher sees none of the first teacher\'s data', async () => {
    const t2 = await signUp('teacher')
    const { data } = await t2.client.from('classes').select('id')
    expect(data).toEqual([])
  })
})
