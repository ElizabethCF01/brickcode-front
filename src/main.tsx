import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Home from './Home'

// `/` is a lightweight landing page (eager). The two heavy areas are lazy chunks:
// the student simulator (Three/Rapier/LDraw/Blockly) at /play and the teacher
// dashboard (none of that) at /dashboard. Lazy-loading keeps each off the other's
// critical path, and the dashboard is not blocked by the simulator's LDraw preload.
const SimulatorApp = lazy(() => import('./simulator/SimulatorApp'))
const Dashboard = lazy(() => import('./dashboard/Dashboard'))

function Splash() {
  return (
    <div className="w-screen h-screen flex items-center justify-center bg-gray-900 text-white">
      <div className="text-2xl font-semibold">BrickCode</div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={<Splash />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/play" element={<SimulatorApp />} />
          <Route path="/dashboard/*" element={<Dashboard />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
)
