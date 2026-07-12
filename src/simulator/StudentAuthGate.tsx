import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabase } from '../backend/supabaseClient'
import { currentUserIsTeacher } from '../backend/roles'
import StudentLoginForm from './StudentLoginForm'

/**
 * Gates the simulator behind a STUDENT Supabase session (login is mandatory).
 * A teacher session (has a teachers row) is rejected — a teacher visiting /play
 * is asked to sign in as a student instead (logging in replaces the session).
 */
export default function StudentAuthGate({ children }: { children: ReactNode }) {
  const supabase = getSupabase()
  const [session, setSession] = useState<Session | null>(null)
  const [isTeacher, setIsTeacher] = useState<boolean | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!supabase) { setReady(true); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [supabase])

  useEffect(() => {
    if (!session) { setIsTeacher(null); return }
    let cancelled = false
    currentUserIsTeacher().then((t) => { if (!cancelled) setIsTeacher(t) })
    return () => { cancelled = true }
  }, [session])

  const loading = <div className="min-h-screen flex items-center justify-center bg-canvas text-ink-muted">Loading…</div>

  if (!ready) return loading
  if (!session) return <StudentLoginForm />
  if (isTeacher === null) return loading
  if (isTeacher) {
    return <StudentLoginForm note="You're signed in as a teacher. Sign in as a student to play." />
  }
  return <>{children}</>
}
