import { describe, it, expect, vi } from 'vitest'

// Three.js and OrbitControls depend on WebGL; mock them for headless tests
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three')
  return {
    ...actual,
    WebGLRenderer: vi.fn().mockImplementation(() => ({
      setSize: vi.fn(),
      setPixelRatio: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
      shadowMap: { enabled: false, type: 0 },
    })),
  }
})

vi.mock('three/examples/jsm/controls/OrbitControls.js', () => ({
  OrbitControls: vi.fn().mockImplementation(() => ({
    enableDamping: false,
    dampingFactor: 0,
    minDistance: 0,
    maxDistance: 0,
    maxPolarAngle: 0,
    target: { set: vi.fn() },
    update: vi.fn(),
  })),
}))

describe('createScene', () => {
  it('returns scene, camera, renderer and controls', async () => {
    const { createScene } = await import('../../src/engine/renderer/SceneSetup')
    const canvas = document.createElement('canvas')
    // jsdom needs explicit dimensions
    Object.defineProperty(canvas, 'clientWidth', { value: 800, configurable: true })
    Object.defineProperty(canvas, 'clientHeight', { value: 600, configurable: true })
    const refs = createScene(canvas)
    expect(refs.scene).toBeDefined()
    expect(refs.camera).toBeDefined()
    expect(refs.renderer).toBeDefined()
    expect(refs.controls).toBeDefined()
  })
})
