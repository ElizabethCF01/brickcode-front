import { useParams } from 'react-router-dom'
import { listClasses, getClassEventStats } from '../../backend/dashboardApi'
import { useAsync } from '../useAsync'
import { dash } from '../paths'
import { Loading, ErrorBox, Empty, PageHeader, CardLink } from '../ui'

export default function ClassPage() {
  const { classId = '' } = useParams()
  const { loading, error, data } = useAsync(
    async () => {
      const [classes, stats] = await Promise.all([listClasses(), getClassEventStats(classId)])
      return { cls: classes.find((c) => c.id === classId) ?? null, stats }
    },
    [classId],
  )

  return (
    <>
      <PageHeader
        title={data?.cls?.name ?? 'Clase'}
        subtitle={data?.cls ? `Código: ${data.cls.classCode}` : undefined}
        back={{ to: dash.classes, label: 'Clases' }}
      />
      {loading && <Loading />}
      {error && <ErrorBox message={error} />}
      {data && data.stats.length === 0 && <Empty>Ningún alumno se ha unido todavía.</Empty>}
      {data && data.stats.length > 0 && (
        <div className="grid gap-3">
          {data.stats.map((s) => {
            const topBlocks = Object.entries(s.blockFrequency).sort((a, b) => b[1] - a[1]).slice(0, 3)
            return (
              <CardLink key={s.studentId} to={dash.student(s.studentId)}>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-900">{s.pseudonym}</span>
                  <div className="flex gap-4 text-sm text-slate-600">
                    <span><b className="text-slate-900">{s.runCount}</b> ejecuciones</span>
                    <span className={s.failureCount > 0 ? 'text-amber-600' : ''}>
                      <b>{s.failureCount}</b> fallos
                    </span>
                  </div>
                </div>
                {topBlocks.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {topBlocks.map(([block, n]) => (
                      <span key={block} className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
                        {block} ×{n}
                      </span>
                    ))}
                  </div>
                )}
              </CardLink>
            )
          })}
        </div>
      )}
    </>
  )
}
