import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { createScene, resizeRenderer, type SceneRefs } from './renderer/SceneSetup'
import { SimpleRobot } from './components/SimpleRobot'
import { DynamicRobot } from './components/DynamicRobot'
import { getLDrawManager } from './ldraw/ldrawSingleton'
import { parseLDraw } from './ldraw/ldrParser'
import { buildRobotDescription } from './ldraw/buildRobotDescription'
import type { SimpleRobot as ISimpleRobot } from '../interpreter/BlockInterpreter'

/**
 * Runtime robot shape — superset of ISimpleRobot adding lifecycle methods.
 * Both `SimpleRobot` (procedural) and `DynamicRobot` (LDraw-derived) implement it.
 */
type RuntimeRobot = ISimpleRobot & {
  step(dt: number): void
  reset(): void
  dispose(): void
  sensor: ISimpleRobot['sensor'] & { step?(world: RAPIER.World): void }
}
import { BlockInterpreter } from '../interpreter/BlockInterpreter'
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

export class SimulationEngine implements ChallengeEngine {
  // ChallengeEngine surface
  readonly world: RAPIER.World
  readonly scene: THREE.Scene

  readonly robot:       RuntimeRobot
  readonly interpreter: BlockInterpreter

  private readonly _refs: SceneRefs

  private _rafId    = 0
  private _lastTime = 0
  private _challengeDispose: (() => void) | null = null

  // Physics-step accumulator. world.step() advances simulation by a fixed
  // PHYSICS_DT regardless of how often rAF fires; we accumulate real elapsed
  // time and run as many fixed steps as needed to keep simulated time aligned
  // with wall-clock time. Without this, on a 120 Hz display the simulator
  // runs at 2× speed (rAF fires twice per physics step's worth of real time).
  private _physicsAccumulator = 0
  private static readonly PHYSICS_DT      = 1 / 60  // seconds — Rapier default
  private static readonly MAX_FRAME_DT    = 0.25    // cap when tab regains focus

  private constructor(world: RAPIER.World, refs: SceneRefs, robot: RuntimeRobot) {
    this.world       = world
    this.scene       = refs.scene
    this._refs       = refs
    this.robot       = robot
    this.interpreter = new BlockInterpreter(this.robot)
  }

  // ── Factory ────────────────────────────────────────────────────────────────

  static async create(canvas: HTMLCanvasElement): Promise<SimulationEngine> {
    await ensureRapierInit()
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })

    // Solver iterations — defaults are 4 / 1, which leaves visible residual
    // motion in the chassis-with-revolute-joint configuration (≈ 2 mm vertical
    // bounce, slow lateral drift). 8 / 2 converges contact + joint constraints
    // tightly enough that the robot truly rests when stopped, at modest CPU cost.
    world.integrationParameters.numSolverIterations = 8
    world.integrationParameters.numInternalPgsIterations = 2

    // Static ground plane so the robot's wheels have something to push against.
    // (The decorative floor mesh is added by createScene; this is the collider.)
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(50, 0.05, 50)
        .setTranslation(0, -0.05, 0)
        .setFriction(1.0),
      world.createRigidBody(RAPIER.RigidBodyDesc.fixed()),
    )

    const refs = createScene(canvas)

    const ldraw = getLDrawManager() ?? undefined
    const initialPosition = new THREE.Vector3(0, 0.6, 0)

    // Try to build a DynamicRobot from an imported `.ldr` (level 3). On any
    // error fall back to the procedural `SimpleRobot` so the demo still runs.
    //
    // Env vars (.env.local):
    //   VITE_IMPORTED_ROBOT_SOURCE  — public URL of the source .ldr (parsed for roles + positions)
    //   VITE_IMPORTED_ROBOT_MODEL   — public URL of the packed .mpd (loaded for geometry)
    //                                  If only ROBOT_MODEL is set and points at /packed/<x>.mpd,
    //                                  we derive ROBOT_SOURCE as /source/<x>.ldr.
    //   VITE_IMPORTED_ROBOT_FLIP    — "true" to apply a 180° X-flip (Studio Y-down workaround)
    let robot: RuntimeRobot | null = null
    const packedUrl = import.meta.env.VITE_IMPORTED_ROBOT_MODEL as string | undefined
    if (packedUrl && ldraw) {
      const sourceUrl = (import.meta.env.VITE_IMPORTED_ROBOT_SOURCE as string | undefined)
        ?? packedUrl.replace('/packed/', '/source/').replace(/\.mpd$/i, '.ldr')
      const flip = String(import.meta.env.VITE_IMPORTED_ROBOT_FLIP ?? '').toLowerCase() === 'true'
      try {
        const [sourceText, loadedModel] = await Promise.all([
          fetch(sourceUrl).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${sourceUrl}`)
            return r.text()
          }),
          ldraw.loadModel(packedUrl),
        ])
        const parts = parseLDraw(sourceText)
        const description = buildRobotDescription(parts)
        robot = new DynamicRobot(
          {
            description,
            parts,
            loadedModel,
            ldraw,
            position: initialPosition,
            flipUpsideDown: flip,
          },
          world,
          refs.scene,
        )
        console.info(
          `[SimulationEngine] DynamicRobot built from ${sourceUrl}: ` +
          `${description.motors.length} motor(s), ${description.casters.length} caster(s), ` +
          `${description.sensors.length} sensor(s)`,
        )
      } catch (err) {
        console.warn(`[SimulationEngine] DynamicRobot build failed, falling back to SimpleRobot:`, err)
        robot = null
      }
    }

    if (!robot) {
      robot = new SimpleRobot(
        { position: initialPosition, ldraw },
        world,
        refs.scene,
      )
    }

    return new SimulationEngine(world, refs, robot)
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
      const dt = (now - this._lastTime) / 1000
      this._lastTime = now
      this._tick(dt)  // _tick clamps the accumulator to MAX_FRAME_DT internally
    }
    this._rafId = requestAnimationFrame(loop)
  }

  stopRAF(): void {
    cancelAnimationFrame(this._rafId)
  }

  // ── Robot control ──────────────────────────────────────────────────────────

  /** Snap robot back to its initial pose; brake motors. */
  resetRobot(): void {
    this.robot.reset()
  }

  /** Notify the renderer of a canvas size change. */
  resize(width: number, height: number): void {
    resizeRenderer(this._refs, width, height)
  }

  /** Free all GPU and physics resources. */
  dispose(): void {
    this.stopRAF()
    this._challengeDispose?.()
    this.robot.dispose()
    this._refs.renderer.dispose()
  }

  // ── Per-frame step ─────────────────────────────────────────────────────────

  private _tick(rafDt: number): void {
    // Decouple physics rate from rAF rate. Each world.step() advances
    // simulation by exactly PHYSICS_DT regardless of display refresh rate;
    // we accumulate real elapsed time and run as many steps as needed.
    this._physicsAccumulator += Math.min(rafDt, SimulationEngine.MAX_FRAME_DT)
    while (this._physicsAccumulator >= SimulationEngine.PHYSICS_DT) {
      this.world.step()
      this.robot.step(SimulationEngine.PHYSICS_DT)
      if (this.robot.sensor.step) this.robot.sensor.step(this.world)
      this._physicsAccumulator -= SimulationEngine.PHYSICS_DT
    }

    // Render once per rAF, regardless of how many physics steps ran.
    useSimulationStore.getState().setSensorValue('front', this.robot.sensor.getValue())
    this._refs.controls.update()
    this._refs.renderer.render(this._refs.scene, this._refs.camera)
  }
}
