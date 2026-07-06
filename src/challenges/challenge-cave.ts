import * as THREE from 'three'
import { useSimulationStore, HUB_MATRIX_SIZE } from '../store/simulationStore'
import { placeProps, type PropsHandle } from '../engine/ldraw/decorProps'
import { loadDecorModel, disposeDecorModel } from '../engine/ldraw/loadDecorModel'
import type {
  ChallengeCameraRig,
  ChallengeEngine,
  ChallengeHandle,
  ChallengeResult,
  ChallengeRobot,
  LevelDefinition,
} from './types'

// Scale: 1 world unit = 10 cm — see docs/architecture.md §Scale Convention.

// ── Auto-drive ───────────────────────────────────────────────────────────────
// The LEVEL drives the car (the kid only programs the light module connected
// to the hub). The real SPIKE Essential cave car has no drive motors, so this
// actor is moved as a scripted scene element instead of by hidden SimpleRobot
// wheel joints.
const SPEED_CM_S = 18
const SPEED_WU_S = SPEED_CM_S * 0.1

// ── Course layout (car spawns at z = 0 and drives toward −Z) ─────────────────
// The real SPIKE Essential cave car carries NO sensors — only the light module.
// So this is a TIMING level: the kid choreographs the light with "esperar
// segundos" blocks, guided by what they can see coming (the dark cave mouth,
// the blue crystal glow where the bats sleep). At 18 cm/s the zones translate
// to generous ~3.5 s windows between required toggles:
//   light ON  before t ≈ 4.4 s   (DARK_A starts)
//   light OFF between 7.2–10.8 s (after DARK_A, before the bats)
//   light ON  between 13.6–17.2 s (after the bats, before DARK_B)
// Reference solution: enciende → espera 8 → apaga → espera 7 → enciende.

// Zones checked against the hub-centre z (entry bound first, moving −Z).
const DARK_A = [-8, -13] as const       // hub light must be ON
const BAT    = [-19.5, -24.5] as const  // hub light must be OFF (sleeping bats)
const DARK_B = [-31, -36] as const      // hub light must be ON again
const EXIT_Z = -38                      // made it out → success

// Cave tunnel (visual only — no colliders anywhere on the course).
const CAVE_CENTRE_Z = -22
const CAVE_LENGTH   = 29                // z ∈ [-7.5, -36.5]
const WALL_X        = 2.3
const CEILING_Y     = 2.35

const CAR_MODEL  = '/ldraw/models/packed/cave_car.mpd'
const ROCK_MODEL = '/ldraw/models/packed/rock-big.mpd'
const PINE_MODEL = '/ldraw/models/packed/tree-pine.mpd'
const BAT_MODEL  = '/ldraw/models/packed/bat.mpd'

// Sleeping LEGO bats (part 30103, "Animal Bat"): hang point just under the
// tunnel ceiling and wingspan in world units (≈ 7 cm).
const BAT_HANG_Y = 1.95
const BAT_FIT    = 0.7

// ── Dusk palette ─────────────────────────────────────────────────────────────
const DUSK_BG      = 0x241733
const DUSK_FOG     = 0x2a1e3f
const SKY_HORIZON  = new THREE.Color('#ff9a5a')
const SKY_MID      = new THREE.Color('#7b3fa0')
const SKY_TOP      = new THREE.Color('#1b1440')
const CRYSTAL_BLUE = 0x4fc3f7

const STAR_COUNT    = 300
const FIREFLY_COUNT = 40

// Fallback offsets used only before the real cave_car.mpd has loaded (while
// the proc stand-in from buildProcCaveCar is showing). Once the real model is
// in, the rig anchors to the actual "47592c01-bl.dat" (Electric, Color Light
// Matrix) part instead — see `findLightMatrixPart` / `active.lightPieceGroup`.
const FRONT_LIGHT_Y         = 0.36
const FRONT_LIGHT_BACK_Z    = -1.34
const FRONT_LIGHT_PIXEL_Z   = -1.38
const FRONT_LIGHT_EMITTER_Z = -1.46

// Local stagger (pixels → beam emitter) once the rig is anchored directly to
// the real light-matrix part's world position. The part's own origin
// (47592c01-bl.dat) sits at the BACK of its housing, not the lens — confirmed
// empirically with a debug marker ruler — so these offsets walk forward
// (negative Z, same convention as FRONT_LIGHT_* above) the ~0.4 WU depth of
// the housing to reach the front lens face. The synthetic backing plate is
// hidden once anchored (the real part's own mesh already shows it).
const ANCHORED_PIXEL_Z   = -0.36
const ANCHORED_EMITTER_Z = -0.42
// The synthetic 3×3 grid was sized to match the proc stand-in's small dash
// light; the real part's lens is noticeably bigger. Scale factor and spacing
// applied to each pixel mesh once anchored (see swap callback below).
const ANCHORED_PIXEL_SCALE   = 1.6
const ANCHORED_PIXEL_SPACING = 0.14

