import { useParams } from 'react-router-dom'
import { listSessions, loadSession } from '../../backend/dashboardApi'
import { analyzeStudent } from '../../analytics'
import { StudentReportPanel } from '../analyticsView'
import { useAsync } from '../useAsync'
import { dash } from '../paths'
import { Loading, ErrorBox, Empty, PageHeader, CardLink } from '../ui'

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—'
}

export default function StudentPage() {
  const { studentId = '' } = useParams()
  // Load session metadata, then the full event bundles so the analytics pipeline
  // can read each run's program snapshot (N+1 reads — fine at PoC scale).
  const { loading, error, data } = useAsync(async () => {
    const summaries = await listSessions(studentId)
    const sessions = await Promise.all(summaries.map((s) => loadSession(s.id)))
    return { summaries, report: analyzeStudent(sessions) }
  }, [studentId])

  return (
    <>
      <PageHeader title="Student sessions" back={{ to: dash.classes, label: 'Classes' }} />
      {loading && <Loading />}
      {error && <ErrorBox message={error} />}
      {data && <StudentReportPanel report={data.report} />}
      {data && data.summaries.length === 0 && <Empty>This student has no sessions yet.</Empty>}
      {data && data.summaries.length > 0 && (
        <div className="grid gap-3">
          {data.summaries.map((s) => (
            <CardLink key={s.id} to={dash.session(s.id)}>
              <div className="flex items-center justify-between">
                <span className="text-ink">{fmt(s.startedAt)}</span>
                <div className="flex gap-4 text-sm text-ink-muted">
                  <span><b className="text-ink">{s.eventCount}</b> events</span>
                  <span>{s.challengeIds.join(', ') || 'no challenge'}</span>
                </div>
              </div>
            </CardLink>
          ))}
        </div>
      )}
    </>
  )
}
