import { listClasses } from '../../backend/dashboardApi'
import { useAsync } from '../useAsync'
import { dash } from '../paths'
import { Loading, ErrorBox, Empty, PageHeader, CardLink } from '../ui'

export default function ClassesPage() {
  const { loading, error, data } = useAsync(() => listClasses(), [])

  return (
    <>
      <PageHeader title="Tus clases" subtitle="Comparte el código con tus alumnos para que se unan." />
      {loading && <Loading />}
      {error && <ErrorBox message={error} />}
      {data && data.length === 0 && (
        <Empty>Aún no tienes clases. Crea una para obtener un código de clase.</Empty>
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