// Reused per-frame (follow-cam) to avoid allocations.
const _desiredTarget = new THREE.Vector3()
const _prevTarget    = new THREE.Vector3()
const _targetDelta   = new THREE.Vector3()
const _skyColor      = new THREE.Color()
const _lightPiecePos = new THREE.Vector3()

/**
 * Finds the real "Electric, Color Light Matrix" LDraw part (BL item 47592c01)
 * inside a loaded model. LDrawLoader keeps each top-level subfile as its own
 * named Group (name = source fileName) as long as it isn't a primitive/part
 * merged into the parent mesh — this one qualifies, so it survives as an
 * addressable node we can track every frame instead of guessing its position
 * from hardcoded offsets calibrated against the proc stand-in.
 */
function findLightMatrixPart(model: THREE.Object3D): THREE.Object3D | null {
  let found: THREE.Object3D | null = null
  model.traverse((o) => {
    if (!found && /47592/i.test(o.name)) found = o
  })
  return found
}

interface CaveScenario {
  scene:       THREE.Scene
  robot:       ChallengeRobot
  carGroup:    THREE.Group            // on the hub via attachImportedVisual: proc stand-in, then cave_car.mpd
  root:        THREE.Group            // every visual this level adds (single remove)
  sky:         THREE.Group            // dome + stars + sun glow; follows the camera
  stars:       THREE.Points
  fireflies:   THREE.Points
  fireflyBase: Float32Array
  crystalMat:  THREE.MeshStandardMaterial
  crystalLight: THREE.PointLight
  bats:        THREE.Group[]
  headlights:  THREE.Group
  pixels:      THREE.Mesh[]           // the 9 light-matrix pixels, row-major (matches hubMatrix)
  // Real light-matrix part once cave_car.mpd loads (findLightMatrixPart);
  // null while the proc stand-in (no such part) is still showing.
  lightPieceGroup: THREE.Object3D | null
  envRestore:  Array<() => void>      // undoes every mutation of the shared scene
  props:       PropsHandle[]
  cameraRig?:  ChallengeCameraRig
  camInit:     { pos: THREE.Vector3; target: THREE.Vector3 } | null
  spawn:       THREE.Vector3
  t:           number
  result:      ChallengeResult | null
  disposables: { dispose(): void }[]
}

// Single active scenario — setup() populates it, update()/reset()/evaluate()
// read it (same module-scoped pattern as challenge-boat).
let active: CaveScenario | null = null

const hubLit = () => useSimulationStore.getState().hubMatrix.some((v) => v > 0)
const inZone = (z: number, zone: readonly [number, number]) => z <= zone[0] && z >= zone[1]

function stopCar(robot: ChallengeRobot): void {
  robot.motors.left.stop()
  robot.motors.right.stop()
}

/** Sunset sky: gradient dome + stars + sun glow. Follows the camera in ambient(). */
function buildSky(disposables: { dispose(): void }[]): { sky: THREE.Group; stars: THREE.Points } {
  const sky = new THREE.Group()

  // Dome: per-vertex gradient from warm horizon to near-night zenith. Drawn
  // first with no depth write so everything else paints over it (skybox trick).
  const domeGeo = new THREE.SphereGeometry(60, 32, 16)
  const domePos = domeGeo.attributes.position
  const domeCol = new Float32Array(domePos.count * 3)
  for (let i = 0; i < domePos.count; i++) {
    const t = THREE.MathUtils.clamp(domePos.getY(i) / 60, -1, 1)
    if (t <= 0) _skyColor.copy(SKY_HORIZON)
    else if (t < 0.35) _skyColor.lerpColors(SKY_HORIZON, SKY_MID, t / 0.35)
    else _skyColor.lerpColors(SKY_MID, SKY_TOP, (t - 0.35) / 0.65)
    domeCol[i * 3] = _skyColor.r; domeCol[i * 3 + 1] = _skyColor.g; domeCol[i * 3 + 2] = _skyColor.b
  }
  domeGeo.setAttribute('color', new THREE.BufferAttribute(domeCol, 3))
  const domeMat = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  })
  const dome = new THREE.Mesh(domeGeo, domeMat)
  dome.renderOrder = -1
  sky.add(dome)

  // First stars of the evening, biased toward the zenith where the sky is dark.
  const starPos = new Float32Array(STAR_COUNT * 3)
  for (let i = 0; i < STAR_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2
    const y = 0.25 + 0.75 * Math.random()
    const h = Math.sqrt(1 - y * y)
    starPos[i * 3]     = Math.cos(theta) * h * 55
    starPos[i * 3 + 1] = y * 55
    starPos[i * 3 + 2] = Math.sin(theta) * h * 55
  }
  const starGeo = new THREE.BufferGeometry()
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
  const starMat = new THREE.PointsMaterial({
    color: 0xfff6e0, size: 0.35, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  })
  const stars = new THREE.Points(starGeo, starMat)
  stars.renderOrder = -1
  sky.add(stars)

  // Setting-sun glow, in the same direction as the (repositioned) sun light.
  const glowGeo = new THREE.CircleGeometry(7, 24)
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xffb36b, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  })
  const glow = new THREE.Mesh(glowGeo, glowMat)
  glow.position.set(-15, 2.5, 8).normalize().multiplyScalar(57)
  glow.lookAt(0, 0, 0)
  glow.renderOrder = -1
  sky.add(glow)

  disposables.push(domeGeo, domeMat, starGeo, starMat, glowGeo, glowMat)
  return { sky, stars }
}

