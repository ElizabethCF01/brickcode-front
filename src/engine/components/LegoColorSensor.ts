import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { colorForCollider, type DetectableColor } from '../colorRegistry'

// Scale: 1 world unit = 10 cm — see docs/architecture.md §Scale Convention.
const WORLD_TO_CM = 10

export interface ColorSensorConfig {
  /** World-space origin of the sensor ray (updated per frame when mounted on a body). */
  position: THREE.Vector3
  /** Direction the sensor points. Normalised internally. */
  direction: THREE.Vector3
  /**
   * Maximum sensing distance in **cm**. Real SPIKE colour sensors only read at
   * short range; keep this well under the distance sensor's range so "seeing a
   * colour" means the object is genuinely close.
   */
  maxRange: number
}

/**
 * Software model of the SPIKE colour sensor. Casts a ray (like
 * `LegoDistanceSensor`) and reports the registered colour of the hit collider
 * (see `colorRegistry`) instead of a distance. Purely physics + state — no
 * visual body; the robot model already shows the sensor piece.
 */
export class LegoColorSensor {
  private value: DetectableColor | null = null
  private readonly maxRangeWU: number
  private readonly position:   THREE.Vector3
  private readonly direction:  THREE.Vector3

  constructor(config: ColorSensorConfig) {
    this.maxRangeWU = config.maxRange / WORLD_TO_CM
    this.position   = config.position.clone()
    this.direction  = config.direction.clone().normalize()
  }

  /** Colour of the object in front of the sensor, or null when none in range. */
  getColor(): DetectableColor | null {
    return this.value
  }

  /** True when the sensed colour equals `color` (the block's dropdown value). */
  sees(color: string): boolean {
    return this.value !== null && this.value === color
  }

  /** Fire the ray and refresh the cached colour. Call once per physics step. */
  step(world: RAPIER.World): void {
    const ray = new RAPIER.Ray(
      { x: this.position.x, y: this.position.y, z: this.position.z },
      { x: this.direction.x, y: this.direction.y, z: this.direction.z },
    )
    const hit = world.castRay(ray, this.maxRangeWU, /* solid */ true)
    this.value = hit !== null ? colorForCollider(hit.collider.handle) : null
  }

  /** Move the ray origin; call each frame when mounted on a moving body. */
  setWorldPosition(pos: THREE.Vector3): void {
    this.position.copy(pos)
  }

  /** No owned resources (no mesh, no body) — present to honour the project rule. */
  dispose(): void {
    this.value = null
  }
}
