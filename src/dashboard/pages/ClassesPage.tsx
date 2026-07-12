import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
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
      <PageHeader title="Your classes" subtitle="Share the code with your students so they can join." />
      <div className="mb-4">
        <Link
          to={dash.demo}
          className="inline-flex items-center gap-1 text-sm font-medium text-action-600 hover:underline
            rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          View class analytics demo (computational thinking)
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <CreateClassForm onCreated={() => setVersion((v) => v + 1)} />
      {loading && <Loading />}
      {error && <ErrorBox message={error} />}
      {data && data.length === 0 && (
        <Empty>You don't have any classes yet. Create one above to get a code.</Empty>
      )}
      {data && data.length > 0 && (
        <div className="grid gap-3">
          {data.map((c) => (
            <CardLink key={c.id} to={dash.class(c.id)}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-ink">{c.name}</span>
                <span className="rounded-md bg-brand-100 px-2 py-1 font-mono text-sm tracking-wider text-brand-900">
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

function CreateClassForm({ onCreated }: Readonly<{ onCreated: () => void }>) {
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
        placeholder="Class name (e.g. Robotics 3A)"
        className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-ink
          placeholder:text-ink-muted/60 focus:outline-none focus:ring-2 focus:ring-focus"
      />
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="min-h-11 rounded-lg bg-action-600 hover:bg-action-500 disabled:bg-line
          disabled:text-ink-muted px-4 py-2 font-medium text-white transition-colors
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
      >
        {busy ? '…' : 'Create class'}
      </button>
      {error && <ErrorBox message={error} />}
    </form>
  )
}
