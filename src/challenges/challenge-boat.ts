import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { useSimulationStore, HUB_MATRIX_SIZE } from '../store/simulationStore'
import { loadDecorModel, disposeDecorModel } from '../engine/ldraw/loadDecorModel'
import { buildSkyDome, type SkyDomeHandle } from '../engine/renderer/skyDome'
import { placeProps, type PropsHandle } from '../engine/ldraw/decorProps'
import { registerColliderColor, unregisterColliderColor } from '../engine/colorRegistry'
import type { ChallengeEngine, ChallengeHandle, ChallengeResult, LevelDefinition } from './types'

// Scale: 1 world unit = 10 cm — see docs/architecture.md §Scale Convention.
const WU_PER_CM = 0.1
const WORLD_TO_CM = 10

// ── Geometry, matched to SimpleRobot's front distance sensor ────────────────
// SimpleRobot's sensor fires from z = -0.355 along -Z, at y = 0.4, range 200 cm
// (see SimpleRobot.ts SENSOR_LOCAL / LegoDistanceSensor). The crocodile slides
// along that ray toward the boat so the student's `Distancia frontal` reads it.
const SENSOR_ORIGIN_Z = -0.355
const SENSOR_Y        = 0.4

// Crocodile collider half-extents (world units). Wide/tall enough that the
// sensor ray (x=0, y=0.4) always crosses it; long in Z so it reads as a body.
const CROC_HALF = { x: 0.5, y: 0.35, z: 0.6 }

const START_GAP_CM = 90   // crocodile starts this far ahead (< sensor range 200)
const DANGER_CM    = 25   // "close" — the student should react by here
const ARRIVE_CM    = 4    // crocodile has reached the boat → too late
const SPEED_CM_S   = 18   // approach speed

const COCO_MODEL = '/ldraw/models/packed/coco.mpd'
const BOAT_MODEL = '/ldraw/models/packed/boat.mpd'
const PALM_MODEL = '/ldraw/models/packed/tree-palm.mpd'
const REED_MODEL = '/ldraw/models/packed/reeds.mpd'
const ROCK_MODEL = '/ldraw/models/packed/rock-big.mpd'
const FLOWER_MODEL = '/ldraw/models/packed/flowers.mpd'

// River layout (world units): the water strip runs along Z (the croc's path);
// sand banks flank it so props have somewhere dry to stand.
const WATER_W = 11
const WATER_L = 20
const WATER_Z = -4
const BANK_W  = 4.5
const BANK_X  = WATER_W / 2 + BANK_W / 2   // centre of each sand strip

// Wave surface: base height and summed sine amplitudes (see ambient()). The
// deepest trough (base − amplitude) must stay above the deep slab (y = 0.01).
const WATER_BASE_Y = 0.17
const WAVE_AMP     = 0.15
// Cartoon water colouring by wave height: troughs dark, crests light, the top
// slice whitish like foam. Baked per-vertex so it reads from any camera angle
// (pure lighting contrast on the small facets was invisible).
const WATER_TROUGH = new THREE.Color('#1565C0')
const WATER_CREST  = new THREE.Color('#42A5F5')
const WATER_FOAM   = new THREE.Color('#90CAF9')
const _waveColor   = new THREE.Color()

// Alarm glow: when the kid lights the hub matrix, the boat's Color Light Matrix
// lights up — the 🚨 alarm made visible in-scene, the boat's counterpart to the
// cave car's headlight rig. Two parts, same as the cave:
//   • a synthetic 3×3 grid of emissive pixels overlaid on the real 47592 lens,
//     showing EXACTLY the pixels the kid lit in their block (follows hubMatrix);
//   • a PointLight that casts the actual amber glow on the boat/water (emissive
//     meshes don't illuminate their neighbours, so the light is a separate part).
const ALARM_COLOR    = new THREE.Color('#ff5a2c')
const ALARM_DISTANCE = 6      // world units the glow reaches
const ALARM_BASE     = 1.3    // intensity floor while lit
const ALARM_PULSE    = 0.7    // ± pulse amplitude (alarm blink)
// The 47592 part's origin sits at the BACK of its housing; the lit screen faces
// along the part's LOCAL −Z (found with the debug marker cross — the cyan/−Z
// sphere landed on the lens). Walk the emitters out to the lens along that
// tilted axis so they sit on the screen, not inside the chassis.
const ALARM_LENS_OFFSET = 0.4    // world units along local −Z to the PointLight
const ALARM_PIXEL_Z     = -0.38  // local −Z of the pixel plane (on the lens face)

