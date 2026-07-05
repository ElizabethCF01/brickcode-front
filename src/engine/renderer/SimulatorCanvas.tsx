import { useEffect, useRef } from 'react'
import { SimulationEngine } from '../SimulationEngine'
import { setEngine } from '../engineSingleton'
import { useChallengeStore } from '../../store/challengeStore'
import { useSimulationStore } from '../../store/simulationStore'

export default function SimulatorCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let disposed = false
    let engine: SimulationEngine | undefined

    // App only mounts once a level is active, so activeLevel is set here. The
    // level's robot hint decides which robot the engine builds (sensor levels
    // request the procedural SimpleRobot).
    const level = useChallengeStore.getState().activeLevel

    SimulationEngine.create(canvas, level?.robot ?? 'imported', level?.sensors).then(e => {
      // Guard against React StrictMode double-mount cleanup running before resolve.
      if (disposed) { e.dispose(); return }

      engine = e
      if (level) engine.loadChallenge(level.setup.bind(level))
      engine.startRAF()
      setEngine(engine)
      // Tell the UI which sensors this robot carries so sensor-only panels and
      // toolbox blocks can hide themselves for robots without them.
      useSimulationStore.getState().setHasSensor(engine.robot.hasSensor ?? false)
      useSimulationStore.getState().setHasColorSensor(engine.robot.hasColorSensor ?? false)
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
