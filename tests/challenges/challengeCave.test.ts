import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { SimpleRobot } from '../../src/engine/components/SimpleRobot'
import { challengeCave } from '../../src/challenges/challenge-cave'
import { useSimulationStore, HUB_MATRIX_SIZE } from '../../src/store/simulationStore'
import type { ChallengeHandle } from '../../src/challenges/types'

// Headless: no LDraw manager in Node, so placeProps no-ops and the procedural
// cave car (attachImportedVisual) rides the SimpleRobot pose API — the
// gameplay logic (timing zones, verdicts) is identical to the browser path.
// The level mirrors the real SPIKE Essential cave car: NO sensors, only lights,
// so the verdict depends purely on hub-light state vs position.

// Course geometry mirrored from challenge-cave.ts (hub-centre z positions).
const IN_DARK_A   = -10    // inside the first dark zone [-8, -13]
const IN_BAT_ZONE = -22    // inside the bat zone [-19.5, -24.5]
const IN_DARK_B   = -33    // inside the second dark zone [-31, -36]
const PAST_EXIT   = -39    // beyond EXIT_Z (-38)

const DT = 1 / 60

describe('challenge-cave', () => {
  let world: RAPIER.World
  let scene: THREE.Scene
  let sun:   THREE.DirectionalLight
  let robot: SimpleRobot
  let handle: ChallengeHandle

  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(50, 0.05, 50).setTranslation(0, -0.05, 0).setFriction(1.0),
      world.createRigidBody(RAPIER.RigidBodyDesc.fixed()),
    )
    scene = new THREE.Scene()
    // Named like SceneSetup's sun so the level's environment mutate/restore
    // path is exercised headlessly too.
    sun = new THREE.DirectionalLight(0xffffff, 1.2)
    sun.name = 'sun-light'
    scene.add(sun)

    robot = new SimpleRobot(
      { position: new THREE.Vector3(0, 0.6, 0), sensors: { distance: false, color: false } },
      world,
      scene,
    )
    const result = challengeCave.setup({ world, scene, robot })
    handle = typeof result === 'function' ? { dispose: result } : result

    useSimulationStore.getState().setHubMatrix(new Array<number>(HUB_MATRIX_SIZE).fill(0))
    useSimulationStore.getState().clearAutoStop()
  })

  afterEach(() => {
    handle.dispose()   // idempotent — some tests dispose explicitly first
    robot.dispose()
  })

  function teleport(z: number): void {
    robot.setScriptedPose({ x: 0, y: 0.6, z })
  }

  function lightOn(): void {
    useSimulationStore.getState().setHubMatrix(new Array<number>(HUB_MATRIX_SIZE).fill(100))
  }

  function lightOff(): void {
    useSimulationStore.getState().setHubMatrix(new Array<number>(HUB_MATRIX_SIZE).fill(0))
  }

  it('evaluate() before any verdict returns the fallback nudge', () => {
    const result = challengeCave.evaluate(robot)
    expect(result.success).toBe(false)
    expect(result.message).toContain('Programa')
  })

  it('crashes when the car enters a dark zone with the hub light off', () => {
    teleport(IN_DARK_A)
    handle.update!(DT)

    const result = challengeCave.evaluate(robot)
    expect(result.success).toBe(false)
    expect(result.message).toContain('roca')
    expect(useSimulationStore.getState().autoStopRequested).toBe(true)
  })

  it('fails when the light is on in the bat zone', () => {
    lightOn()
    teleport(IN_BAT_ZONE)
    handle.update!(DT)

    const result = challengeCave.evaluate(robot)
    expect(result.success).toBe(false)
    expect(result.message).toContain('murciélagos')
    expect(useSimulationStore.getState().autoStopRequested).toBe(true)
  })

  it('succeeds after the full run: lit in the dark, dark by the bats, out the far end', () => {
    lightOn()
    teleport(IN_DARK_A)
    handle.update!(DT)
    expect(challengeCave.evaluate(robot).success).toBe(false)   // no verdict yet

    lightOff()
    teleport(IN_BAT_ZONE)
    handle.update!(DT)

    lightOn()
    teleport(IN_DARK_B)
    handle.update!(DT)

    teleport(PAST_EXIT)
    handle.update!(DT)

    const result = challengeCave.evaluate(robot)
    expect(result.success).toBe(true)
    expect(useSimulationStore.getState().autoStopRequested).toBe(true)
  })

  it('mirrors the real cave car kit: no sensor kit, no Sensores UI', () => {
    expect(robot.hasSensor).toBe(false)
    expect(robot.hasColorSensor).toBe(false)
    expect(challengeCave.hiddenCategories).toEqual(['Movimiento', 'Motores'])
  })

  it('gives kid-readable timing clues because the car has no sensors', () => {
    expect(challengeCave.description).toContain('18 cm')
    expect(challengeCave.hints.join(' ')).toContain('segundos 11 a 14')
    expect(challengeCave.hints.join(' ')).toContain('segundo 17')
  })

  it('places the visible beam at the front light module connected to the hub', () => {
    const rig = scene.getObjectByName('cave-front-light-rig')
    const emitter = scene.getObjectByName('cave-front-light-emitter') as THREE.Mesh | undefined
    const beam = scene.getObjectByName('cave-front-light-beam') as THREE.SpotLight | undefined

    expect(rig).toBeDefined()
    expect(emitter).toBeDefined()
    expect(beam).toBeDefined()
    expect(beam?.position.z).toBeLessThan(emitter?.position.z ?? 0)
    expect(beam?.position.y).toBeLessThan(0.5)
    expect(beam?.position.z).toBeLessThan(-1.4)
  })

  it('script-drives straight down the tunnel without hidden motor throttle', () => {
    const leftSpeed = vi.spyOn(robot.motors.left, 'setSpeed')
    const rightSpeed = vi.spyOn(robot.motors.right, 'setSpeed')

    lightOn()
    handle.update!(1)

    const pos = robot.getPosition()
    expect(pos.x).toBeCloseTo(0, 3)
    expect(pos.z).toBeCloseTo(-1.8, 3)
    expect(leftSpeed).not.toHaveBeenCalled()
    expect(rightSpeed).not.toHaveBeenCalled()
  })

  it('reset() clears the verdict, the hub matrix and re-spawns the car', () => {
    lightOn()
    teleport(IN_BAT_ZONE)
    handle.update!(DT)
    expect(challengeCave.evaluate(robot).success).toBe(false)

    handle.reset!()

    expect(challengeCave.evaluate(robot).message).toContain('Programa')
    expect(useSimulationStore.getState().hubMatrix.every((v) => v === 0)).toBe(true)
    expect(Math.abs(robot.getPosition().z)).toBeLessThan(0.01)
  })

  it('setup dims the sun for dusk; dispose restores the shared scene', () => {
    // Mutated by setup (ran in beforeEach).
    expect(sun.intensity).toBeCloseTo(0.5)
    expect(scene.fog).not.toBeNull()

    handle.dispose()

    expect(sun.intensity).toBeCloseTo(1.2)
    expect(sun.color.getHex()).toBe(0xffffff)
    expect(scene.fog).toBeNull()
    expect(scene.background).toBeNull()
  })
})
