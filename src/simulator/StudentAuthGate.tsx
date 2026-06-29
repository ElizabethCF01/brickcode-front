import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabase } from '../backend/supabaseClient'
import StudentLoginForm from './StudentLoginForm'

/**
 * Gates the simulator behind a STUDENT Supabase session (login is mandatory).
 * Shows the student login until authenticated as a student. If a teacher is
 * signed in on the same browser (one session per origin), prompts to log in as a
 * student instead (logging in replaces the session).
 */
export default function StudentAuthGate({ children }: { children: ReactNode }) {
  const supabase = getSupabase()
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!supabase) { setReady(true); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [supabase])

  if (!ready) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-gray-400">Cargando…</div>
  }
  if (!session) return <StudentLoginForm />

  const role = (session.user.user_metadata as { role?: string } | null)?.role
  if (role !== 'student') {
    return <StudentLoginForm note="Estás conectado con otra cuenta. Inicia sesión como alumno para jugar." />
  }
  return <>{children}</>
}
