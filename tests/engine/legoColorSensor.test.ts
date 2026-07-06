import { describe, it, expect, beforeAll } from 'vitest'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { LegoColorSensor } from '../../src/engine/components/LegoColorSensor'
import {
  registerColliderColor,
  unregisterColliderColor,
} from '../../src/engine/colorRegistry'

// Headless: LegoColorSensor is pure physics + state (no Three.js resources),
// so no WebGL mock is needed.

function makeSensor(maxRange = 50) {
  return new LegoColorSensor({
    position:  new THREE.Vector3(0, 0.4, 0),
    direction: new THREE.Vector3(0, 0, -1),
    maxRange,
  })
}

/**
 * Static 1×1×1-ish box centred at `z` on the sensor ray (y = 0.4).
 * Steps the world once afterwards: Rapier only includes new colliders in scene
 * queries (castRay) after a step — mirroring the engine, where sensors step
 * right after `world.step()`.
 */
function addBox(world: RAPIER.World, z: number): RAPIER.Collider {
  const collider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5).setTranslation(0, 0.4, z),
  )
  world.step()
  return collider
}

describe('LegoColorSensor', () => {
  beforeAll(async () => {
    await RAPIER.init()
  })

  it('reports the registered colour of the collider in front', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    const collider = addBox(world, -2)              // 20 cm ahead, within 50 cm range
    registerColliderColor(collider.handle, 'GREEN')

    const sensor = makeSensor()
    sensor.step(world)

    expect(sensor.getColor()).toBe('GREEN')
    expect(sensor.sees('GREEN')).toBe(true)
    expect(sensor.sees('RED')).toBe(false)

    unregisterColliderColor(collider.handle)
  })

  it('reports null for unregistered colliders and out-of-range objects', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })

    // Unregistered collider in range → hit, but no colour known.
    const plain = addBox(world, -2)
    const sensor = makeSensor()
    sensor.step(world)
    expect(sensor.getColor()).toBeNull()
    expect(sensor.sees('GREEN')).toBe(false)
    world.removeCollider(plain, false)
    world.step()

    // Registered collider beyond maxRange (50 cm = 5 WU) → no hit.
    const far = addBox(world, -8)                   // 80 cm ahead
    registerColliderColor(far.handle, 'RED')
    sensor.step(world)
    expect(sensor.getColor()).toBeNull()
    unregisterColliderColor(far.handle)
  })

  it('detects Rapier sensor colliders (drive-through colour markers)', () => {
    // Pins an engine capability for future levels: `setSensor(true)` colliders
    // produce no contact forces (a robot drives through) but castRay still hits
    // them because Rapier excludes sensors only via the opt-in
    // QueryFilterFlags.EXCLUDE_SENSORS, which LegoColorSensor never passes.
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    const curtain = world.createCollider(
      RAPIER.ColliderDesc.cuboid(2.5, 1, 0.05).setTranslation(0, 1, -2).setSensor(true),
    )
    world.step()
    registerColliderColor(curtain.handle, 'BLACK')

    const sensor = makeSensor()
    sensor.step(world)

    expect(curtain.isSensor()).toBe(true)
    expect(sensor.getColor()).toBe('BLACK')

    unregisterColliderColor(curtain.handle)
  })

  it('tracks a moving origin via setWorldPosition', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    const collider = addBox(world, -10)             // 100 cm from origin — out of range
    registerColliderColor(collider.handle, 'BLUE')

    const sensor = makeSensor()
    sensor.step(world)
    expect(sensor.getColor()).toBeNull()

    // Move the sensor to 30 cm from the box — now in range.
    sensor.setWorldPosition(new THREE.Vector3(0, 0.4, -7))
    sensor.step(world)
    expect(sensor.getColor()).toBe('BLUE')

    unregisterColliderColor(collider.handle)
  })
})
