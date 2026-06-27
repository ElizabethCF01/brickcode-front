import { useParams } from 'react-router-dom'
import { listSessions } from '../../backend/dashboardApi'
import { useAsync } from '../useAsync'
import { dash } from '../paths'
import { Loading, ErrorBox, Empty, PageHeader, CardLink } from '../ui'

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—'
}

export default function StudentPage() {
  const { studentId = '' } = useParams()
  const { loading, error, data } = useAsync(() => listSessions(studentId), [studentId])

  return (
    <>
      <PageHeader title="Sesiones del alumno" back={{ to: dash.classes, label: 'Clases' }} />
      {loading && <Loading />}
      {error && <ErrorBox message={error} />}
      {data && data.length === 0 && <Empty>Este alumno aún no tiene sesiones.</Empty>}
      {data && data.length > 0 && (
        <div className="grid gap-3">
          {data.map((s) => (
            <CardLink key={s.id} to={dash.session(s.id)}>
              <div className="flex items-center justify-between">
                <span className="text-slate-900">{fmt(s.startedAt)}</span>
                <div className="flex gap-4 text-sm text-slate-600">
                  <span><b className="text-slate-900">{s.eventCount}</b> eventos</span>
                  <span>{s.challengeIds.join(', ') || 'sin reto'}</span>
                </div>
              </div>
            </CardLink>
          ))}
        </div>
      )}
    </>
  )
}