// Synthetic pixel grid, in the part's LOCAL frame (rotated by the part's world
// quaternion each frame, so it lies flat on the tilted lens). Sized larger than
// the cave's (0.14 / box 0.075×1.6) because boat.mpd loads at fitLongest 3.2 vs
// the cave car's 2.4 — the 47592 renders bigger here. Eyeball-tunable.
const ALARM_PIXEL_SPACING = 0.15   // centre-to-centre gap between pixels
const ALARM_PIXEL_SIZE    = 0.11   // pixel box side (world units)
// In-plane orientation of the grid on the lens. The debug cross only pinned the
// lens NORMAL (−Z), not which local axis is "up" vs "right". First pass rendered
// 90° clockwise vs the HubMatrixPanel, so the mapping is rotated 90° CCW to
// compensate: ROWS run along local X, COLUMNS along local Y (swapped from the
// obvious row→Y / col→X). hubMatrix is row-major (index 0 = top-left as the kid
// sees it). If it comes out upside-down (180°), flip BOTH signs; if mirrored,
// flip one. Verify with an ASYMMETRIC pattern (one corner), not a symmetric one.
const ALARM_ROW_DIR = -1  // local X direction for (row - 1)
const ALARM_COL_DIR = -1  // local Y direction for (col - 1)

const ALARM_PIXEL_COLOR     = '#ffd9b0'  // warm lit core
const ALARM_PIXEL_EMISSIVE  = 0xff6a2c   // amber, matches the cast glow
const ALARM_PIXEL_INTENSITY = 3.4        // emissiveIntensity while lit

const _matrixPos     = new THREE.Vector3()
const _matrixQuat    = new THREE.Quaternion()
const _lensDir       = new THREE.Vector3()   // local −Z, rotated into world (reused per frame)

// ── Debug: anchor-finding markers ───────────────────────────────────────────
// Flip on to drop a colour-coded cross of spheres in the matrix part's own
// (tilted) local frame, so we can eyeball which direction/offset lands on the
// real lens. The part's origin sits at the BACK of its housing (same as the
// cave car's 47592), so the lens is some walk along a local axis — these show
// which one. Calibrated: the lens is local −Z (cyan) → see ALARM_LENS_OFFSET.
const DEBUG_LIGHT_ANCHOR = false
const DEBUG_RADIUS       = 0.35   // world units each marker sits from the origin
// [local direction (respects tilt), colour, label reported to the user]
const DEBUG_MARKERS: { dir: [number, number, number]; color: number; label: string }[] = [
  { dir: [ 0,  0,  0], color: 0xffffff, label: 'WHITE  = part origin' },
  { dir: [ 1,  0,  0], color: 0xff0000, label: 'RED    = +X local' },
  { dir: [-1,  0,  0], color: 0xff8800, label: 'ORANGE = −X local' },
  { dir: [ 0,  1,  0], color: 0x00ff00, label: 'GREEN  = +Y local' },
  { dir: [ 0, -1,  0], color: 0xffff00, label: 'YELLOW = −Y local' },
  { dir: [ 0,  0,  1], color: 0x0066ff, label: 'BLUE   = +Z local' },
  { dir: [ 0,  0, -1], color: 0x00ffff, label: 'CYAN   = −Z local' },
]