/**
 * Procedural cave car (chassis, cabin, windshield, bumper, roof bar, wheels),
 * mounted on the hub via `attachImportedVisual` — which also hides the default
 * EV3-hub LDraw visuals (that part renders broken). Stand-in only: the real
 * `cave_car.mpd` swaps in async when it loads (same path as boat/coco).
 */
function buildProcCaveCar(): { group: THREE.Group; disposables: { dispose(): void }[] } {
  const group = new THREE.Group()
  // attachImportedVisual assumes LDraw Y-down models and flips its group 180°
  // around X; counter-flip an inner wrapper so this Y-up build lands upright.
  const inner = new THREE.Group()
  inner.rotation.x = Math.PI
  group.add(inner)

  const yellow = new THREE.MeshStandardMaterial({ color: '#FDC500', roughness: 0.6 })
  const dark   = new THREE.MeshStandardMaterial({ color: '#37474F', roughness: 0.8 })
  const glass  = new THREE.MeshStandardMaterial({ color: '#90CAF9', roughness: 0.2, metalness: 0.3 })
  const tire   = new THREE.MeshStandardMaterial({ color: '#1c1c22', roughness: 0.9 })

  // Front faces −Z (the drive direction); bottoms rest at local y = 0.
  const chassisGeo = new THREE.BoxGeometry(1.3, 0.4, 2.3)
  const chassis = new THREE.Mesh(chassisGeo, yellow)
  chassis.position.set(0, 0.5, 0)
  chassis.castShadow = true
  inner.add(chassis)

  const cabinGeo = new THREE.BoxGeometry(1.15, 0.5, 1.0)
  const cabin = new THREE.Mesh(cabinGeo, yellow)
  cabin.position.set(0, 0.95, 0.35)
  cabin.castShadow = true
  inner.add(cabin)

  const windshieldGeo = new THREE.BoxGeometry(1.0, 0.36, 0.08)
  const windshield = new THREE.Mesh(windshieldGeo, glass)
  windshield.position.set(0, 0.95, -0.2)
  windshield.rotation.x = -0.25
  inner.add(windshield)

  const bumperGeo = new THREE.BoxGeometry(1.34, 0.22, 0.18)
  const bumper = new THREE.Mesh(bumperGeo, dark)
  bumper.position.set(0, 0.42, -1.2)
  inner.add(bumper)

  const barGeo = new THREE.BoxGeometry(0.9, 0.1, 0.16)
  const bar = new THREE.Mesh(barGeo, dark)   // roof light bar, explorer-style
  bar.position.set(0, 1.26, 0.1)
  inner.add(bar)

  const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.18, 14)
  for (const [x, z] of [[-0.72, -0.75], [0.72, -0.75], [-0.72, 0.75], [0.72, 0.75]]) {
    const wheel = new THREE.Mesh(wheelGeo, tire)
    wheel.position.set(x, 0.3, z)
    wheel.rotation.z = Math.PI / 2   // cylinder axis along X (the axle)
    wheel.castShadow = true
    inner.add(wheel)
  }

  return {
    group,
    disposables: [chassisGeo, cabinGeo, windshieldGeo, bumperGeo, barGeo, wheelGeo, yellow, dark, glass, tire],
  }
}

