import { useMemo } from 'react'
import { analyzeStudent, generateSyntheticClass } from '../../analytics'
import { IndicatorMiniBars, StatusPill } from '../analyticsView'
import { dash } from '../paths'
import { PageHeader } from '../ui'

/**
 * Class-level analytics over SYNTHETIC data. The real cohort is tiny (≈2
 * students), so this view demonstrates the pipeline at classroom scale: it
 * fabricates a class of students following recognizable strategies, runs the
 * exact same analyzeStudent() used on real data, and renders the per-student
 * CT indicators + strategy label (slide 09). Clearly labelled as illustrative.
 */
export default function DemoClassPage() {
  const rows = useMemo(() => {
    return generateSyntheticClass(9).map((student) => ({
      pseudonym: student.pseudonym,
      report: analyzeStudent(student.sessions),
    }))
  }, [])

  return (
    <>
      <PageHeader
        title="Class analytics — computational thinking"
        subtitle="Synthetic demonstration data · the same pipeline runs on real student sessions."
        back={{ to: dash.classes, label: 'Classes' }}
      />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-400">
          <span className="w-40">Student</span>
          <span className="flex-1">CT indicators</span>
          <span className="w-28 text-right">Strategy</span>
        </div>
        {rows.map(({ pseudonym, report }) => (
          <div key={pseudonym} className="flex items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-b-0">
            <span className="w-40 text-sm font-medium text-slate-900">{pseudonym}</span>
            <div className="flex-1">
              <IndicatorMiniBars indicators={report.indicators} />
            </div>
            <div className="flex w-28 justify-end">
              <StatusPill status={report.status} />
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-slate-400">
        Bars, left→right: abstraction · decomposition · loops · conditionals · iterative debugging.
        Strategy is derived from the programming trajectory (tree edit distance across runs).
      </p>
    </>
  )
}