/**
 * Finds the real "Color Light Matrix" LDraw part (47592) inside boat.mpd once it
 * loads, so the glow anchors to where the matrix is actually mounted rather than
 * a guessed offset from the boat's centre. Mirrors the cave's `findLightMatrixPart`.
 */
function findMatrixPart(model: THREE.Object3D): THREE.Object3D | null {
  let found: THREE.Object3D | null = null
  model.traverse((o) => {
    if (!found && /47592/i.test(o.name)) found = o
  })
  return found
}

/**
 * Parks `group` on the light-matrix lens each frame: the real 47592 part's world
 * pose (position + tilt) once boat.mpd has loaded, else a guess over the boat's
 * deck until then. Used for the pixel grid and the debug marker cross.
 */
function anchorGroupToLens(group: THREE.Object3D, s: BoatScenario): void {
  if (s.matrixPart) {
    s.matrixPart.getWorldPosition(_matrixPos)
    s.matrixPart.getWorldQuaternion(_matrixQuat)
    group.position.copy(_matrixPos)
    group.quaternion.copy(_matrixQuat)
  } else if (s.boat) {
    group.position.set(s.boat.position.x, s.boat.position.y + 0.6, s.boat.position.z)
    group.quaternion.identity()
  }
}

const SPEED_WU = SPEED_CM_S * WU_PER_CM
// Croc centre-Z for a given front-face gap (cm) to the sensor origin.
const centreZForGap = (gapCm: number) =>
  SENSOR_ORIGIN_Z - gapCm * WU_PER_CM - CROC_HALF.z
const START_Z  = centreZForGap(START_GAP_CM)
const ARRIVE_Z = centreZForGap(ARRIVE_CM)

/** Front-face gap (cm) from the sensor origin to the crocodile at centre-Z `z`. */
const gapCmFor = (z: number) => (SENSOR_ORIGIN_Z - (z + CROC_HALF.z)) * WORLD_TO_CM

interface BoatScenario {
  world:     RAPIER.World
  scene:     THREE.Scene
  crocBody:  RAPIER.RigidBody
  crocGroup: THREE.Group          // wrapper positioned each frame
  procCroc:  THREE.Group          // procedural fallback (swapped out if model loads)
  realCroc:  THREE.Group | null   // loaded coco.mpd, when available
  boat:      THREE.Group | null   // loaded boat.mpd, when available
  alarmLight: THREE.PointLight    // amber glow, lit while the hub matrix is on
  alarmGrid:  THREE.Group         // 3×3 pixel grid, anchored to the lens each frame
  alarmPixels: THREE.Mesh[]       // the 9 pixels, row-major (matches hubMatrix)
  matrixPart: THREE.Object3D | null // real 47592 part to anchor the glow (once boat.mpd loads)
  debugGroup: THREE.Group | null  // colour-coded anchor markers (DEBUG_LIGHT_ANCHOR)
  sky:       SkyDomeHandle        // daytime gradient dome + sun + clouds
  water:     THREE.Mesh           // animated wavy surface
  waterT:    number               // wave clock (seconds)
  riverMeshes: THREE.Mesh[]       // deep-water slab + sand banks
  props:     PropsHandle[]        // decorative LDraw props (palms, reeds, …)
  z:         number
  result:    ChallengeResult | null
  disposables: { dispose(): void }[]
}

// Single active scenario — setup() populates it, update()/reset()/evaluate()
// read it. Mirrors challenge-01's module-scoped constants; there is only ever
// one active level at a time.
let active: BoatScenario | null = null

