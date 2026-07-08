import { useParams } from 'react-router-dom'
import { loadSession } from '../../backend/dashboardApi'
import { useAsync } from '../useAsync'
import { dash } from '../paths'
import { Loading, ErrorBox, PageHeader } from '../ui'

const LABELS: Record<string, string> = {
  program_run_started: '▶ Program started',
  program_run_ended: '⏹ Program ended',
  challenge_evaluated: '🏁 Challenge evaluated',
  block_executed: '🧩 Block',
  events_capped: '⚠ Event limit reached',
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
        <ol className="relative border-l border-slate-200 pl-6">
          {data.events.map((e, i) => (
            <li key={i} className="mb-5">
              <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-indigo-400" />
              <div className="flex items-baseline justify-between">
                <span className="font-medium text-slate-900">{LABELS[e.type] ?? e.type}</span>
                <span className="font-mono text-xs text-slate-400">{(e.tMonotonic / 1000).toFixed(2)}s</span>
              </div>
              {renderPayload(e.type, e.payload)}
            </li>
          ))}
        </ol>
      )}
    </>
  )
}

function renderPayload(type: string, payload?: Record<string, unknown>): React.ReactNode {
  if (!payload) return null
  if (type === 'block_executed' && 'blockType' in payload) {
    return <span className="font-mono text-sm text-slate-600">{String(payload.blockType)}</span>
  }
  if (type === 'challenge_evaluated' && 'success' in payload) {
    return (
      <span className={`text-sm ${payload.success ? 'text-emerald-600' : 'text-amber-600'}`}>
        {payload.success ? '✓ Achieved' : '✗ Not achieved'}
      </span>
    )
  }
  return <span className="font-mono text-xs text-slate-500">{JSON.stringify(payload)}</span>
}
