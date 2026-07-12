import { Link } from 'react-router-dom'

/** Brick-stud divider: four studs in the block-palette colors. Decorative. */
function StudStrip() {
  return (
    <div className="flex gap-2" aria-hidden="true">
      <span className="h-3 w-3 rounded-full bg-brand-400" />
      <span className="h-3 w-3 rounded-full bg-action-500" />
      <span className="h-3 w-3 rounded-full bg-success-600" />
      <span className="h-3 w-3 rounded-full bg-danger-600" />
    </div>
  )
}

/**
 * Landing page at `/`. For now: title + a teacher login button (→ /dashboard).
 * The student simulator lives at /play; a student entry point can be added here later.
 */
export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-canvas text-ink px-4">
      <div className="flex flex-col items-center gap-6 text-center">
        <h1 className="flex items-center gap-4 text-5xl font-extrabold tracking-wide">
          <img src="/logo.png" alt="" className="h-14 w-14" />
          <span>BrickCode</span>
        </h1>
        <StudStrip />
        <p className="max-w-md text-lg text-ink-muted">
          Program a 3D LEGO robot with blocks — no hardware, right in your browser.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-4">
          <Link
            to="/play"
            className="rounded-xl bg-success-700 hover:bg-success-600 px-8 py-4 text-lg font-bold
              text-white shadow-md transition-colors min-h-11
              focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus/40"
          >
            I'm a student
          </Link>
          <Link
            to="/dashboard"
            className="rounded-xl bg-action-600 hover:bg-action-500 px-8 py-4 text-lg font-bold
              text-white shadow-md transition-colors min-h-11
              focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus/40"
          >
            Log in as a teacher
          </Link>
        </div>
      </div>
    </div>
  )
}
