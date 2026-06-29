import { useEffect, useState } from 'react'
import App from '../App'
import LoadingScreen from '../components/LoadingScreen'
import StudentAuthGate from './StudentAuthGate'
import EnrollmentGate from './EnrollmentGate'
import { registerRobotBlocks } from '../blocks/definitions/robotBlocks'
import { LDrawLibraryManager, BRICKCODE_PARTS } from '../engine/ldraw/LDrawLibraryManager'
import { setLDrawManager } from '../engine/ldraw/ldrawSingleton'

// Blockly block definitions are only needed by the simulator route — registering
// them here (not at app entry) keeps blockly out of the dashboard bundle.
registerRobotBlocks()

const TOTAL_PARTS = Object.keys(BRICKCODE_PARTS).length

/**
 * Simulator route (`/play`). Login is mandatory: gate behind a student session
 * and class enrollment, THEN preload LDraw + mount the 3D simulator. Lazy-loaded
 * from main.tsx so Three/Rapier/LDraw/Blockly load only here.
 */
export default function SimulatorApp() {
  return (
    <StudentAuthGate>
      <EnrollmentGate>
        <SimulatorReady />
      </EnrollmentGate>
    </StudentAuthGate>
  )
}

function SimulatorReady() {
  const [loaded, setLoaded] = useState(0)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const manager = new LDrawLibraryManager()

    manager
      .preloadAll((n) => {
        if (!cancelled) setLoaded(n)
      })
      .then(() => {
        if (cancelled) {
          manager.dispose()
          return
        }
        setLDrawManager(manager)
        setReady(true)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (!ready) return <LoadingScreen loaded={loaded} total={TOTAL_PARTS} error={error} />
  return <App />
}
