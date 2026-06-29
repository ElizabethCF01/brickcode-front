import { Link } from 'react-router-dom'

/**
 * Landing page at `/`. For now: title + a teacher login button (→ /dashboard).
 * The student simulator lives at /play; a student entry point can be added here later.
 */
export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white px-4">
      <div className="flex flex-col items-center gap-6 text-center">
        <h1 className="flex items-center gap-3 text-5xl font-bold tracking-wide text-yellow-400">
          <img src="/logo.png" alt="" className="h-14 w-14" />
          <span>BrickCode</span>
        </h1>
        <p className="max-w-md text-gray-400">
          Programa un robot LEGO en 3D con bloques — sin hardware, directamente en el navegador.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/play"
            className="rounded-lg bg-green-600 hover:bg-green-500 px-6 py-3 font-medium transition-colors"
          >
            Soy alumno
          </Link>
          <Link
            to="/dashboard"
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-6 py-3 font-medium transition-colors"
          >
            Entrar como profesor
          </Link>
        </div>
      </div>
    </div>
  )
}
