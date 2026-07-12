// Presentational components for the learning-analytics layer (slide 09):
// the CT-indicator bars, the strategy status pill, the programming-trajectory
// strip, and a compact per-student row for the class view. Pure rendering —
// all computation lives in src/analytics.

import { Check } from 'lucide-react'
import type { CtIndicators, StudentReport, StudentStatus, TrajectoryStep } from '../analytics/types'

const STATUS_META: Record<StudentStatus, { label: string; text: string; bg: string; dot: string }> = {
  decomposing: { label: 'decomposing', text: 'text-emerald-700', bg: 'bg-emerald-50', dot: 'bg-success-600' },
  guessing: { label: 'guessing', text: 'text-amber-700', bg: 'bg-amber-50', dot: 'bg-amber-500' },
  stuck: { label: 'stuck', text: 'text-rose-700', bg: 'bg-rose-50', dot: 'bg-rose-500' },
  'no-data': { label: 'no data', text: 'text-ink-muted', bg: 'bg-surface-2', dot: 'bg-ink-muted' },
}

export function StatusPill({ status }: { status: StudentStatus }) {
  const m = STATUS_META[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${m.bg} ${m.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  )
}

const INDICATORS: { key: keyof CtIndicators; label: string }[] = [
  { key: 'abstraction', label: 'Abstraction' },
  { key: 'decomposition', label: 'Decomposition' },
  { key: 'loops', label: 'Loops' },
  { key: 'conditionals', label: 'Conditionals' },
  { key: 'debugging', label: 'Iterative debugging' },
]

export function IndicatorBars({ indicators }: { indicators: CtIndicators }) {
  return (
    <div className="grid gap-2">
      {INDICATORS.map(({ key, label }) => (
        <div key={key} className="flex items-center gap-3">
          <span className="w-36 shrink-0 text-sm text-ink-muted">{label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-action-500"
              style={{ width: `${Math.round(indicators[key] * 100)}%` }}
            />
          </div>
          <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-ink-muted">
            {Math.round(indicators[key] * 100)}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Compact bars (no labels) for the class table row. */
export function IndicatorMiniBars({ indicators }: { indicators: CtIndicators }) {
  return (
    <div className="flex items-center gap-1">
      {INDICATORS.map(({ key, label }) => (
        <div key={key} title={`${label}: ${Math.round(indicators[key] * 100)}`} className="flex h-6 w-2.5 items-end overflow-hidden rounded-sm bg-surface-2">
          <div className="w-full rounded-sm bg-action-500" style={{ height: `${Math.round(indicators[key] * 100)}%` }} />
        </div>
      ))}
    </div>
  )
}

export function TrajectoryStrip({ trajectory }: { trajectory: TrajectoryStep[] }) {
  if (trajectory.length === 0) return <p className="text-sm text-ink-muted">No runs yet.</p>
  const maxEdit = Math.max(1, ...trajectory.map((s) => s.editDistance))
  return (
    <div className="flex items-end gap-2">
      {trajectory.map((step) => {
        // Baseline (run 1) has distance 0 — show a small stub so it's visible.
        const pct = step.editDistance === 0 ? 8 : Math.round((step.editDistance / maxEdit) * 100)
        return (
          <div key={step.run} className="flex w-8 flex-col items-center gap-1">
            <span className="font-mono text-[10px] tabular-nums text-ink-muted">{step.editDistance}</span>
            <div className="flex h-16 w-full items-end">
              <div
                className={`w-full rounded-t ${step.success ? 'bg-success-600' : 'bg-action-500/40'}`}
                style={{ height: `${pct}%` }}
                title={`Run ${step.run}: edit distance ${step.editDistance}${step.success ? ' · solved' : ''}`}
              />
            </div>
            <span className="inline-flex items-center gap-0.5 font-mono text-[10px] text-ink-muted">
              {step.run}
              {step.success && <Check size={10} className="text-success-600" aria-hidden="true" />}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Full per-student analytics panel shown on the student page. */
export function StudentReportPanel({ report, pseudonym }: { report: StudentReport; pseudonym?: string }) {
  return (
    <section className="mb-6 rounded-xl border border-line bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Computational thinking{pseudonym ? ` · ${pseudonym}` : ''}
        </h2>
        <StatusPill status={report.status} />
      </div>

      {report.status === 'no-data' ? (
        <p className="text-sm text-ink-muted">
          No program snapshots captured yet — indicators appear once this student runs a program.
        </p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <IndicatorBars indicators={report.indicators} />
          </div>
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                Programming trajectory
              </h3>
              <span className="text-xs text-ink-muted">
                {report.successCount}/{report.runCount} runs solved · bar = change vs. previous run
              </span>
            </div>
            <TrajectoryStrip trajectory={report.trajectory} />
          </div>
        </div>
      )}
    </section>
  )
}
