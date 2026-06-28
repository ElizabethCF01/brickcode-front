import { Routes, Route } from 'react-router-dom'
import { getSupabase } from '../backend/supabaseClient'
import AuthGate from './AuthGate'
import ClassesPage from './pages/ClassesPage'
import ClassPage from './pages/ClassPage'
import StudentPage from './pages/StudentPage'
import SessionPage from './pages/SessionPage'

/**
 * Teacher dashboard root (mounted at /dashboard/* in main.tsx). Auth-gated; a
 * thin chrome with logout wraps the drill-down pages class → student → session.
 * All data comes from dashboardApi (RLS-scoped); no read logic lives here.
 */
export default function Dashboard() {
  return (
    <AuthGate>
      <div className="min-h-screen bg-slate-100">
        <Chrome />
        <main className="mx-auto max-w-4xl px-4 py-8">
          <Routes>
            <Route index element={<ClassesPage />} />
            <Route path="classes/:classId" element={<ClassPage />} />
            <Route path="students/:studentId" element={<StudentPage />} />
            <Route path="sessions/:sessionId" element={<SessionPage />} />
          </Routes>
        </main>
      </div>
    </AuthGate>
  )
}

function Chrome() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <span className="flex items-center gap-2 font-semibold text-slate-900">
          <img src="/logo.png" alt="" className="h-6 w-6" />
          <span>BrickCode · Panel del profesor</span>
        </span>
        <button
          onClick={() => getSupabase()?.auth.signOut()}
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          Cerrar sesión
        </button>
      </div>
    </header>
  )
}
