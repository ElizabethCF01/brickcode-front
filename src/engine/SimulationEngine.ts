import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { createScene, resizeRenderer, type SceneRefs } from './renderer/SceneSetup'
import { LegoDistanceSensor } from './components/LegoDistanceSensor'
import { BlockInterpreter, type IMotor, type SimpleRobot } from '../interpreter/BlockInterpreter'
import { useSimulationStore } from '../store/simulationStore'
import type { ChallengeEngine } from '../challenges/challenge-01'

// Single RAPIER WASM init — calling RAPIER.init() twice under React StrictMode
// creates two World instances that alias the same WASM heap, triggering the
// "recursive use / unsafe aliasing" panic. One cached promise prevents that.
let _rapierInitPromise: Promise<void> | null = null
function ensureRapierInit(): Promise<void> {
  if (!_rapierInitPromise) _rapierInitPromise = RAPIER.init()
  return _rapierInitPromise
}

// Scale: 1 WU = 10 cm — see docs/architecture.md §Scale Convention.
const DEG_TO_RAD   = Math.PI / 180
const WHEEL_RADIUS = 0.16   // WU — 2 studs; matches LegoMotor.ts

// Robot chassis dimensions
const CHASSIS_W = 0.32    // 4 studs wide
const CHASSIS_H = 0.192   // 2 bricks tall
const CHASSIS_D = 0.48    // 6 studs deep

// Sensor origin relative to chassis centre (front face, same height as centre)
const SENSOR_Z_OFFSET = -(CHASSIS_D / 2)

// Chassis sits on the floor: centre is half-height above y = 0.
const START_Y = CHASSIS_H / 2

/**
 * Minimal motor for the Sprint-3 demo: records commanded speed; no physics joint.
 * SimulationEngine reads the speeds and moves the kinematic chassis each frame.
 * Satisfies IMotor so BlockInterpreter drives it unchanged.
 */
class SimpleMotor implements IMotor {
  private _speed = 0

  setSpeed(degreesPerSecond: number): void { this._speed = degreesPerSecond }
  stop(): void { this._speed = 0 }
  getTargetSpeed(): number { return this._speed }
}

export class SimulationEngine implements ChallengeEngine {
  // ChallengeEngine surface
  readonly world: RAPIER.World
  readonly scene: THREE.Scene

  readonly robot:       SimpleRobot
  readonly interpreter: BlockInterpreter

  private readonly _refs:        SceneRefs
  private readonly _chassisBody: RAPIER.RigidBody
  private readonly _chassisMesh: THREE.Mesh
  private readonly _chassisGeo:  THREE.BoxGeometry
  private readonly _chassisMat:  THREE.MeshStandardMaterial
  private readonly _sensor:      LegoDistanceSensor
  private readonly _leftMotor:   SimpleMotor
  private readonly _rightMotor:  SimpleMotor

  // Mutable chassis world position (kinematic — not driven by physics forces)
  private _chassisPos = new THREE.Vector3(0, START_Y, 0)
  // Reusable vector to avoid per-frame allocation when updating sensor position
  private _sensorPos  = new THREE.Vector3()

  private _rafId    = 0
  private _lastTime = 0
  private _challengeDispose: (() => void) | null = null

  private constructor(
    world:       RAPIER.World,
    refs:        SceneRefs,
    chassisBody: RAPIER.RigidBody,
    chassisMesh: THREE.Mesh,
    chassisGeo:  THREE.BoxGeometry,
    chassisMat:  THREE.MeshStandardMaterial,
    sensor:      LegoDistanceSensor,
    leftMotor:   SimpleMotor,
    rightMotor:  SimpleMotor,
  ) {
    this.world        = world
    this.scene        = refs.scene
    this._refs        = refs
    this._chassisBody = chassisBody
    this._chassisMesh = chassisMesh
    this._chassisGeo  = chassisGeo
    this._chassisMat  = chassisMat
    this._sensor      = sensor
    this._leftMotor   = leftMotor
    this._rightMotor  = rightMotor

    this.robot = {
      motors:      { left: leftMotor, right: rightMotor },
      sensor,
      wheelBaseWU: 0.48,
    }
    this.interpreter = new BlockInterpreter(this.robot)
  }

  // ── Factory ────────────────────────────────────────────────────────────────

