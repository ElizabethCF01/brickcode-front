import * as THREE from 'three'
import { loadDecorModel, disposeDecorModel, type DecorModelOptions } from './loadDecorModel'

/** Where (and how) to drop one instance of a decor prop in the scene. */
export interface PropPlacement {
  x: number
  z: number
  /** Ground height for the prop's base. Default 0 (the floor). */
  y?: number
  /** Heading of this instance (radians around Y). Default 0. */
  rotationY?: number
  /** Per-instance uniform scale on top of the model's `fitLongest`. Default 1. */
  scale?: number
}

export interface PropsHandle {
  dispose(): void
}

/**
 * Scatter a packed `.mpd` decor model at several spots in the scene.
 *
 * The model is loaded once and cloned per placement (clones share geometry and
 * materials, so `dispose()` frees them once via the original). Props are pure
 * visuals: no Rapier bodies, invisible to the distance and colour sensors.
 *
 * Like `loadDecorModel`, this never throws — if the model isn't packed or the
 * LDraw manager is absent (e.g. headless tests), it quietly places nothing.
 */
export function placeProps(
  scene: THREE.Scene,
  url: string,
  placements: PropPlacement[],
  opts: DecorModelOptions = {},
): PropsHandle {
  const wrappers: THREE.Group[] = []
  let original: THREE.Group | null = null
  let disposed = false

  void loadDecorModel(url, { bottomY: 0, ...opts }).then((model) => {
    if (!model) return
    if (disposed) {
      disposeDecorModel(model)
      return
    }
    original = model
    for (const p of placements) {
      const instance = wrappers.length === 0 ? model : model.clone()
      const wrapper = new THREE.Group()
      wrapper.add(instance)
      wrapper.position.set(p.x, p.y ?? 0, p.z)
      wrapper.rotation.y = p.rotationY ?? 0
      if (p.scale !== undefined) wrapper.scale.setScalar(p.scale)
      scene.add(wrapper)
      wrappers.push(wrapper)
    }
  })

  return {
    dispose(): void {
      disposed = true
      wrappers.forEach((w) => scene.remove(w))
      wrappers.length = 0
      // Clones share the original's geometries/materials — one pass frees all.
      if (original) disposeDecorModel(original)
      original = null
    },
  }
}
