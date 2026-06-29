import { useState } from 'react'
import { getSupabase } from '../backend/supabaseClient'

/**
 * Student login / signup (email + password). Signup tags the account with
 * role:'student' in user metadata so the handle_new_user trigger does NOT create
 * a teacher row. Enrollment in a class happens after login (EnrollmentGate).
 *
 * Privacy note: the email is PII held only in auth.users; teachers never see it.
 */
export default function StudentLoginForm({ note }: { note?: string }) {
  const supabase = getSupabase()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!supabase) {
    return <Centered><p className="text-gray-300">Backend no configurado.</p></Centered>
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
        setError('Revisa tu correo para confirmar la cuenta, luego inicia sesión.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Centered>
      <h1 className="flex items-center gap-2 text-2xl font-bold text-yellow-400">
        <img src="/logo.png" alt="" className="h-8 w-8" />
        <span>BrickCode</span>
      </h1>
      <p className="mt-1 mb-6 text-sm text-gray-400">
        {note ?? (mode === 'login' ? 'Entra para programar tu robot.' : 'Crea tu cuenta de alumno.')}
      </p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Correo" value={email} onChange={setEmail} type="email" placeholder="alumno@escuela.es" required />
        <Field label="Contraseña" value={password} onChange={setPassword} type="password" required />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 py-2.5 font-medium text-white transition-colors"
        >
          {busy ? '…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
        </button>
      </form>
      <button
        onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null) }}
        className="mt-4 text-sm text-indigo-400 hover:underline"
      >
        {mode === 'login' ? '¿No tienes cuenta? Crear una' : '¿Ya tienes cuenta? Entrar'}
      </button>
    </Centered>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-800 p-8 text-white shadow-2xl">
        {children}
      </div>
    </div>
  )
}

function Field(props: {
  label: string; value: string; onChange: (v: string) => void
  type: string; placeholder?: string; required?: boolean
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-300">{props.label}</span>
      <input
        className="rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        type={props.type}
        value={props.value}
        placeholder={props.placeholder}
        required={props.required}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  )
}
