import { describe, it, expect, vi, beforeAll } from 'vitest'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { LegoBrick } from '../../src/engine/components/LegoBrick'

// WebGL is unavailable in Node — mock only the renderer, keep everything else real
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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeWorld() {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  // Flat ground: half-extents (10, 0.05, 10), top surface at y = 0
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(10, 0.05, 10).setTranslation(0, -0.05, 0),
  )
  return world
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('LegoBrick', () => {
  beforeAll(async () => {
    await RAPIER.init()
  })

  it('adds exactly 1 group to the scene on construction', () => {
    const world = makeWorld()
    const scene = new THREE.Scene()

    const brick = new LegoBrick(
      { width: 2, depth: 4, color: '#FF0000', position: new THREE.Vector3(0, 1, 0) },
      world,
      scene,
    )

    expect(scene.children).toHaveLength(1)
    brick.dispose()
  })

  it('group contains 1 body mesh + width×depth stud meshes', () => {
    const world = makeWorld()
    const scene = new THREE.Scene()
    const width = 2
    const depth = 4

    const brick = new LegoBrick(
      { width, depth, color: '#FF0000', position: new THREE.Vector3(0, 1, 0) },
      world,
      scene,
    )

    const group = scene.children[0] as THREE.Group
    expect(group.children).toHaveLength(1 + width * depth) // 1 box + 8 studs

    brick.dispose()
  })

  it('syncRender moves the Three.js group to match physics body', () => {
    const world = makeWorld()
    const scene = new THREE.Scene()

    const brick = new LegoBrick(
      { width: 2, depth: 2, color: '#0000FF', position: new THREE.Vector3(0, 1, 0) },
      world,
      scene,
    )

    world.step() // one physics tick (~1/60 s)
    brick.syncRender()

    const group = scene.children[0] as THREE.Group
    // After one gravity step the brick must have fallen slightly below y = 1
    expect(group.position.y).toBeLessThan(1)

    brick.dispose()
  })

  it('dispose removes the group from scene and body from world', () => {
    const world = makeWorld()
    const scene = new THREE.Scene()

    const brick = new LegoBrick(
      { width: 2, depth: 2, color: '#00FF00', position: new THREE.Vector3(0, 2, 0) },
      world,
      scene,
    )

    const bodyCountBefore = world.bodies.len()
    brick.dispose()

    expect(scene.children).toHaveLength(0)
    expect(world.bodies.len()).toBe(bodyCountBefore - 1)
  })

  it('5 bricks at different heights fall and rest on the ground (acceptance)', () => {
    const world = makeWorld()
    const scene = new THREE.Scene()

    // Spread bricks horizontally so they don't start overlapping
    const bricks = Array.from({ length: 5 }, (_, i) =>
      new LegoBrick(
        {
          width: 2,
          depth: 4,
          color: '#FF0000',
          position: new THREE.Vector3(i * 0.5 - 1, 0.2 + i * 0.15, 0),
        },
        world,
        scene,
      ),
    )

    // Simulate ~3 s at 60 Hz — enough for all bricks to settle
    for (let step = 0; step < 180; step++) world.step()
    bricks.forEach((b) => b.syncRender())

    for (const brick of bricks) {
      const body = (brick as unknown as { body: RAPIER.RigidBody }).body
      const y = body.translation().y
      // Bricks must rest above the ground surface (y = 0) with a small tolerance
      expect(y).toBeGreaterThan(-0.01)
    }

    bricks.forEach((b) => b.dispose())
  })
})
