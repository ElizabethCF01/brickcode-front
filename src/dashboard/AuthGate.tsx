import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabase } from '../backend/supabaseClient'
import LoginForm from './LoginForm'

/**
 * Gates the dashboard behind a Supabase Auth session (the teacher). Shows the
 * login screen until authenticated; renders children (with a logout affordance
 * via context) once signed in. Uses the persisted getSupabase() client.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const supabase = getSupabase()
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!supabase) { setReady(true); return }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [supabase])

  if (!supabase) {
    return (
      <CenteredCard>
        <p className="text-slate-700">
          Backend no configurado. Define <code className="font-mono">VITE_SUPABASE_URL</code> y{' '}
          <code className="font-mono">VITE_SUPABASE_ANON_KEY</code>.
        </p>
      </CenteredCard>
    )
  }

  if (!ready) return <CenteredCard><p className="text-slate-500">Cargando…</p></CenteredCard>
  if (!session) return <LoginForm />
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
