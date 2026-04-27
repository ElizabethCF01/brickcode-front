import { describe, it, expect, vi, beforeAll } from 'vitest'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { Baseplate } from '../../src/engine/components/Baseplate'
import { LegoBrick } from '../../src/engine/components/LegoBrick'

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

describe('Baseplate', () => {
  beforeAll(async () => {
    await RAPIER.init()
  })

  it('adds exactly 1 mesh to the scene on construction', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    const scene = new THREE.Scene()

    const baseplate = new Baseplate(world, scene)

    expect(scene.children).toHaveLength(1)
    baseplate.dispose()
  })

  it('creates a single fixed rigid body', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    const scene = new THREE.Scene()

    const baseplate = new Baseplate(world, scene)

    expect(world.bodies.len()).toBe(1)
    // A fixed body must not be dynamic
    const body = world.bodies.get(0)
    expect(body?.isFixed()).toBe(true)

    baseplate.dispose()
  })

  it('dispose removes mesh and rigid body', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    const scene = new THREE.Scene()

    const baseplate = new Baseplate(world, scene)
    baseplate.dispose()

    expect(scene.children).toHaveLength(0)
    expect(world.bodies.len()).toBe(0)
  })

  it('LegoBricks dropped onto the baseplate come to rest on the surface (acceptance)', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    const scene = new THREE.Scene()

    // Baseplate is the only ground — no manual ground collider needed
    const baseplate = new Baseplate(world, scene)

    const BODY_H = 0.096   // brick body height from LegoBrick constants

    // 5 bricks spread horizontally so they don't overlap at start
    const bricks = Array.from({ length: 5 }, (_, i) =>
      new LegoBrick(
        {
          width: 2,
          depth: 4,
          color: '#FF0000',
          position: new THREE.Vector3(i * 0.2 - 0.4, 0.5 + i * 0.1, 0),
        },
        world,
        scene,
      ),
    )

    // ~3 s at 60 Hz — enough for all bricks to settle under gravity
    for (let step = 0; step < 180; step++) world.step()
    bricks.forEach(b => b.syncRender())

    for (const brick of bricks) {
      const body = (brick as unknown as { body: RAPIER.RigidBody }).body
      const y = body.translation().y
      // Bricks rest with their centre at y ≈ BODY_H/2 above the y=0 surface
      expect(y).toBeGreaterThan(-0.01)
      expect(y).toBeLessThan(BODY_H + 0.05)
    }

    bricks.forEach(b => b.dispose())
    baseplate.dispose()
  })
})