  static async create(canvas: HTMLCanvasElement): Promise<SimulationEngine> {
    await ensureRapierInit()
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })

    // Three.js scene (reuses camera/renderer/controls from SceneSetup)
    const refs = createScene(canvas)

    // ── Chassis mesh ──────────────────────────────────────────────────────────
    const chassisGeo  = new THREE.BoxGeometry(CHASSIS_W, CHASSIS_H, CHASSIS_D)
    const chassisMat  = new THREE.MeshStandardMaterial({ color: '#1565C0' })
    const chassisMesh = new THREE.Mesh(chassisGeo, chassisMat)
    chassisMesh.castShadow    = true
    chassisMesh.receiveShadow = true
    chassisMesh.position.set(0, START_Y, 0)
    refs.scene.add(chassisMesh)

    // ── Kinematic Rapier body (no collider — avoids sensor self-hit) ──────────
    // The wall collider is the only thing the sensor needs to detect.
    const chassisBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, START_Y, 0),
    )

    // ── Front distance sensor ─────────────────────────────────────────────────
    const sensor = new LegoDistanceSensor(
      {
        position:  new THREE.Vector3(0, START_Y, SENSOR_Z_OFFSET),
        direction: new THREE.Vector3(0, 0, -1),
        maxRange:  200,  // cm
      },
      refs.scene,
    )

    const leftMotor  = new SimpleMotor()
    const rightMotor = new SimpleMotor()

    return new SimulationEngine(
      world, refs,
      chassisBody, chassisMesh, chassisGeo, chassisMat,
      sensor, leftMotor, rightMotor,
    )
  }

  // ── Challenge management ───────────────────────────────────────────────────

  /** Call challenge01.setup(engine) via this method to track the teardown. */
  loadChallenge(setup: (engine: ChallengeEngine) => () => void): void {
    this._challengeDispose?.()
    this._challengeDispose = setup(this)
  }

  // ── RAF loop ───────────────────────────────────────────────────────────────

  startRAF(): void {
    this._lastTime = performance.now()
    const loop = (now: number) => {
      this._rafId = requestAnimationFrame(loop)
      const dt = Math.min((now - this._lastTime) / 1000, 0.05)  // cap at 50 ms
      this._lastTime = now
      this._tick(dt)
    }
    this._rafId = requestAnimationFrame(loop)
  }

  stopRAF(): void {
    cancelAnimationFrame(this._rafId)
  }

  // ── Robot control ──────────────────────────────────────────────────────────

  /** Move chassis back to origin and brake both motors. */
  resetRobot(): void {
    this._chassisPos.set(0, START_Y, 0)
    this._chassisBody.setNextKinematicTranslation({ x: 0, y: START_Y, z: 0 })
    this._chassisMesh.position.copy(this._chassisPos)
    this._leftMotor.stop()
    this._rightMotor.stop()
  }

  /** Notify the renderer of a canvas size change. */
  resize(width: number, height: number): void {
    resizeRenderer(this._refs, width, height)
  }

  /** Free all GPU and physics resources. */
  dispose(): void {
    this.stopRAF()
    this._challengeDispose?.()
    this._sensor.dispose()
    this._chassisGeo.dispose()
    this._chassisMat.dispose()
    this._refs.scene.remove(this._chassisMesh)
    this.world.removeRigidBody(this._chassisBody)
    this._refs.renderer.dispose()
  }

  // ── Per-frame step ─────────────────────────────────────────────────────────

  private _tick(dt: number): void {
    // 1. Compute chassis velocity from commanded motor speeds.
    //    forward (WU/s) = avg(left, right) in deg/s × deg→rad × wheel_radius
    const leftDeg   = this._leftMotor.getTargetSpeed()
    const rightDeg  = this._rightMotor.getTargetSpeed()
    const forwardWU = ((leftDeg + rightDeg) / 2) * DEG_TO_RAD * WHEEL_RADIUS

    // 2. Advance chassis position along −Z (robot faces away from camera).
    this._chassisPos.z -= forwardWU * dt
    this._chassisBody.setNextKinematicTranslation({
      x: this._chassisPos.x,
      y: this._chassisPos.y,
      z: this._chassisPos.z,
    })
    this._chassisMesh.position.copy(this._chassisPos)

    // 3. Step the Rapier world (commits kinematic translation).
    this.world.step()

    // 4. Update sensor to the current front-face position, then fire the ray.
    this._sensorPos.set(
      this._chassisPos.x,
      this._chassisPos.y,
      this._chassisPos.z + SENSOR_Z_OFFSET,
    )
    this._sensor.setWorldPosition(this._sensorPos)
    this._sensor.step(this.world)

    // 5. Push sensor reading to the UI store so SensorPanel updates.
    useSimulationStore.getState().setSensorValue('front', this._sensor.getValue())

    // 6. Render.
    this._refs.controls.update()
    this._refs.renderer.render(this._refs.scene, this._refs.camera)
  }
}
