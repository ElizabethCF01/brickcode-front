import { useParams } from 'react-router-dom'
import { Check, Flag, Play, Puzzle, Square, TriangleAlert, X, type LucideIcon } from 'lucide-react'
import { loadSession } from '../../backend/dashboardApi'
import { useAsync } from '../useAsync'
import { dash } from '../paths'
import { Loading, ErrorBox, PageHeader } from '../ui'

const LABELS: Record<string, { icon: LucideIcon; label: string }> = {
  program_run_started: { icon: Play, label: 'Program started' },
  program_run_ended: { icon: Square, label: 'Program ended' },
  challenge_evaluated: { icon: Flag, label: 'Challenge evaluated' },
  block_executed: { icon: Puzzle, label: 'Block' },
  events_capped: { icon: TriangleAlert, label: 'Event limit reached' },
}

export default function SessionPage() {
  const { sessionId = '' } = useParams()
  const { loading, error, data } = useAsync(() => loadSession(sessionId), [sessionId])

  return (
    <>
      <PageHeader
        title="Session detail"
        subtitle={data ? `${data.events.length} events · challenge ${data.challengeIds.join(', ') || '—'}` : undefined}
        back={{ to: dash.classes, label: 'Classes' }}
      />
      {loading && <Loading />}
      {error && <ErrorBox message={error} />}
      {data && (
        <ol className="relative border-l border-line pl-6">
          {data.events.map((e, i) => {
            const meta = LABELS[e.type]
            const Icon = meta?.icon
            return (
              <li key={i} className="mb-5">
                <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-action-500/60" />
                <div className="flex items-baseline justify-between">
                  <span className="flex items-center gap-1.5 font-medium text-ink">
                    {Icon && <Icon size={14} className="text-ink-muted" aria-hidden="true" />}
                    {meta?.label ?? e.type}
                  </span>
                  <span className="font-mono text-xs text-ink-muted">{(e.tMonotonic / 1000).toFixed(2)}s</span>
                </div>
                {renderPayload(e.type, e.payload)}
              </li>
            )
          })}
        </ol>
      )}
    </>
  )
}

function renderPayload(type: string, payload?: Record<string, unknown>): React.ReactNode {
  if (!payload) return null
  if (type === 'block_executed' && 'blockType' in payload) {
    return <span className="font-mono text-sm text-ink-muted">{String(payload.blockType)}</span>
  }
  if (type === 'challenge_evaluated' && 'success' in payload) {
    return (
      <span className={`inline-flex items-center gap-1 text-sm ${payload.success ? 'text-success-700' : 'text-amber-600'}`}>
        {payload.success
          ? <Check size={14} aria-hidden="true" />
          : <X size={14} aria-hidden="true" />}
        {payload.success ? 'Achieved' : 'Not achieved'}
      </span>
    )
  }
  return <span className="font-mono text-xs text-ink-muted">{JSON.stringify(payload)}</span>
}
