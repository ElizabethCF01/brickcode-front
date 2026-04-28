import { useEffect, useRef } from 'react'
import { SimulationEngine } from '../SimulationEngine'
import { setEngine } from '../engineSingleton'
import { challenge01 } from '../../challenges/challenge-01'

export default function SimulatorCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let disposed = false
    let engine: SimulationEngine | undefined

    SimulationEngine.create(canvas).then(e => {
      // Guard against React StrictMode double-mount cleanup running before resolve.
      if (disposed) { e.dispose(); return }

      engine = e
      engine.loadChallenge(challenge01.setup.bind(challenge01))
      engine.startRAF()
      setEngine(engine)
    })

    const ro = new ResizeObserver(() => {
      const parent = canvas.parentElement
      if (engine && parent) {
        engine.resize(parent.clientWidth, parent.clientHeight)
      }
    })
    ro.observe(canvas.parentElement!)

    return () => {
      disposed = true
      ro.disconnect()
      setEngine(null)
      engine?.dispose()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block"
      style={{ display: 'block' }}
    />
  )
}
