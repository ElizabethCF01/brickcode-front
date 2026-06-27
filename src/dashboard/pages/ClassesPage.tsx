import { useState } from 'react'
import { listClasses, createClass } from '../../backend/dashboardApi'
import { useAsync } from '../useAsync'
import { dash } from '../paths'
import { Loading, ErrorBox, Empty, PageHeader, CardLink } from '../ui'

export default function ClassesPage() {
  // Bumping `version` re-runs the loader so a freshly created class (with its
  // server-generated code) shows up immediately.
  const [version, setVersion] = useState(0)
  const { loading, error, data } = useAsync(() => listClasses(), [version])

  return (
    <>
      <PageHeader title="Tus clases" subtitle="Comparte el código con tus alumnos para que se unan." />
      <CreateClassForm onCreated={() => setVersion((v) => v + 1)} />
      {loading && <Loading />}
      {error && <ErrorBox message={error} />}
      {data && data.length === 0 && (
        <Empty>Aún no tienes clases. Crea una arriba para obtener un código.</Empty>
      )}
      {data && data.length > 0 && (
        <div className="grid gap-3">
          {data.map((c) => (
            <CardLink key={c.id} to={dash.class(c.id)}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-900">{c.name}</span>
                <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-sm tracking-wider text-slate-700">
                  {c.classCode}
                </span>
              </div>
            </CardLink>
          ))}
        </div>
      )}
    </>
  )
}

function CreateClassForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true); setError(null)
    try {
      await createClass(trimmed)
      setName('')
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mb-6 flex gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre de la clase (ej. Robótica 3ºA)"
        className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 px-4 py-2 font-medium text-white transition-colors"
      >
        {busy ? '…' : 'Crear clase'}
      </button>
      {error && <ErrorBox message={error} />}
    </form>
  )
}
