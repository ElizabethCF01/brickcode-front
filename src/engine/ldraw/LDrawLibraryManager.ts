import * as THREE from 'three'
import { LDrawLoader } from 'three/addons/loaders/LDrawLoader.js'
import { LDrawConditionalLineMaterial } from 'three/addons/materials/LDrawConditionalLineMaterial.js'

/**
 * LDU → world units. 1 LDU = 0.4 mm; 1 WU = 10 cm = 250 LDU.
 * See docs/architecture.md "LDraw scale".
 */
const LDU_TO_WU = 1 / 250

/**
 * Semantic part keys → packed catalog id (filename of the `.mpd` under
 * `public/ldraw/models/packed/`). The packed files are produced by
 * `npm run pack-ldraw`; the source LDraw `.dat` ids live in
 * `scripts/ldrawCatalog.ts`.
 */
export const BRICKCODE_PARTS = {
  HUB_EV3:         'hub-ev3',          // 95646.dat — EV3 Intelligent Brick
  MOTOR_M:         'motor-m',          // 99455.dat — EV3 Medium Motor
  MOTOR_L:         'motor-l',          // 95658.dat — EV3 Large Motor
  SENSOR_DISTANCE: 'sensor-distance',  // 95652.dat — EV3 Ultrasonic Sensor
  SENSOR_COLOR:    'sensor-color',     // 95650.dat — EV3 Color Sensor
  WHEEL_LARGE:     'wheel',            // 3483.dat  — Technic Wheel hub
  BEAM_3:          'beam-3',           // 32523.dat — Technic Beam 3
  BEAM_5:          'beam-5',           // 32316.dat — Technic Beam 5
  BASEPLATE_32:    'baseplate-32x32',  // 3811.dat  — Baseplate 32×32
  BRICK_2X4:       'brick-2x4',        // 3001.dat  — Brick 2×4
} as const

export type PartKey = keyof typeof BRICKCODE_PARTS

const PACKED_BASE = '/ldraw/models/packed'

export class LDrawLibraryManager {
  private loader: LDrawLoader
  private cache: Map<PartKey, THREE.Group> = new Map()

  constructor() {
    this.loader = new LDrawLoader()
    this.loader.setConditionalLineMaterial(LDrawConditionalLineMaterial)
  }

  /**
   * Loads every entry in BRICKCODE_PARTS in parallel and stores a scaled
   * THREE.Group in the cache. `onProgress` fires once per completed part.
   */
  async preloadAll(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    const entries = Object.entries(BRICKCODE_PARTS) as [PartKey, string][]
    const total = entries.length
    let loaded = 0

    await Promise.all(
      entries.map(async ([key, id]) => {
        const url = `${PACKED_BASE}/${id}.mpd`
        const group = (await this.loader.loadAsync(url)) as THREE.Group
        group.scale.setScalar(LDU_TO_WU)
        this.cache.set(key, group)
        loaded += 1
        onProgress?.(loaded, total)
      }),
    )
  }

  /**
   * Returns a deep clone of the cached part. Mutations on the returned group
   * (transform, material) do not affect the cache or other clones.
   */
  getPart(key: PartKey, color?: number): THREE.Group {
    const cached = this.cache.get(key)
    if (!cached) {
      throw new Error(
        `LDrawLibraryManager: part "${key}" not preloaded. Call preloadAll() first.`,
      )
    }
    const clone = cached.clone(true)
    if (color !== undefined) this.applyColor(clone, color)
    return clone
  }

  /**
   * Replaces the material on every mesh inside `group` with the LDraw material
   * for `ldrawColorCode` (e.g. 4 = red, 14 = yellow, 15 = white).
   * No-op when the loader has no material registered for that code.
   */
  applyColor(group: THREE.Group, ldrawColorCode: number): void {
    const material = this.loader.getMaterial(String(ldrawColorCode))
    if (!material) return
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh) mesh.material = material
    })
  }

  dispose(): void {
    this.cache.forEach((group) => {
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.geometry?.dispose()
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat?.dispose()
      })
    })
    this.cache.clear()
  }
}
