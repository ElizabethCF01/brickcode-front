// Authenticated teacher reads for the dashboard. RLS scopes every result to the
// signed-in teacher automatically (see supabase/migrations §RLS) — these
// functions add no client-side filtering for access control.
//
// The caller must have an authenticated Supabase session (teacher signed in via
// supabase.auth.signInWithPassword). The simulator never calls these.

import { getSupabase } from './supabaseClient'
import type {
  ClassSummary,
  StudentSummary,
  SessionSummary,
  LearningSession,
  LearningEvent,
  EventStats,
} from './types'

function client() {
  const c = getSupabase()
  if (!c) throw new Error('Supabase not configured (set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)')
  return c
}

export async function listClasses(): Promise<ClassSummary[]> {
  const { data, error } = await client()
    .from('classes')
    .select('id, name, class_code, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    classCode: c.class_code,
    createdAt: c.created_at,
  }))
}

export async function listStudents(classId: string): Promise<StudentSummary[]> {
  const { data, error } = await client()
    .from('students')
    .select('id, pseudonym, created_at')
    .eq('class_id', classId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((s) => ({
    id: s.id,
    pseudonym: s.pseudonym,
    createdAt: s.created_at,
  }))
}

/** Session metadata only — no events. Use loadSession for the full bundle. */
export async function listSessions(studentId: string): Promise<SessionSummary[]> {
  const { data, error } = await client()
    .from('sessions')
    .select('id, started_at, ended_at, challenge_ids, event_count')
    .eq('student_id', studentId)
    .order('started_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((s) => ({
    id: s.id,
    startedAt: s.started_at,
    endedAt: s.ended_at,
    challengeIds: s.challenge_ids ?? [],
    eventCount: s.event_count ?? 0,
  }))
}

/** Full session with its events, ordered by monotonic time. */
export async function loadSession(sessionId: string): Promise<LearningSession> {
  const c = client()
  const { data: s, error: sErr } = await c
    .from('sessions')
    .select('id, started_at, ended_at, challenge_ids, event_count, schema_version')
    .eq('id', sessionId)
    .single()
  if (sErr) throw sErr

  const { data: evRows, error: eErr } = await c
    .from('events')
    .select('type, t_monotonic, t_wall, challenge_id, payload, schema_version')
    .eq('session_id', sessionId)
    .order('t_monotonic', { ascending: true })
  if (eErr) throw eErr

  const events: LearningEvent[] = (evRows ?? []).map((e) => ({
    type: e.type,
    tMonotonic: e.t_monotonic,
    tWall: e.t_wall,
    challengeId: e.challenge_id ?? undefined,
    payload: e.payload ?? undefined,
    schemaVersion: e.schema_version,
  }))

  return {
    id: s.id,
    startedAt: s.started_at,
    endedAt: s.ended_at,
    challengeIds: s.challenge_ids ?? [],
    events,
    eventCount: s.event_count ?? events.length,
    schemaVersion: s.schema_version,
    synced: true,
  }
}

/** Server-side SQL aggregation: per-student run/failure counts + block frequency. */
export async function getClassEventStats(classId: string): Promise<EventStats> {
  const { data, error } = await client().rpc('get_class_event_stats', { p_class_id: classId })
  if (error) throw error
  return (data ?? []).map((r: {
    student_id: string
    pseudonym: string
    run_count: number
    failure_count: number
    block_frequency: Record<string, number> | null
  }) => ({
    studentId: r.student_id,
    pseudonym: r.pseudonym,
    runCount: r.run_count,
    failureCount: r.failure_count,
    blockFrequency: r.block_frequency ?? {},
  }))
}
