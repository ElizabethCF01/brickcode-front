import { CircleAlert } from 'lucide-react'

interface LoadingScreenProps {
  loaded: number
  total: number
  error?: string | null
}

export default function LoadingScreen({ loaded, total, error }: Readonly<LoadingScreenProps>) {
  const pct = total === 0 ? 0 : Math.round((loaded / total) * 100)

  return (
    <div className="w-screen h-screen flex items-center justify-center bg-canvas text-ink">
      <div className="w-80 flex flex-col items-center gap-4">
        <div className="flex items-center gap-3 text-2xl font-extrabold tracking-wide">
          <img src="/logo.png" alt="" className="h-9 w-9" />
          <span>BrickCode</span>
        </div>

        {error ? (
          <>
            <div className="flex items-center gap-2 text-danger-600 text-sm text-center" role="alert">
              <CircleAlert size={16} aria-hidden="true" />
              Could not load the LEGO parts.
            </div>
            <div className="text-ink-muted text-xs text-center break-all">{error}</div>
          </>
        ) : (
          <>
            <div className="text-sm text-ink-muted">Loading the level's parts…</div>

            <div className="w-full h-2.5 bg-line rounded-full overflow-hidden" aria-hidden="true">
              <div
                className="h-full bg-brand-400 transition-[width] duration-150"
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="text-xs text-ink-muted" aria-live="polite">
              {loaded} / {total} ({pct}%)
            </div>
          </>
        )}
      </div>
    </div>
  )
}
