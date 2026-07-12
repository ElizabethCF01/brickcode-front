import { Routes, Route } from 'react-router-dom'
import { getSupabase } from '../backend/supabaseClient'
import AuthGate from './AuthGate'
import ClassesPage from './pages/ClassesPage'
import ClassPage from './pages/ClassPage'
import StudentPage from './pages/StudentPage'
import SessionPage from './pages/SessionPage'
import DemoClassPage from './pages/DemoClassPage'

/**
 * Teacher dashboard root (mounted at /dashboard/* in main.tsx). Auth-gated; a
 * thin chrome with logout wraps the drill-down pages class → student → session.
 * All data comes from dashboardApi (RLS-scoped); no read logic lives here.
 */
export default function Dashboard() {
  return (
    <AuthGate>
      <div className="min-h-screen bg-canvas">
        <Chrome />
        <main className="mx-auto max-w-4xl px-4 py-8">
          <Routes>
            <Route index element={<ClassesPage />} />
            <Route path="demo" element={<DemoClassPage />} />
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
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-2">
        <span className="flex items-center gap-2 font-bold text-ink">
          <img src="/logo.png" alt="" className="h-6 w-6" />
          <span>BrickCode · Teacher dashboard</span>
        </span>
        <button
          onClick={() => getSupabase()?.auth.signOut()}
          className="min-h-11 px-3 rounded-lg text-sm text-ink-muted hover:text-ink hover:bg-surface-2
            transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Sign out
        </button>
      </div>
    </header>
  )
}
