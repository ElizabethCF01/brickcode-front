import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { useSimulationStore } from '../store/simulationStore'
import { loadDecorModel, disposeDecorModel } from '../engine/ldraw/loadDecorModel'
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
  title:       '🐊 El cocodrilo y el bote',
  description:
    'El cocodrilo se acerca al bote. Programa el bote para que encienda las luces del hub (¡la alarma!) en cuanto el sensor lo detecte cerca, antes de que llegue.',
  difficulty:  2,
  tags:        ['sensors', 'lights'],
  robot:       'simple',
  // Like the real boat model (and SPIKE Essential): colour sensor only — the
  // distance sensor is a SPIKE Prime part this build doesn't carry.
  sensors:     { distance: false, color: true },
  // The crocodile decides the outcome, not the end of the kid's program.
  scenarioDecidesEnd: true,
  // The boat is anchored — driving blocks would only let kids break the scene.
  hiddenCategories: ['Movimiento', 'Motores'],
  // Drives the per-level loading screen (see levelAssets).
  decorModels: [COCO_MODEL, BOAT_MODEL, PALM_MODEL, REED_MODEL, ROCK_MODEL, FLOWER_MODEL],
  hints: [
    'Usa "por siempre" con un "si… entonces" dentro: así el bote vigila sin parar',
    'La condición: "¿Ve el color verde?" — ¡el cocodrilo es verde!',
    'Cuando lo detecte, muestra una imagen en la matriz 3×3 del hub: ¡esa es la alarma!',
  ],

  /**
   * Adds a water plane and a kinematic crocodile `START_GAP_CM` ahead of the
   * boat's sensor. The real LEGO models (coco.mpd, boat.mpd) are loaded async
   * and swapped in when available; a procedural crocodile and the SimpleRobot
   * hub stand in until then (or if a model isn't packed).
   */
  setup(engine: ChallengeEngine): ChallengeHandle {
    const { world, scene } = engine

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

    active = {
      world, scene, crocBody, crocGroup,
      procCroc: proc.group,
      realCroc: null,
      boat: null,
      water,
      waterT: 0,
      riverMeshes,
      props,
      z: START_Z,
      result: null,
      disposables: [waterGeo, waterMat, deepGeo, deepMat, sandGeo, sandMat, ...proc.disposables],
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
            message: '🚨 ¡Sonaste la alarma a tiempo! El cocodrilo se asustó y se fue.',
          }
          useSimulationStore.getState().requestAutoStop()
        } else if (gapCm <= ARRIVE_CM) {
          s.result = {
            success: false,
            message: '🐊 El cocodrilo llegó al bote. Enciende las luces cuando el sensor lo detecte cerca.',
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
      },

      dispose(): void {
        const s = active
        if (!s) return
        unregisterColliderColor(crocCollider.handle)
        s.world.removeRigidBody(s.crocBody)
        if (s.realCroc) disposeDecorModel(s.realCroc)
        if (s.boat) { s.scene.remove(s.boat); disposeDecorModel(s.boat) }
        s.scene.remove(s.crocGroup)
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
        message: 'Programa la reacción y pulsa Ejecutar: cuando el sensor detecte al cocodrilo cerca, enciende las luces.',
      }
    )
  },
} satisfies LevelDefinition
