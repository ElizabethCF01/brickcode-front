import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import LoadingScreen from './components/LoadingScreen'
import { registerRobotBlocks } from './blocks/definitions/robotBlocks'
import { LDrawLibraryManager, BRICKCODE_PARTS } from './engine/ldraw/LDrawLibraryManager'
import { setLDrawManager } from './engine/ldraw/ldrawSingleton'

registerRobotBlocks()

const TOTAL_PARTS = Object.keys(BRICKCODE_PARTS).length

function Bootstrap() {
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Bootstrap />
  </StrictMode>,
)
