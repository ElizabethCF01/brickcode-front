import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'

// Scale: 1 world unit = 10 cm — see docs/architecture.md §Scale Convention.
const WORLD_TO_CM = 10

export interface SensorConfig {
  /** World-space origin of the sensor ray. Fixed in world space (not attached to a body). */
  position: THREE.Vector3
  /** Direction the sensor points. Will be normalised internally. */
  direction: THREE.Vector3
  /** Maximum sensing distance in **cm**. Returned by getValue() when no hit is found. */
  maxRange: number
}

export class LegoDistanceSensor {
  private value: number
  private readonly maxRange:   number         // cm
  private readonly maxRangeWU: number         // world units
  private readonly position:   THREE.Vector3  // world-space origin (fixed)
  private readonly direction:  THREE.Vector3  // normalised

  private readonly scene:   THREE.Scene
  private readonly rayLine: THREE.Line
  private readonly rayGeo:  THREE.BufferGeometry
  private readonly rayMat:  THREE.LineBasicMaterial

  constructor(config: SensorConfig, scene: THREE.Scene) {
    this.scene      = scene
    this.maxRange   = config.maxRange
    this.maxRangeWU = config.maxRange / WORLD_TO_CM
    this.value      = config.maxRange
    this.position   = config.position.clone()
    this.direction  = config.direction.clone().normalize()

    // Debug ray: a line from the sensor origin to the detected hit point.
    // Start both points at the origin; step() will move the second point each frame.
    const positions = new Float32Array([
      this.position.x, this.position.y, this.position.z,
      this.position.x + this.direction.x * this.maxRangeWU,
      this.position.y + this.direction.y * this.maxRangeWU,
      this.position.z + this.direction.z * this.maxRangeWU,
    ])
    this.rayGeo = new THREE.BufferGeometry()
    this.rayGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    this.rayMat  = new THREE.LineBasicMaterial({ color: '#ff0000' })
    this.rayLine = new THREE.Line(this.rayGeo, this.rayMat)
    this.rayLine.visible = false
    scene.add(this.rayLine)
  }

  /**
   * Current reading in **cm**.
   * Returns `maxRange` when no object is within range.
   */
  getValue(): number {
    return this.value
  }

  /**
   * Fire the ray against the Rapier world and update the cached value.
   * Call once per physics step, after `world.step()`.
   */
  step(world: RAPIER.World): void {
    const ray = new RAPIER.Ray(
      { x: this.position.x, y: this.position.y, z: this.position.z },
      { x: this.direction.x, y: this.direction.y, z: this.direction.z },
    )

    const hit = world.castRay(ray, this.maxRangeWU, /* solid */ true)

    // timeOfImpact is in world units along the normalised direction.
    const hitDistWU = hit !== null ? hit.timeOfImpact : this.maxRangeWU
    this.value = hitDistWU * WORLD_TO_CM

    // Update the debug ray end-point in place (avoids geometry recreation each frame).
    if (this.rayLine.visible) {
      const attr = this.rayGeo.attributes.position as THREE.BufferAttribute
      attr.setXYZ(
        1,
        this.position.x + this.direction.x * hitDistWU,
        this.position.y + this.direction.y * hitDistWU,
        this.position.z + this.direction.z * hitDistWU,
      )
      attr.needsUpdate = true
    }
  }

  /** Toggle the red debug ray visible in the 3D scene. */
  setDebugVisible(visible: boolean): void {
    this.rayLine.visible = visible
  }

  /** Remove debug visuals from the scene and free GPU memory. */
  dispose(): void {
    this.rayGeo.dispose()
    this.rayMat.dispose()
    this.scene.remove(this.rayLine)
  }
}
