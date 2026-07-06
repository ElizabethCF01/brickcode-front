import { useEffect, useState, type ReactNode } from 'react'
import App from '../App'
import LevelSelect from '../components/LevelSelect'
import LoadingScreen from '../components/LoadingScreen'
import StudentAuthGate from './StudentAuthGate'
import EnrollmentGate from './EnrollmentGate'
import { registerRobotBlocks } from '../blocks/definitions/robotBlocks'
import { LDrawLibraryManager } from '../engine/ldraw/LDrawLibraryManager'
import { getLDrawManager, setLDrawManager } from '../engine/ldraw/ldrawSingleton'
import { useChallengeStore } from '../store/challengeStore'
import { levelAssets } from '../challenges/levelAssets'
import type { LevelDefinition } from '../challenges/types'

// Blockly block definitions are only needed by the simulator route — registering
// them here (not at app entry) keeps blockly out of the dashboard bundle.
registerRobotBlocks()

/**
 * Simulator route (`/play`). Login is mandatory: gate behind a student session
 * and class enrollment, then show the level grid immediately — LDraw assets are
 * loaded per level, when one is picked (see LevelAssetsGate). Lazy-loaded from
 * main.tsx so Three/Rapier/LDraw/Blockly load only here.
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
  const activeLevel = useChallengeStore((s) => s.activeLevel)

  // The student picks a level; selecting one stores it, loads that level's
  // assets, and mounts the simulator. "Back to levels" clears it, remounting
  // App fresh for the next pick (engine + scene are rebuilt per App mount in
  // SimulatorCanvas).
  if (!activeLevel) {
    return <LevelSelect onSelect={(level) => useChallengeStore.getState().setActiveLevel(level)} />
  }
  return (
    <LevelAssetsGate key={activeLevel.id} level={activeLevel}>
      <App onBackToLevels={() => useChallengeStore.getState().setActiveLevel(null)} />
    </LevelAssetsGate>
  )
}

/**
 * Loads exactly what `level` uses — its robot's catalog parts plus the packed
 * models it fetches (`levelAssets`) — showing a progress bar that reflects the
 * real per-level asset count instead of the old fixed 11-part preload. The
 * LDraw manager is shared across levels, so parts already cached by a previous
 * level complete instantly; models are warmed into the browser's HTTP cache.
 */
function LevelAssetsGate({ level, children }: { level: LevelDefinition; children: ReactNode }) {
  const [progress, setProgress] = useState({ loaded: 0, total: 1 })
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const shared = getLDrawManager()
    const manager = shared ?? new LDrawLibraryManager()
    const { parts, models } = levelAssets(level)
    const total = parts.length + models.length
    let done = 0
    setProgress({ loaded: 0, total })
    const bump = () => {
      done += 1
      if (!cancelled) setProgress({ loaded: done, total })
    }

    Promise.all([
      manager.preloadParts(parts, bump),
      ...models.map((url) =>
        fetch(url).then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`)
          return res.arrayBuffer().then(bump)
        }),
      ),
    ])
      .then(() => {
        if (cancelled) {
          // StrictMode double-mount: drop a manager that never became shared.
          if (!shared) manager.dispose()
          return
        }
        if (!shared) setLDrawManager(manager)
        setReady(true)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      })

    return () => {
      cancelled = true
    }
  }, [level])

  if (!ready) return <LoadingScreen loaded={progress.loaded} total={progress.total} error={error} />
  return <>{children}</>
}