/** Simple stand-in crocodile used until (or unless) the real coco.mpd loads. */
function buildProcCrocodile(): { group: THREE.Group; disposables: { dispose(): void }[] } {
  const group = new THREE.Group()
  const bodyGeo = new THREE.BoxGeometry(CROC_HALF.x * 2, CROC_HALF.y * 2, CROC_HALF.z * 2)
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#2E7D32' })
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.castShadow = true
  group.add(body)

  const snoutGeo = new THREE.BoxGeometry(CROC_HALF.x * 1.2, CROC_HALF.y * 1.1, CROC_HALF.z)
  const snoutMat = new THREE.MeshStandardMaterial({ color: '#43A047' })
  const snout = new THREE.Mesh(snoutGeo, snoutMat)
  snout.position.set(0, -0.05, CROC_HALF.z)
  snout.castShadow = true
  group.add(snout)

  const eyeGeo = new THREE.SphereGeometry(0.09, 8, 8)
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#111' })
  for (const dx of [-0.18, 0.18]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat)
    eye.position.set(dx, CROC_HALF.y, CROC_HALF.z * 0.3)
    group.add(eye)
  }

  return { group, disposables: [bodyGeo, bodyMat, snoutGeo, snoutMat, eyeGeo, eyeMat] }
}

export const challengeBoat = {
  id:          'challenge-boat',
  title:       '🐊 The crocodile and the boat',
  description:
    'The crocodile is approaching the boat. Program the boat to turn on the hub lights (the alarm!) as soon as the sensor detects it nearby, before it arrives.',
  difficulty:  2,
  tags:        ['sensors', 'lights'],
  robot:       'simple',
  // Like the real boat model (and SPIKE Essential): colour sensor only — the
  // distance sensor is a SPIKE Prime part this build doesn't carry.
  sensors:     { distance: false, color: true },
  // The crocodile decides the outcome, not the end of the kid's program.
  scenarioDecidesEnd: true,
  // The boat is anchored — driving blocks would only let kids break the scene.
  hiddenCategories: ['Movement', 'Motors'],
  // Drives the per-level loading screen (see levelAssets).
  decorModels: [COCO_MODEL, BOAT_MODEL, PALM_MODEL, REED_MODEL, ROCK_MODEL, FLOWER_MODEL],
  hints: [
    'Use "forever" with an "if… then" inside: that way the boat keeps watching without stopping',
    'The condition: "Sees the color green?" — the crocodile is green!',
    'When it detects it, show an image on the hub\'s 3×3 matrix: that\'s the alarm!',
  ],

  /**
   * Adds a water plane and a kinematic crocodile `START_GAP_CM` ahead of the
   * boat's sensor. The real LEGO models (coco.mpd, boat.mpd) are loaded async
   * and swapped in when available; a procedural crocodile and the SimpleRobot
   * hub stand in until then (or if a model isn't packed).
   */
  setup(engine: ChallengeEngine): ChallengeHandle {
    const { world, scene } = engine

    // Tropical daytime sky dome. Horizon matches the scene's fog/background
    // (#9fd8f2) so the palms/reeds fade into it — no need to touch scene.fog.
    // Zenith is a touch more cyan and it carries a few extra clouds vs the taxi
    // level, so the two opening levels don't share the exact same sky.
    const sky = buildSkyDome({
      zenith: '#2f8fd0',
      sun: { direction: [12, 16, -6], color: '#fff2cf', size: 8 },
      clouds: 8,
    })
    scene.add(sky.group)

    // River: a solid deep-water slab underneath, an animated translucent wave
    // surface on top (vertices displaced each frame in `ambient()`), and two
    // sand banks so the water reads as a river with shores for the props.
    const deepGeo = new THREE.PlaneGeometry(WATER_W, WATER_L)
    const deepMat = new THREE.MeshStandardMaterial({ color: '#1565C0', roughness: 0.6 })
    const deep = new THREE.Mesh(deepGeo, deepMat)
    deep.rotation.x = -Math.PI / 2
    deep.position.set(0, 0.01, WATER_Z)
    scene.add(deep)

    // The wave surface sits high enough that its deepest trough (base minus the
    // summed sine amplitudes, see ambient()) never dips under the deep slab —
    // otherwise the slab shows through as hard dark patches. flatShading makes
    // the moving low-poly facets catch the light (stylized water) instead of
    // relying on smooth normals, which read as a flat blue sheet.
    // Coarse segments on purpose: bigger facets tilt more per wave, so the
    // low-poly look stays visible from the default camera. The blue lives in
    // the per-vertex colours (updated with the heights in ambient()), so the
    // material colour stays white.
    const waterGeo = new THREE.PlaneGeometry(WATER_W, WATER_L, 22, 18)
    waterGeo.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(waterGeo.attributes.position.count * 3), 3),
    )
    const waterMat = new THREE.MeshStandardMaterial({
      vertexColors: true, transparent: true, opacity: 0.85, roughness: 0.35,
      metalness: 0.05, flatShading: true,
    })
    const water = new THREE.Mesh(waterGeo, waterMat)
    water.rotation.x = -Math.PI / 2
    water.position.set(0, WATER_BASE_Y, WATER_Z)
    water.receiveShadow = true
    scene.add(water)

    const sandGeo = new THREE.BoxGeometry(BANK_W, 0.12, WATER_L)
    const sandMat = new THREE.MeshStandardMaterial({ color: '#EED9A4', roughness: 1 })
    const riverMeshes: THREE.Mesh[] = [deep]
    for (const side of [-1, 1]) {
      const sand = new THREE.Mesh(sandGeo, sandMat)
      sand.position.set(side * BANK_X, 0.06, WATER_Z)
      sand.receiveShadow = true
      scene.add(sand)
      riverMeshes.push(sand)
    }

    // Decorative LEGO props on the banks (no colliders — invisible to sensors,
    // and every position keeps clear of the croc/boat lane at x ≈ 0).
    const props: PropsHandle[] = [
      placeProps(scene, PALM_MODEL, [
        { x: -7.5, z: -10, rotationY: 0.4 },
        { x: 7.2, z: -7, rotationY: 2.1, scale: 0.85 },
        { x: -7, z: 0, rotationY: 4.2, scale: 1.1 },
        { x: 7.6, z: 2, rotationY: 5.5, scale: 0.9 },
      ], { fitLongest: 2.2 }),
      placeProps(scene, REED_MODEL, [
        { x: 5.4, z: -12, y: 0.05 },
        { x: -5.5, z: -8, y: 0.05, rotationY: 1.8 },
        { x: 5.6, z: -1, y: 0.05, rotationY: 3.4 },
        { x: -5.3, z: 3, y: 0.05, rotationY: 0.9 },
      ], { fitLongest: 1.1 }),
      placeProps(scene, ROCK_MODEL, [
        { x: -8.7, z: -3.8, y: 0.12, rotationY: 0.7 },
        { x: 8.3, z: -11, y: 0.12, rotationY: 2.6, scale: 0.8 },
      ], { fitLongest: 1.1 }),
      placeProps(scene, FLOWER_MODEL, [
        { x: -7, z: 4.5, y: 0.12 },
        { x: 8, z: -4, y: 0.12, rotationY: 2.2 },
      ], { fitLongest: 1.3 }),
    ]

    // Wrapper group we move each frame; the crocodile visual lives inside it.
    const crocGroup = new THREE.Group()
    crocGroup.position.set(0, SENSOR_Y, START_Z)
    scene.add(crocGroup)
    const proc = buildProcCrocodile()
    crocGroup.add(proc.group)

    // Kinematic body so the sensor ray (castRay solid) detects it, but physics
    // never pushes it around — we drive its position from update().
    const crocBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, SENSOR_Y, START_Z),
    )
    const crocCollider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(CROC_HALF.x, CROC_HALF.y, CROC_HALF.z),
      crocBody,
    )
    // The crocodile is GREEN to the colour sensor — lets kids solve the level
    // with "¿Ve el color verde?" as an alternative to the distance reading.
    registerColliderColor(crocCollider.handle, 'GREEN')

    // Alarm glow — off until the kid lights the hub matrix (driven in ambient()).
    // Positioned each frame onto the real matrix part; parked over the boat's
    // deck until that part loads. A PointLight needs no dispose(); dispose()
    // just removes it from the scene.
    const alarmLight = new THREE.PointLight(ALARM_COLOR, 0, ALARM_DISTANCE, 2)
    alarmLight.name = 'boat-alarm-glow'
    alarmLight.position.set(0, 0.6, 0)
    alarmLight.visible = false
    scene.add(alarmLight)

    // Synthetic 3×3 pixel grid (mirrors the cave car's rig). Built in the part's
    // local frame; anchored to the 47592 lens (world pose, incl. tilt) each frame
    // in ambient(). Row-major so pixel index i maps 1:1 onto hubMatrix[i].
    const alarmGrid = new THREE.Group()
    alarmGrid.name = 'boat-alarm-grid'
    alarmGrid.visible = false
    const pixelGeo = new THREE.BoxGeometry(ALARM_PIXEL_SIZE, ALARM_PIXEL_SIZE, 0.02)
    const pixelMat = new THREE.MeshStandardMaterial({
      color: ALARM_PIXEL_COLOR,
      emissive: ALARM_PIXEL_EMISSIVE,
      emissiveIntensity: ALARM_PIXEL_INTENSITY,
      roughness: 0.2,
    })
    const alarmPixels: THREE.Mesh[] = []
    for (let i = 0; i < HUB_MATRIX_SIZE; i++) {
      const row = Math.floor(i / 3)
      const col = i % 3
      const pixel = new THREE.Mesh(pixelGeo, pixelMat)
      pixel.position.set(
        ALARM_ROW_DIR * (row - 1) * ALARM_PIXEL_SPACING,
        ALARM_COL_DIR * (col - 1) * ALARM_PIXEL_SPACING,
        ALARM_PIXEL_Z,
      )
      alarmGrid.add(pixel)
      alarmPixels.push(pixel)
    }
    scene.add(alarmGrid)

    active = {
      world, scene, crocBody, crocGroup,
      procCroc: proc.group,
      realCroc: null,
      boat: null,
      alarmLight,
      alarmGrid,
      alarmPixels,
      matrixPart: null,
      debugGroup: null,
      sky,
      water,
      waterT: 0,
      riverMeshes,
      props,
      z: START_Z,
      result: null,
      disposables: [waterGeo, waterMat, deepGeo, deepMat, sandGeo, sandMat, pixelGeo, pixelMat, ...proc.disposables],
    }

    // ── Upgrade to the real LEGO models when packed ──────────────────────────
    // Crocodile: swap the proc mesh for coco.mpd inside the wrapper.
    // Rest the crocodile in the water: -CROC_HALF.y puts its base at the water
    // line; the extra -0.05 dips it slightly in so it doesn't look suspended.
    // The collider stays centred on the sensor ray height, independent of this.
    void loadDecorModel(COCO_MODEL, { fitLongest: 1.8, bottomY: -CROC_HALF.y - 0.05 }).then((model) => {
      if (!model || !active || active.crocGroup !== crocGroup) {
        if (model) disposeDecorModel(model)
        return
      }
      crocGroup.remove(active.procCroc)
      proc.disposables.forEach((d) => d.dispose())
      crocGroup.add(model)
      active.realCroc = model
    })

    // Boat: hide the procedural robot (the sensor ray keeps firing) and drop
    // boat.mpd in its place as a scene prop resting on the water. Same reliable
    // path as the crocodile above.
    // flip (default) keeps it upright; rotationY spins the bow to face the
    // crocodile (−Z) instead of away.
    engine.robot.setVisualHidden?.(true)
    void loadDecorModel(BOAT_MODEL, { fitLongest: 3.2, bottomY: 0, rotationY: Math.PI }).then((model) => {
      if (!model || !active || active.crocGroup !== crocGroup) {
        if (model) disposeDecorModel(model)
        return
      }
      // Lift the boat so it floats higher (its sensor clears the crocodile)
      // instead of sitting sunk with the hull bottom at the water line.
      model.position.set(0, 0.25, 0)
      scene.add(model)
      active.boat = model
      // Anchor the alarm glow to the real light-matrix part if boat.mpd carries
      // it; otherwise ambient() keeps the fallback deck position.
      active.matrixPart = findMatrixPart(model)

      // Debug: drop the colour-coded marker cross so we can find the lens. The
      // group is placed at the part's world pose (position+tilt) each frame in
      // ambient() — or at the boat deck if the 47592 part wasn't found (which is
      // itself the diagnosis: the glow would be stuck on the deck fallback).
      if (DEBUG_LIGHT_ANCHOR) {
        console.log('[boat alarm debug] pieza 47592 encontrada:', !!active.matrixPart)
        const dbg = new THREE.Group()
        dbg.name = 'boat-alarm-debug'
        const geo = new THREE.SphereGeometry(0.06, 12, 12)
        for (const m of DEBUG_MARKERS) {
          const mat = new THREE.MeshBasicMaterial({ color: m.color, depthTest: false })
          const s = new THREE.Mesh(geo, mat)
          s.position.set(m.dir[0] * DEBUG_RADIUS, m.dir[1] * DEBUG_RADIUS, m.dir[2] * DEBUG_RADIUS)
          s.renderOrder = 999
          dbg.add(s)
          active.disposables.push(mat)
        }
        active.disposables.push(geo)
        scene.add(dbg)
        active.debugGroup = dbg
        console.log('[boat alarm debug] marcadores en la pieza 47592:\n' + DEBUG_MARKERS.map((m) => '  ' + m.label).join('\n'))
      }
    })

    const handle: ChallengeHandle = {
      // Wave animation: displace the water plane's vertices with three
      // overlapping sines. Runs every frame (even while editing blocks) and is
      // purely cosmetic — the physics world never sees the water.
      ambient(dt: number): void {
        const s = active
        if (!s) return
        s.waterT += dt
        const t = s.waterT
        // Amplitudes sum to WAVE_AMP — keep below WATER_BASE_Y minus the deep
        // slab height (0.01) so troughs never pierce the slab. Each vertex is
        // recoloured from its height: trough → crest → foam.
        const geo = s.water.geometry as THREE.PlaneGeometry
        const pos = geo.attributes.position
        const col = geo.attributes.color
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i)
          const y = pos.getY(i)
          const h =
            0.07 * Math.sin(1.6 * x + t * 1.7) +
            0.05 * Math.sin(2.3 * y + t * 1.1 + 1.3) +
            0.03 * Math.sin(0.9 * (x + y) + t * 2.3)
          pos.setZ(i, h)
          const u = (h + WAVE_AMP) / (2 * WAVE_AMP)   // 0 = deepest trough, 1 = highest crest
          if (u < 0.85) _waveColor.lerpColors(WATER_TROUGH, WATER_CREST, u / 0.85)
          else _waveColor.lerpColors(WATER_CREST, WATER_FOAM, (u - 0.85) / 0.15)
          col.setXYZ(i, _waveColor.r, _waveColor.g, _waveColor.b)
        }
        pos.needsUpdate = true
        col.needsUpdate = true
        // No computeVertexNormals(): flatShading derives face normals in-shader.

        // Alarm glow: track the real matrix part (falls back to the boat deck),
        // and blink while any hub pixel is lit. Cosmetic and panel-synced, so it
        // lives here in ambient() — the gameplay verdict stays in update().
        const matrix = useSimulationStore.getState().hubMatrix
        const hubLit = matrix.some((v) => v > 0)
        s.alarmLight.visible = hubLit
        if (hubLit) {
          if (s.matrixPart) {
            s.matrixPart.getWorldPosition(_matrixPos)
            s.matrixPart.getWorldQuaternion(_matrixQuat)
            // Local −Z, rotated into world, walks the light out to the lens face.
            _lensDir.set(0, 0, -1).applyQuaternion(_matrixQuat).multiplyScalar(ALARM_LENS_OFFSET)
            s.alarmLight.position.copy(_matrixPos).add(_lensDir)
          } else if (s.boat) {
            s.alarmLight.position.set(s.boat.position.x, s.boat.position.y + 0.6, s.boat.position.z)
          }
          s.alarmLight.intensity = ALARM_BASE + ALARM_PULSE * (0.5 + 0.5 * Math.sin(t * 7))
        }

        // Pixel grid: sits on the lens (part world pose incl. tilt; deck if the
        // part hasn't loaded), and shows EXACTLY the pixels the kid lit — index i
        // maps 1:1 onto hubMatrix[i] (both row-major). This is what makes the
        // in-scene matrix mirror the HubMatrixPanel pattern, like the cave car.
        anchorGroupToLens(s.alarmGrid, s)
        s.alarmGrid.visible = hubLit
        if (hubLit) {
          s.alarmPixels.forEach((pixel, i) => { pixel.visible = (matrix[i] ?? 0) > 0 })
        }

        // Debug markers ride the same lens pose (position + tilt) so the
        // colour-coded cross sits in its local frame — respects the incline.
        if (s.debugGroup) {
          anchorGroupToLens(s.debugGroup, s)
        }
      },

      update(dt: number): void {
        const s = active
        if (!s || s.result) return

        s.z = Math.min(s.z + SPEED_WU * dt, ARRIVE_Z)
        s.crocBody.setNextKinematicTranslation({ x: 0, y: SENSOR_Y, z: s.z })
        s.crocGroup.position.z = s.z

        const gapCm  = gapCmFor(s.z)
        const hubLit = useSimulationStore.getState().hubMatrix.some((v) => v > 0)

        if (gapCm <= DANGER_CM && hubLit) {
          s.result = {
            success: true,
            message: '🚨 You sounded the alarm in time! The crocodile got scared and left.',
          }
          useSimulationStore.getState().requestAutoStop()
        } else if (gapCm <= ARRIVE_CM) {
          s.result = {
            success: false,
            message: '🐊 The crocodile reached the boat. Turn on the lights when the sensor detects it nearby.',
          }
          useSimulationStore.getState().requestAutoStop()
        }
      },

      reset(): void {
        const s = active
        if (!s) return
        s.z = START_Z
        s.crocBody.setTranslation({ x: 0, y: SENSOR_Y, z: START_Z }, true)
        s.crocGroup.position.z = START_Z
        s.result = null
        // A hub matrix still lit from a previous run/level would leave the
        // alarm light showing on even though the croc hasn't been detected yet.
        useSimulationStore.getState().setHubMatrix(new Array(HUB_MATRIX_SIZE).fill(0))
      },

      dispose(): void {
        const s = active
        if (!s) return
        unregisterColliderColor(crocCollider.handle)
        s.world.removeRigidBody(s.crocBody)
        if (s.realCroc) disposeDecorModel(s.realCroc)
        if (s.boat) { s.scene.remove(s.boat); disposeDecorModel(s.boat) }
        s.scene.remove(s.alarmLight)
        s.scene.remove(s.alarmGrid)
        if (s.debugGroup) s.scene.remove(s.debugGroup)
        s.scene.remove(s.crocGroup)
        s.scene.remove(s.sky.group)
        s.sky.dispose()
        s.scene.remove(s.water)
        s.riverMeshes.forEach((m) => s.scene.remove(m))
        s.props.forEach((p) => p.dispose())
        s.disposables.forEach((d) => d.dispose())
        active = null
      },
    }
    return handle
  },

  /**
   * Reads the verdict latched by `update()` during the approach — evaluated at
   * the right moment, not at stop time. Falls back to a nudge if the student
   * stopped before the crocodile ever reached the danger zone.
   */
  evaluate(): ChallengeResult {
    return (
      active?.result ?? {
        success: false,
        message: 'Program the reaction and press Run: when the sensor detects the crocodile nearby, turn on the lights.',
      }
    )
  },
} satisfies LevelDefinition
