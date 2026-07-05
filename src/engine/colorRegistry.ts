/**
 * Maps Rapier collider handles to a detectable LEGO colour so the colour sensor
 * can answer "what colour is the thing my ray hit?". Scene objects that should
 * be colour-detectable (the crocodile, colour tiles, …) register themselves on
 * creation and unregister on dispose.
 *
 * Codes match the `sensor_sees_color` block's dropdown values.
 */
export type DetectableColor = 'RED' | 'GREEN' | 'BLUE' | 'YELLOW' | 'WHITE' | 'BLACK'

const colliderColors = new Map<number, DetectableColor>()

export function registerColliderColor(handle: number, color: DetectableColor): void {
  colliderColors.set(handle, color)
}

export function unregisterColliderColor(handle: number): void {
  colliderColors.delete(handle)
}

/** Colour registered for a collider handle, or null when it isn't detectable. */
export function colorForCollider(handle: number): DetectableColor | null {
  return colliderColors.get(handle) ?? null
}
