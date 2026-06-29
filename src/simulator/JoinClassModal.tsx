import { useState } from 'react'
import { getSupabase } from '../backend/supabaseClient'

/**
 * Enrollment screen: the signed-in student joins a class with the code the
 * teacher shared, plus a nickname (pseudonym — no real names). Calls the
 * join_class RPC, which links their account to the class.
 */
export default function JoinClassModal({ onEnrolled }: { onEnrolled: () => void }) {
  const supabase = getSupabase()
  const [code, setCode] = useState('')
  const [nick, setNick] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = code.trim().toUpperCase()
    if (!trimmed || busy || !supabase) return
    setBusy(true); setError(null)
    const pseudonym = nick.trim() || `pupil-${Math.random().toString(36).slice(2, 8)}`
    const { error: rpcErr } = await supabase.rpc('join_class', {
      p_class_code: trimmed,
      p_pseudonym: pseudonym,
    })
    if (rpcErr) {
      setError(rpcErr.message.includes('invalid class code') ? 'Código de clase no válido.' : rpcErr.message)
    } else {
      onEnrolled()
    }
    setBusy(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-800 p-8 text-white shadow-2xl">
        <h2 className="text-lg font-semibold">Únete a una clase</h2>
        <p className="mt-1 text-sm text-gray-400">
          Pide a tu profe el código de la clase. Tu trabajo se guardará con un apodo, nunca tu nombre real.
        </p>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-300">Código de clase</span>
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ABC123"
              className="rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 font-mono uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-300">Apodo (opcional)</span>
            <input
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              placeholder="Estrella7"
              className="rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={busy || !code.trim()}
            className="mt-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 py-2 font-medium"
          >
            {busy ? '…' : 'Unirme'}
          </button>
        </form>
      </div>
    </div>
  )
}
