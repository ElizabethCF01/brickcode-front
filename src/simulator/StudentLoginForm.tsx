import { useState } from 'react'
import { getSupabase } from '../backend/supabaseClient'

/**
 * Student login / signup (email + password). Signup tags the account with
 * role:'student' in user metadata so the handle_new_user trigger does NOT create
 * a teacher row. Enrollment in a class happens after login (EnrollmentGate).
 *
 * Privacy note: the email is PII held only in auth.users; teachers never see it.
 */
export default function StudentLoginForm({ note }: Readonly<{ note?: string }>) {
  const supabase = getSupabase()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!supabase) {
    return <Centered><p className="text-ink-muted">Backend not configured.</p></Centered>
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const res = mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { data: { role: 'student' } } })
      if (res.error) setError(res.error.message)
      else if (mode === 'signup' && !res.data.session) {
        setError('Check your email to confirm the account, then sign in.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Centered>
      <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-wide text-ink">
        <img src="/logo.png" alt="" className="h-8 w-8" />
        <span>BrickCode</span>
      </h1>
      <p className="mt-1 mb-6 text-sm text-ink-muted">
        {note ?? (mode === 'login' ? 'Log in to program your robot.' : 'Create your student account.')}
      </p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="student@school.edu" required />
        <Field label="Password" value={password} onChange={setPassword} type="password" required />
        {error && <p className="text-sm text-danger-600" role="alert">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-2 min-h-11 rounded-xl bg-action-600 hover:bg-action-500 disabled:bg-line
            disabled:text-ink-muted py-3 font-bold text-white transition-colors
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
        >
          {busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <button
        onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null) }}
        className="mt-4 min-h-11 text-sm font-semibold text-action-600 hover:underline
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-lg"
      >
        {mode === 'login' ? 'No account? Create one' : 'Already have an account? Sign in'}
      </button>
    </Centered>
  )
}

function Centered({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 text-ink shadow-lg">
        {children}
      </div>
    </div>
  )
}

function Field(props: Readonly<{
  label: string; value: string; onChange: (v: string) => void
  type: string; placeholder?: string; required?: boolean
}>) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-ink">{props.label}</span>
      <input
        className="rounded-xl border border-line bg-surface-2 px-3 py-3 text-base text-ink
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