export const challengeCave = {
  id:          'challenge-cave',
  title:       '🔦 El coche de la cueva',
  description:
    'Es el atardecer y el coche avanza solo hacia una cueva oscura. Pista de explorador: viaja 18 cm cada segundo. Enciende la pieza de luz antes de entrar, apágala en los cristales azules y vuelve a encenderla para la última zona oscura.',
  difficulty:  2,
  tags:        ['lights'],
  robot:       'simple',
  // Like the real SPIKE Essential cave car: no sensors at all — only lights.
  // This makes it a TIMING level ("esperar segundos" + luz), not a reactive one.
  sensors:     { distance: false, color: false },
  // The cave decides the outcome, not the end of the kid's program.
  scenarioDecidesEnd: true,
  // The level drives the car — movement blocks would only mislead.
  hiddenCategories: ['Movimiento', 'Motores'],
  // Drives the per-level loading screen (see levelAssets).
  decorModels: [CAR_MODEL, ROCK_MODEL, PINE_MODEL, BAT_MODEL],
  hints: [
    'Acertijo: si el coche avanza 18 cm por segundo, en 5 segundos recorre casi 90 cm. La primera oscuridad empieza un poquito antes: conviene encender la pieza de luz al inicio',
    'Los cristales azules están cerca de los segundos 11 a 14. Ahí duermen los murciélagos, así que la luz debe estar apagada antes de llegar',
    'Después de los cristales vuelve otra zona oscura cerca del segundo 17. Ritmo de prueba: enciende → espera 8 → apaga → espera 7 → enciende',
  ],

  /**
   * Builds the dusk environment (mutating the shared scene — every change is
   * recorded in `envRestore` and undone in dispose()) and the cave tunnel with
   * its bat/crystal chamber. The level owns the car's motion: update() places
   * the car directly along the tunnel and latches the verdict, boat-style. No
   * sensors — the kid choreographs the light purely with timing blocks.
   */
  setup(engine: ChallengeEngine): ChallengeHandle {
    const { scene, robot } = engine
    const disposables: { dispose(): void }[] = []
    const envRestore: Array<() => void> = []

    // ── Dusk lighting: save + mutate the global scene setup ──────────────────
    const prevBackground = scene.background
    const prevFog = scene.fog
    envRestore.push(() => { scene.background = prevBackground; scene.fog = prevFog })
    scene.background = new THREE.Color(DUSK_BG)
    scene.fog = new THREE.Fog(DUSK_FOG, 15, 45)

    const ambientLight = (scene.getObjectByName('ambient-light')
      ?? scene.children.find((o) => o instanceof THREE.AmbientLight)) as THREE.AmbientLight | undefined
    if (ambientLight) {
      const color = ambientLight.color.clone(); const intensity = ambientLight.intensity
      envRestore.push(() => { ambientLight.color.copy(color); ambientLight.intensity = intensity })
      ambientLight.color.set(0xffd9b3)
      ambientLight.intensity = 0.2
    }

    const hemiLight = (scene.getObjectByName('hemi-light')
      ?? scene.children.find((o) => o instanceof THREE.HemisphereLight)) as THREE.HemisphereLight | undefined
    if (hemiLight) {
      const color = hemiLight.color.clone(); const ground = hemiLight.groundColor.clone()
      const intensity = hemiLight.intensity
      envRestore.push(() => {
        hemiLight.color.copy(color); hemiLight.groundColor.copy(ground); hemiLight.intensity = intensity
      })
      hemiLight.color.set(0x3a2a5d)
      hemiLight.groundColor.set(0x1c1428)
      hemiLight.intensity = 0.45
    }

    const sunLight = (scene.getObjectByName('sun-light')
      ?? scene.children.find((o) => o instanceof THREE.DirectionalLight)) as THREE.DirectionalLight | undefined
    if (sunLight) {
      const color = sunLight.color.clone(); const intensity = sunLight.intensity
      const position = sunLight.position.clone()
      envRestore.push(() => {
        sunLight.color.copy(color); sunLight.intensity = intensity; sunLight.position.copy(position)
      })
      sunLight.color.set(0xff8c5a)
      sunLight.intensity = 0.5
      sunLight.position.set(-15, 5, 8)   // low on the horizon, matching the glow
    }

    // Every visual the level adds hangs off one root group (root stays at the
    // origin with identity transform, so child positions are world positions).
    const root = new THREE.Group()
    scene.add(root)

    const { sky, stars } = buildSky(disposables)
    root.add(sky)

    // ── Ground strip: extends the visible floor to cover the course ──────────
    // (The PHYSICS ground collider is already 100×100 — SimulationEngine — so
    // this is visual only.) Also a dark interior floor so the tunnel reads dark.
    const stripGeo = new THREE.BoxGeometry(20, 0.1, 34)
    const stripMat = new THREE.MeshStandardMaterial({ color: '#3d3a45', roughness: 1 })
    const strip = new THREE.Mesh(stripGeo, stripMat)
    strip.position.set(0, -0.05, -27)   // top face at y = 0, z ∈ [-10, -44]
    strip.receiveShadow = true
    root.add(strip)

    const innerFloorGeo = new THREE.PlaneGeometry(2 * WALL_X, CAVE_LENGTH)
    const innerFloorMat = new THREE.MeshStandardMaterial({ color: '#211e28', roughness: 1 })
    const innerFloor = new THREE.Mesh(innerFloorGeo, innerFloorMat)
    innerFloor.rotation.x = -Math.PI / 2
    innerFloor.position.set(0, 0.005, CAVE_CENTRE_Z)
    root.add(innerFloor)

    // ── Cave tunnel: walls + ceiling, visual only ─────────────────────────────
    const rockMat    = new THREE.MeshStandardMaterial({ color: '#34313b', roughness: 1, flatShading: true })
    const ceilingMat = new THREE.MeshStandardMaterial({ color: '#2a2731', roughness: 1, flatShading: true })
    const wallGeo    = new THREE.BoxGeometry(0.8, 2.2, CAVE_LENGTH)
    const ceilingGeo = new THREE.BoxGeometry(2 * WALL_X + 0.8, 0.5, CAVE_LENGTH)
    const boulderGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4)
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(wallGeo, rockMat)
      wall.position.set(side * WALL_X, 1.1, CAVE_CENTRE_Z)
      wall.castShadow = true
      root.add(wall)
      // Chunky boulder flanking the entrance so the mouth reads as rock.
      const boulder = new THREE.Mesh(boulderGeo, rockMat)
      boulder.position.set(side * 2.9, 0.7, -7.2)
      boulder.rotation.set(0.3 * side, 0.7 * side, 0.2)
      boulder.castShadow = true
      root.add(boulder)
    }
    const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat)
    ceiling.position.set(0, CEILING_Y, CAVE_CENTRE_Z)
    ceiling.castShadow = true
    root.add(ceiling)

    // ── Bat chamber: glowing crystals (the "azul" cue fiction) + sleeping bats ─
    const crystalGeo = new THREE.OctahedronGeometry(0.22)
    const crystalMat = new THREE.MeshStandardMaterial({
      color: '#0d2b3d', emissive: CRYSTAL_BLUE, emissiveIntensity: 1.4, roughness: 0.4,
    })
    const crystalSpots: Array<[number, number, number, number]> = [   // x, y, z, scale
      [-1.8, 0.25, -20.2, 1.0], [1.7, 0.3, -21.3, 1.3], [-1.6, 0.28, -22.6, 0.8],
      [1.8, 0.22, -23.6, 1.1], [-1.7, 0.3, -24.2, 1.2],
    ]
    for (const [x, y, z, s] of crystalSpots) {
      const crystal = new THREE.Mesh(crystalGeo, crystalMat)
      crystal.position.set(x, y, z)
      crystal.scale.setScalar(s)
      crystal.rotation.y = x * 3.1
      root.add(crystal)
    }
    const crystalLight = new THREE.PointLight(CRYSTAL_BLUE, 1.3, 8)
    crystalLight.position.set(0, 1.8, CAVE_CENTRE_Z)
    root.add(crystalLight)

    // Sleeping LEGO bats (part 30103) hanging head-down from the ceiling. The
    // packed model loads async (same swap-in path as the car); create each
    // wrapper group now — positioned and flipped head-down — and drop a clone
    // of the model into it once ready. Keeping the wrappers stable means
    // ambient()'s gentle sway (rotation.z) always has real groups to animate.
    const bats: THREE.Group[] = []
    const batSpots: Array<[number, number]> = [[-0.9, -20.5], [0.6, -22.2], [-0.2, -23.8]]
    for (const [x, z] of batSpots) {
      const bat = new THREE.Group()
      bat.position.set(x, BAT_HANG_Y, z)
      // rotation.z = π rolls the upright model 180° about its own facing axis:
      // head-down (asleep) AND still facing +Z — toward the car, which enters
      // from +Z. (rotation.x = π would hang it head-down but facing −Z, away.)
      bat.rotation.z = Math.PI
      root.add(bat)
      bats.push(bat)
    }
    // Clones share the original's geometry/materials, so one disposeDecorModel
    // frees them all (registered below as a disposable that reads batModel lazily).
    let batModel: THREE.Group | null = null
    disposables.push({ dispose: () => { if (batModel !== null) disposeDecorModel(batModel) } })
    void loadDecorModel(BAT_MODEL, { fitLongest: BAT_FIT }).then((model) => {
      if (!model || !active || active.root !== root) {
        if (model) disposeDecorModel(model)
        return
      }
      batModel = model
      bats.forEach((bat, i) => bat.add(i === 0 ? model : model.clone()))
    })

    // ── Fireflies outside the cave (ambient sparkle over the dusk meadow) ─────
    const fireflyBase = new Float32Array(FIREFLY_COUNT * 3)
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      fireflyBase[i * 3]     = -9 + Math.random() * 18
      fireflyBase[i * 3 + 1] = 0.3 + Math.random() * 1.3
      fireflyBase[i * 3 + 2] = 4 - Math.random() * 10   // z ∈ [-6, 4] — all outside
    }
    const fireflyGeo = new THREE.BufferGeometry()
    fireflyGeo.setAttribute('position', new THREE.BufferAttribute(fireflyBase.slice(), 3))
    const fireflyMat = new THREE.PointsMaterial({
      color: 0xd4e157, size: 0.14, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
    const fireflies = new THREE.Points(fireflyGeo, fireflyMat)
    root.add(fireflies)

    // ── Front light module: scene-level rig that follows the car (the car never
    // turns, so no parenting into the flipped imported model is needed).
    // Visible only while the hub matrix is lit — the kid's light blocks drive
    // this external 47592-style light module connected to the hub.
    const headlights = new THREE.Group()
    headlights.name = 'cave-front-light-rig'

    const beam = new THREE.SpotLight(0xfff2cc, 3.2, 13, 0.42, 0.65, 1.15)
    beam.name = 'cave-front-light-beam'
    beam.position.set(0, FRONT_LIGHT_Y, FRONT_LIGHT_EMITTER_Z)
    beam.castShadow = false
    const beamTarget = new THREE.Object3D()
    beamTarget.position.set(0, 0.18, -7)
    beam.target = beamTarget

    const glow = new THREE.PointLight(0xfff2cc, 0.75, 2.4, 1.7)
    glow.name = 'cave-front-light-glow'
    glow.position.copy(beam.position)

    const backingGeo = new THREE.BoxGeometry(0.42, 0.42, 0.035)
    const backingMat = new THREE.MeshStandardMaterial({ color: '#1e252b', roughness: 0.45 })
    const backing = new THREE.Mesh(backingGeo, backingMat)
    backing.name = 'cave-front-light-emitter'
    backing.position.set(0, FRONT_LIGHT_Y, FRONT_LIGHT_BACK_Z)
    backing.rotation.x = 0.12
    headlights.add(backing)

    const pixelGeo = new THREE.BoxGeometry(0.075, 0.075, 0.012)
    const pixelMat = new THREE.MeshStandardMaterial({
      color: '#fff7d6',
      emissive: 0xfff2cc,
      emissiveIntensity: 3.4,
      roughness: 0.18,
    })
    const pixels: THREE.Mesh[] = []
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const pixel = new THREE.Mesh(pixelGeo, pixelMat)
        pixel.position.set((col - 1) * 0.12, FRONT_LIGHT_Y + (1 - row) * 0.12, FRONT_LIGHT_PIXEL_Z)
        pixel.rotation.x = 0.12
        headlights.add(pixel)
        pixels.push(pixel)
      }
    }
    headlights.add(beam, beamTarget, glow)
    headlights.visible = false
    root.add(headlights)

    // ── LEGO props: rocks by the mouth, pine silhouettes on the meadow ────────
    const props: PropsHandle[] = [
      // No y offset: placeProps already rests the model's base at y = 0
      // (bottomY: 0). A slight negative would float; a positive lifts them off
      // the ground — which is the bug we're fixing here.
      placeProps(scene, ROCK_MODEL, [
        { x: -4.2, z: -6.2, rotationY: 0.7 },
        { x: 4.0, z: -6.8, rotationY: 2.6, scale: 1.2 },
        { x: -3.6, z: -11, rotationY: 1.4, scale: 0.8 },
      ], { fitLongest: 1.1 }),
      placeProps(scene, PINE_MODEL, [
        { x: -7, z: 1, rotationY: 0.4 },
        { x: 7.4, z: -2, rotationY: 2.1, scale: 0.9 },
        { x: -6.4, z: -4.5, rotationY: 4.0, scale: 1.1 },
      ], { fitLongest: 2.2 }),
    ]

    // ── Car visual: proc stand-in now, real cave_car.mpd when it loads ───────
    // attachImportedVisual also hides the default EV3-hub/motor/wheel visuals
    // (that LDraw hub renders broken). The level moves the hidden rig directly.
    const car = buildProcCaveCar()
    robot.attachImportedVisual?.(car.group)
    disposables.push(...car.disposables)

    // Upgrade to the real LEGO model when packed — same async swap-in path as
    // the boat/crocodile. Requires the 3626cpb1354.dat head to be inlined in
    // the pack (copied from Studio's UnOfficial parts into draw-library).
    void loadDecorModel(CAR_MODEL, { fitLongest: 2.4 }).then((model) => {
      if (!model || !active || active.root !== root) {
        if (model) disposeDecorModel(model)
        return
      }
      // Swap: drop the proc stand-in, mount the real car on the hub.
      // extraRotationY: Studio exports usually face +Z; the course runs −Z.
      car.group.parent?.remove(car.group)
      active.robot.attachImportedVisual?.(model, { extraRotationY: Math.PI })
      active.carGroup = model

      // The real model carries the actual "Electric, Color Light Matrix"
      // part (47592c01-bl.dat) — anchor the synthetic glow rig to it instead
      // of the hardcoded FRONT_LIGHT_* offsets (those were only ever
      // calibrated against the proc stand-in's box geometry). Re-baseline
      // the rig's children to a small local stagger since headlights.position
      // now tracks the part's real world position every frame.
      const lightPiece = findLightMatrixPart(model)
      if (lightPiece) {
        active.lightPieceGroup = lightPiece
        // The real part's own mesh already renders the black housing/backing
        // plate — the synthetic backing box was only a stand-in for the proc
        // car, which has no such part. Showing both doubles up as a visible
        // black square around the pixels.
        backing.visible = false
        pixels.forEach((pixel, i) => {
          const row = Math.floor(i / 3)
          const col = i % 3
          pixel.position.set(
            (col - 1) * ANCHORED_PIXEL_SPACING,
            (1 - row) * ANCHORED_PIXEL_SPACING,
            ANCHORED_PIXEL_Z,
          )
          pixel.scale.setScalar(ANCHORED_PIXEL_SCALE)
          // The FRONT_LIGHT_* tilt matched the proc car's sloped hood; the
          // real part sits flat relative to the anchor.
          pixel.rotation.x = 0
        })
        beam.position.set(0, 0, ANCHORED_EMITTER_Z)
        glow.position.copy(beam.position)
        beamTarget.position.y = 0
      }
    })

    const cameraRig = engine.cameraRig
    const start = robot.getPosition?.()
    const spawn = new THREE.Vector3(start?.x ?? 0, start?.y ?? 0.6, start?.z ?? 0)
    active = {
      scene, robot,
      carGroup: car.group,
      root, sky, stars, fireflies, fireflyBase,
      crystalMat, crystalLight, bats, headlights, pixels,
      lightPieceGroup: null,
      envRestore, props, cameraRig,
      camInit: cameraRig
        ? { pos: cameraRig.camera.position.clone(), target: cameraRig.controls.target.clone() }
        : null,
      spawn,
      t: 0,
      result: null,
      disposables: [
        ...disposables, stripGeo, stripMat, innerFloorGeo, innerFloorMat,
        rockMat, ceilingMat, wallGeo, ceilingGeo, boulderGeo,
        crystalGeo, crystalMat,
        fireflyGeo, fireflyMat, beam, glow, backingGeo, backingMat, pixelGeo, pixelMat,
      ],
    }

    const handle: ChallengeHandle = {
      /**
       * Gameplay step (only while running): keep the car driving, follow it
       * with the camera, and latch the verdict the moment a rule is broken —
       * evaluated at the right moment, boat-style, not at stop time.
       */
      update(dt: number): void {
        const s = active
        if (!s || s.result) return

        const current = s.robot.getPosition?.()
        const z = (current?.z ?? s.spawn.z) - SPEED_WU_S * dt
        s.robot.setScriptedPose?.({ x: s.spawn.x, y: s.spawn.y, z })

        const p = s.robot.getPosition?.()
        if (!p) return

        // Follow-cam: move the orbit target toward the car and translate the
        // camera by the same delta, preserving whatever orbit angle the kid set.
        if (s.cameraRig) {
          const { camera, controls } = s.cameraRig
          _prevTarget.copy(controls.target)
          _desiredTarget.set(p.x, 0.4, p.z)
          controls.target.lerp(_desiredTarget, 0.08)
          camera.position.add(_targetDelta.copy(controls.target).sub(_prevTarget))
        }

        const lit = hubLit()
        if ((inZone(p.z, DARK_A) || inZone(p.z, DARK_B)) && !lit) {
          s.result = {
            success: false,
            message: '💥 ¡Crash! El coche chocó con una roca en la oscuridad. Enciende la luz antes de entrar a la cueva.',
          }
        } else if (inZone(p.z, BAT) && lit) {
          s.result = {
            success: false,
            message: '🦇 ¡La luz despertó a los murciélagos! Apágala antes de llegar a los cristales azules (usa "esperar segundos").',
          }
        } else if (p.z <= EXIT_Z) {
          s.result = {
            success: true,
            message: '🌟 ¡Saliste de la cueva! Encendiste y apagaste la luz en el momento justo.',
          }
        }
        if (s.result) {
          stopCar(s.robot)
          useSimulationStore.getState().requestAutoStop()
        }
      },

      /** Purely cosmetic — runs every frame, even while editing blocks. */
      ambient(dt: number): void {
        const s = active
        if (!s) return
        s.t += dt

        // The front light module tracks the car; it is what the light blocks
        // control visually in this sensorless build. Once the real model has
        // loaded, anchor to the actual light-matrix part's world position
        // instead of the hub — the hub centre sits low/inside the chassis,
        // nowhere near where that part is actually mounted at the front.
        if (s.lightPieceGroup) {
          s.lightPieceGroup.getWorldPosition(_lightPiecePos)
          s.headlights.position.copy(_lightPiecePos)
        } else {
          const p = s.robot.getPosition?.()
          if (p) s.headlights.position.set(p.x, 0, p.z)
        }
        // Faithful to the real 47592 3×3 Color Light Matrix: show exactly the
        // pixels the kid lit in their block, not all nine. hubMatrix is the
        // row-major 0–100 brightness array the light blocks write; s.pixels is
        // built in the same row-major order, so index i maps 1:1. The beam/glow
        // stay tied to "any pixel on" — the flashlight fiction that lights the
        // cave and drives the gameplay verdict (hubLit()).
        const matrix = useSimulationStore.getState().hubMatrix
        const anyLit = matrix.some((v) => v > 0)
        s.headlights.visible = anyLit
        if (anyLit) s.pixels.forEach((pixel, i) => { pixel.visible = (matrix[i] ?? 0) > 0 })

        // Sky dome is camera-centred so it behaves like an infinite skybox.
        if (s.cameraRig) s.sky.position.copy(s.cameraRig.camera.position)

        ;(s.stars.material as THREE.PointsMaterial).opacity = 0.75 + 0.25 * Math.sin(s.t * 1.3)

        const pos = s.fireflies.geometry.attributes.position
        for (let i = 0; i < FIREFLY_COUNT; i++) {
          pos.setY(i, s.fireflyBase[i * 3 + 1] + 0.15 * Math.sin(s.t * 1.6 + i * 0.7))
        }
        pos.needsUpdate = true
        ;(s.fireflies.material as THREE.PointsMaterial).opacity = 0.55 + 0.35 * Math.sin(s.t * 2.3)

        const pulse = Math.sin(s.t * 2.1)
        s.crystalMat.emissiveIntensity = 1.2 + 0.5 * pulse
        s.crystalLight.intensity = 1.1 + 0.4 * pulse

        // Gentle nod on X (the roll axis Z now holds the head-down orientation).
        s.bats.forEach((bat, i) => { bat.rotation.x = 0.12 * Math.sin(s.t * 1.8 + i * 1.7) })
      },

      reset(): void {
        const s = active
        if (!s) return
        stopCar(s.robot)
        // Direct robot reset — NEVER engine.resetRobot() here (it calls back
        // into challenge.reset(), which would recurse). Run-start only calls
        // resetChallenge(), so without this the car would resume mid-course.
        s.robot.setScriptedPose?.(s.spawn)
        ;(s.robot as { reset?(): void }).reset?.()
        // A hub matrix still lit from the previous run would pass DARK_A free.
        useSimulationStore.getState().setHubMatrix(new Array(HUB_MATRIX_SIZE).fill(0))
        if (s.cameraRig && s.camInit) {
          s.cameraRig.camera.position.copy(s.camInit.pos)
          s.cameraRig.controls.target.copy(s.camInit.target)
        }
        s.result = null
      },

      dispose(): void {
        const s = active
        if (!s) return
        s.envRestore.forEach((restore) => restore())
        s.scene.remove(s.root)
        s.props.forEach((prop) => prop.dispose())
        // Un-mount the car (proc stand-in or loaded cave_car.mpd) and bring
        // the robot's own visuals back (attachImportedVisual hid them).
        // disposeDecorModel double-disposes the proc car's geometries (already
        // in `disposables`), which THREE tolerates.
        s.carGroup.parent?.remove(s.carGroup)
        disposeDecorModel(s.carGroup)
        s.robot.setVisualHidden?.(false)
        if (s.cameraRig && s.camInit) {
          s.cameraRig.camera.position.copy(s.camInit.pos)
          s.cameraRig.controls.target.copy(s.camInit.target)
        }
        s.disposables.forEach((d) => d.dispose())
        active = null
      },
    }
    return handle
  },

  /**
   * Reads the verdict latched by `update()` during the drive. Falls back to a
   * nudge if the student stopped before the cave decided anything.
   */
  evaluate(): ChallengeResult {
    return (
      active?.result ?? {
        success: false,
        message: 'El coche arranca solo. Programa el ritmo de la luz con "esperar segundos": enciéndela para la oscuridad y apágala junto a los murciélagos, y pulsa Ejecutar.',
      }
    )
  },
} satisfies LevelDefinition
