import { useState } from 'react'
import { getClassCode, getPseudonym, setClassCode, setNickname } from '../backend/identity'
import { getBackendSync } from '../backend/BackendSync'

/**
 * Student "join a class" screen: enter the class code the teacher shared, plus an
 * optional nickname (pseudonym — no real names). Persists via the identity helper,
 * then flushes any buffered sessions under the new code.
 */
export default function JoinClassModal({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState(getClassCode() ?? '')
  const [nick, setNick] = useState('')

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) return
    setClassCode(trimmed)
    if (nick.trim()) setNickname(nick)
    // Rebuild sync for the new code and push anything already buffered.
    void getBackendSync()?.flush()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-gray-800 border border-gray-700 p-6 text-white shadow-2xl">
        <h2 className="text-lg font-semibold">Únete a una clase</h2>
        <p className="mt-1 text-sm text-gray-400">
          Pide a tu profe el código de la clase. Tu trabajo se guardará con un apodo, nunca tu nombre real.
        </p>
        <form onSubmit={save} className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-300">Código de clase</span>
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ABC123"
              className="rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-300">Apodo (opcional)</span>
            <input
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              placeholder={getPseudonym()}
              className="rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <div className="mt-2 flex gap-2">
            <button type="submit" className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 py-2 font-medium">
              Unirme
            </button>
            <button type="button" onClick={onClose} className="rounded-lg bg-gray-700 hover:bg-gray-600 px-4 py-2">
              Ahora no
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
