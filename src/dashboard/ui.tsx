import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function Loading() {
  return <p className="text-slate-500 py-8 text-center">Cargando…</p>
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="my-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="my-8 rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center text-slate-500">
      {children}
    </div>
  )
}

/** Page heading with an optional breadcrumb back-link. */
export function PageHeader({ title, subtitle, back }: { title: string; subtitle?: string; back?: { to: string; label: string } }) {
  return (
    <div className="mb-6">
      {back && (
        <Link to={back.to} className="text-sm text-indigo-600 hover:underline">← {back.label}</Link>
      )}
      <h1 className="mt-1 text-2xl font-semibold text-slate-900">{title}</h1>
      {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
    </div>
  )
}

/** A clickable card row used in the drill-down lists. */
export function CardLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="block rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm hover:border-indigo-300 hover:shadow transition"
    >
      {children}
    </Link>
  )
}
