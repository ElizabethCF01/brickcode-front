import { useEffect, useState, type ReactNode } from 'react'
import { getSupabase } from '../backend/supabaseClient'
import JoinClassModal from './JoinClassModal'

/**
 * After student login, ensure the student is enrolled in a class before playing.
 * Reads their own student row (RLS self-select); if none, shows the join screen.
 */
export default function EnrollmentGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'need' | 'ok'>('loading')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) { setState('ok'); return } // defensive: no backend → play locally
    let cancelled = false
    supabase
      .from('students').select('id').limit(1)
      .then(({ data }) => { if (!cancelled) setState(data && data.length > 0 ? 'ok' : 'need') })
    return () => { cancelled = true }
  }, [version])

  if (state === 'loading') {
    return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-gray-400">Cargando…</div>
  }
  if (state === 'need') return <JoinClassModal onEnrolled={() => setVersion((v) => v + 1)} />
  return <>{children}</>
}
