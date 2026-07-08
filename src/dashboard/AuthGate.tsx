import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabase } from '../backend/supabaseClient'
import { currentUserIsTeacher } from '../backend/roles'
import LoginForm from './LoginForm'

/**
 * Gates the dashboard behind a TEACHER Supabase session. Shows the login screen
 * until authenticated as a teacher; a student session (no teachers row) is
 * rejected so a student can't land on an empty dashboard.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const supabase = getSupabase()
  const [session, setSession] = useState<Session | null>(null)
  const [isTeacher, setIsTeacher] = useState<boolean | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!supabase) { setReady(true); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [supabase])

  // Resolve the role whenever the session changes.
  useEffect(() => {
    if (!session) { setIsTeacher(null); return }
    let cancelled = false
    currentUserIsTeacher().then((t) => { if (!cancelled) setIsTeacher(t) })
    return () => { cancelled = true }
  }, [session])

  if (!supabase) {
    return (
      <CenteredCard>
        <p className="text-slate-700">
          Backend not configured. Set <code className="font-mono">VITE_SUPABASE_URL</code> and{' '}
          <code className="font-mono">VITE_SUPABASE_ANON_KEY</code>.
        </p>
      </CenteredCard>
    )
  }

  if (!ready) return <CenteredCard><p className="text-slate-500">Loading…</p></CenteredCard>
  if (!session) return <LoginForm />
  if (isTeacher === null) return <CenteredCard><p className="text-slate-500">Loading…</p></CenteredCard>
  if (!isTeacher) {
    return <LoginForm note="This account is not a teacher account. Sign in with a teacher account." />
  }
  return <>{children}</>
}

export function CenteredCard({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        {children}
      </div>
    </div>
  )
}
