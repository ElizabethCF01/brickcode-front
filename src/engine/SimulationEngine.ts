import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { createScene, resizeRenderer, type SceneRefs } from './renderer/SceneSetup'
import { SimpleRobot } from './components/SimpleRobot'
import { getLDrawManager } from './ldraw/ldrawSingleton'
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

  readonly robot:       SimpleRobot
  readonly interpreter: BlockInterpreter

  private readonly _refs: SceneRefs

  private _rafId    = 0
  private _lastTime = 0
  private _challengeDispose: (() => void) | null = null

  private constructor(world: RAPIER.World, refs: SceneRefs, robot: SimpleRobot) {
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

    // Static ground plane so the robot's wheels have something to push against.
    // (The decorative floor mesh is added by createScene; this is the collider.)
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(50, 0.05, 50)
        .setTranslation(0, -0.05, 0)
        .setFriction(1.0),
      world.createRigidBody(RAPIER.RigidBodyDesc.fixed()),
    )

    const refs = createScene(canvas)

    // Robot hub initial position: hub centre is at y = HUB_Y inside SimpleRobot.
    // Place at world origin — wheels will rest on the ground plane.
    const ldraw = getLDrawManager() ?? undefined
    const robot = new SimpleRobot(
      {
        position: new THREE.Vector3(0, 0.6, 0),
        ldraw,
      },
      world,
      refs.scene,
    )

    // Optional: attach a user-imported LDraw model (visual only, level 1).
    // Set VITE_IMPORTED_ROBOT_MODEL to a packed .mpd URL — e.g.
    // `/ldraw/models/packed/speed-bot.mpd` — and run `npm run pack-ldraw`
    // first so the file exists.
    const importedModelUrl = import.meta.env.VITE_IMPORTED_ROBOT_MODEL as string | undefined
    if (importedModelUrl && ldraw) {
      try {
        const group = await ldraw.loadModel(importedModelUrl)
        // Optional fine-tune knobs for the imported model — level-1 visuals
        // can never match a physics rig with a different wheel layout, so
        // these let you nudge the chassis up/down (and yaw) until it looks
        // right. Set in `.env.local`:
        //   VITE_IMPORTED_ROBOT_OFFSET_Y=0.05   # raise 5 cm
        //   VITE_IMPORTED_ROBOT_OFFSET_X=0
        //   VITE_IMPORTED_ROBOT_OFFSET_Z=0
        //   VITE_IMPORTED_ROBOT_YAW_DEG=0
        const ox = Number(import.meta.env.VITE_IMPORTED_ROBOT_OFFSET_X ?? 0)
        const oy = Number(import.meta.env.VITE_IMPORTED_ROBOT_OFFSET_Y ?? 0)
        const oz = Number(import.meta.env.VITE_IMPORTED_ROBOT_OFFSET_Z ?? 0)
        const yawDeg = Number(import.meta.env.VITE_IMPORTED_ROBOT_YAW_DEG ?? 0)
        robot.attachImportedVisual(group, {
          extraOffset: new THREE.Vector3(ox, oy, oz),
          extraRotationY: (yawDeg * Math.PI) / 180,
        })
      } catch (err) {
        console.warn(`[SimulationEngine] failed to load imported model "${importedModelUrl}":`, err)
      }
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

  private _tick(dt: number): void {
    // 1. Step physics (revolute joint motors push the wheels, wheels push the hub).
    this.world.step()

    // 2. Sync visuals + sensor origin.
    this.robot.step(dt)

    // 3. Push sensor reading + render.
    this.robot.sensor.step(this.world)
    useSimulationStore.getState().setSensorValue('front', this.robot.sensor.getValue())

    this._refs.controls.update()
    this._refs.renderer.render(this._refs.scene, this._refs.camera)
  }
}
