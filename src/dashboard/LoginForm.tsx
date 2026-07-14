import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getSupabase } from '../backend/supabaseClient'
import { CenteredCard } from './AuthGate'

/**
 * Teacher login / signup. On signup the handle_new_user trigger creates the
 * teachers row (display_name from metadata). onAuthStateChange in AuthGate
 * reacts to the resulting session — no manual redirect needed.
 */
export default function LoginForm({ note }: Readonly<{ note?: string }>) {
  const supabase = getSupabase()!
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [displayName, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const res = mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName, role: 'teacher' } } })
      if (res.error) setError(res.error.message)
      else if (mode === 'signup' && !res.data.session) {
        setError('Check your email to confirm the account, then sign in.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <CenteredCard>
      <h1 className="flex items-center gap-2 text-xl font-bold text-ink mb-1">
        <Link to="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="BrickCode home" className="h-7 w-7" />
        </Link>
        <span>BrickCode · Teacher</span>
      </h1>
      {note && <p className="text-sm text-amber-600 mb-2" role="alert">{note}</p>}
      <p className="text-sm text-ink-muted mb-6">
        {mode === 'login' ? 'Sign in to see your class\'s progress.' : 'Create your teacher account.'}
      </p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {mode === 'signup' && (
          <Field label="Name" value={displayName} onChange={setName} type="text" placeholder="Ms. Garcia" />
        )}
        <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="teacher@school.edu" required />
        <Field label="Password" value={password} onChange={setPassword} type="password" required />
        {error && <p className="text-sm text-danger-600" role="alert">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-2 min-h-11 rounded-lg bg-action-600 hover:bg-action-500 disabled:bg-line
            disabled:text-ink-muted text-white font-semibold py-2.5 transition-colors
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
        >
          {busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <button
        onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null) }}
        className="mt-4 min-h-11 text-sm text-action-600 hover:underline rounded-lg
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        {mode === 'login' ? 'No account? Create one' : 'Already have an account? Sign in'}
      </button>
    </CenteredCard>
  )
}

function Field(props: Readonly<{
  label: string; value: string; onChange: (v: string) => void
  type: string; placeholder?: string; required?: boolean
}>) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-ink-muted">{props.label}</span>
      <input
        className="rounded-lg border border-line px-3 py-2.5 text-ink bg-surface
          placeholder:text-ink-muted/60 focus:outline-none focus:ring-2 focus:ring-focus"
        type={props.type}
        value={props.value}
        placeholder={props.placeholder}
        required={props.required}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  )
}
