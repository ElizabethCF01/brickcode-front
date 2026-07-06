import { describe, it, expect, beforeAll } from 'vitest'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { SimpleRobot } from '../../src/engine/components/SimpleRobot'

// Regression for the "floating cave car": attachImportedVisual used to ASSIGN
// group.position.y from the bbox, which is only correct when the group arrives
// at position 0. loadDecorModel output arrives pre-positioned (it centres
// itself), so the car ended up hovering by its prior offset. The fix applies a
// delta on all three axes.

describe('SimpleRobot.attachImportedVisual', () => {
  beforeAll(async () => {
    await RAPIER.init()
  })

  it('rests a pre-positioned group on the floor (bottom at world y = 0)', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    const scene = new THREE.Scene()
    const robot = new SimpleRobot(
      { position: new THREE.Vector3(0, 0.6, 0) },
      world,
      scene,
    )

    // Simulate a loadDecorModel-style group: child geometry away from the
    // origin AND a non-zero group position (the regression trigger).
    const group = new THREE.Group()
    const geo = new THREE.BoxGeometry(1, 1, 1)
    const mat = new THREE.MeshStandardMaterial()
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(0, 5, 0)
    group.add(mesh)
    group.position.y = 3

    robot.attachImportedVisual(group)

    // The group is now parented to the hub group (world y = 0.6 at spawn).
    scene.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(group)
    expect(box.min.y).toBeCloseTo(0, 3)

    geo.dispose()
    mat.dispose()
    robot.dispose()
  })
})
