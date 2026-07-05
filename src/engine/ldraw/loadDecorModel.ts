import * as THREE from 'three'
import { getLDrawManager } from './ldrawSingleton'

export interface DecorModelOptions {
  /** LDrawLoader models load upside-down; flip 180° around X. Default true. */
  flip?: boolean
  /** Extra rotation around Y (radians) to face the model the right way. Default 0. */
  rotationY?: number
  /** If set, uniformly scale so the longest horizontal side spans this many world units. */
  fitLongest?: number
  /**
   * If set, align the model's bottom (bbox min Y) to this Y within the group,
   * instead of centring vertically on the centroid. Use to rest a prop on a
   * surface (e.g. water) while keeping its detection collider elsewhere.
   */
  bottomY?: number
}

/**
 * Load a packed `.mpd` as a decorative, origin-centred scene prop (not a robot).
 *
 * Returns `null` instead of throwing when the LDraw manager is absent or the
 * model isn't packed yet, so callers can fall back to a procedural mesh. Pack a
 * source model with `LDRAW_LIB_PATH=… pnpm run pack-ldraw`.
 */
export async function loadDecorModel(
  url: string,
  opts: DecorModelOptions = {},
): Promise<THREE.Group | null> {
  const ldraw = getLDrawManager()
  if (!ldraw) return null
  try {
    const model = await ldraw.loadModel(url)
    if (opts.flip ?? true) model.rotation.x = Math.PI
    // Spin around WORLD Y (not local, which would compose with the flip into a
    // Z-flip and turn the model upside-down again) to change its heading.
    if (opts.rotationY) model.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), opts.rotationY)

    if (opts.fitLongest) {
      model.updateMatrixWorld(true)
      const size = new THREE.Vector3()
      new THREE.Box3().setFromObject(model).getSize(size)
      const longest = Math.max(size.x, size.z) || 1
      model.scale.multiplyScalar(opts.fitLongest / longest)
    }

    // Centre X/Z on the bounding box; align Y to `bottomY` (rest on a surface)
    // or centre it too, so callers can position the model like a point.
    model.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(model)
    const centre = new THREE.Vector3()
    box.getCenter(centre)
    model.position.x -= centre.x
    model.position.z -= centre.z
    model.position.y += opts.bottomY === undefined ? -centre.y : opts.bottomY - box.min.y

    model.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) m.castShadow = true
    })
    return model
  } catch (err) {
    console.warn(`[loadDecorModel] could not load ${url} (is it packed?):`, err)
    return null
  }
}

/** Dispose every mesh geometry/material under a loaded decor model. */
export function disposeDecorModel(group: THREE.Group): void {
  group.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.geometry?.dispose()
    const mat = m.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
    else mat?.dispose()
  })
}
