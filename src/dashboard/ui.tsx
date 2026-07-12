import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export function Loading() {
  return <p className="text-ink-muted py-8 text-center">Loading…</p>
}

export function ErrorBox({ message }: Readonly<{ message: string }>) {
  return (
    <div className="my-4 rounded-lg border border-danger-600/30 bg-danger-100 px-4 py-3 text-sm text-danger-700" role="alert">
      {message}
    </div>
  )
}

export function Empty({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="my-8 rounded-xl border border-dashed border-line px-6 py-10 text-center text-ink-muted">
      {children}
    </div>
  )
}

/** Page heading with an optional breadcrumb back-link. */
export function PageHeader({ title, subtitle, back }: Readonly<{ title: string; subtitle?: string; back?: { to: string; label: string } }>) {
  return (
    <div className="mb-6">
      {back && (
        <Link
          to={back.to}
          className="inline-flex items-center gap-1 text-sm text-action-600 hover:underline
            rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          {back.label}
        </Link>
      )}
      <h1 className="mt-1 text-2xl font-bold text-ink">{title}</h1>
      {subtitle && <p className="text-sm text-ink-muted">{subtitle}</p>}
    </div>
  )
}

/** A clickable card row used in the drill-down lists. */
export function CardLink({ to, children }: Readonly<{ to: string; children: ReactNode }>) {
  return (
    <Link
      to={to}
      className="block rounded-xl border border-line bg-surface px-5 py-4 shadow-sm
        hover:border-action-500/40 hover:shadow transition
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      {children}
    </Link>
  )
}
