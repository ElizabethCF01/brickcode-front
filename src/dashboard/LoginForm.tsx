import { useState } from 'react'
import { getSupabase } from '../backend/supabaseClient'
import { CenteredCard } from './AuthGate'

/**
 * Teacher login / signup. On signup the handle_new_user trigger creates the
 * teachers row (display_name from metadata). onAuthStateChange in AuthGate
 * reacts to the resulting session — no manual redirect needed.
 */
export default function LoginForm() {
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
        setError('Revisa tu correo para confirmar la cuenta, luego inicia sesión.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <CenteredCard>
      <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900 mb-1">
        <img src="/logo.png" alt="" className="h-7 w-7" />
        <span>BrickCode · Profesor</span>
      </h1>
      <p className="text-sm text-slate-500 mb-6">
        {mode === 'login' ? 'Inicia sesión para ver el progreso de tu clase.' : 'Crea tu cuenta de profesor.'}
      </p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {mode === 'signup' && (
          <Field label="Nombre" value={displayName} onChange={setName} type="text" placeholder="Sra. García" />
        )}
        <Field label="Correo" value={email} onChange={setEmail} type="email" placeholder="profe@escuela.es" required />
        <Field label="Contraseña" value={password} onChange={setPassword} type="password" required />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 text-white font-medium py-2.5 transition-colors"
        >
          {busy ? '…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
        </button>
      </form>
      <button
        onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null) }}
        className="mt-4 text-sm text-indigo-600 hover:underline"
      >
        {mode === 'login' ? '¿No tienes cuenta? Crear una' : '¿Ya tienes cuenta? Inicia sesión'}
      </button>
    </CenteredCard>
  )
}

function Field(props: {
  label: string; value: string; onChange: (v: string) => void
  type: string; placeholder?: string; required?: boolean
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-600">{props.label}</span>
      <input
        className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        type={props.type}
        value={props.value}
        placeholder={props.placeholder}
        required={props.required}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  )
}
