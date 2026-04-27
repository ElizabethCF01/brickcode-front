import { useEffect, useRef } from 'react'
import { createScene, resizeRenderer, type SceneRefs } from './SceneSetup'

export default function SimulatorCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const refsRef = useRef<SceneRefs | null>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const refs = createScene(canvas)
    refsRef.current = refs

    const { scene, camera, renderer, controls } = refs

    function animate() {
      rafRef.current = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    function onResize() {
      const parent = canvas.parentElement
      if (!parent) return
      resizeRenderer(refs, parent.clientWidth, parent.clientHeight)
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(canvas.parentElement!)

    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
      renderer.dispose()
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
