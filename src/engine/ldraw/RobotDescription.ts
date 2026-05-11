/**
 * Engine-friendly description of a robot, derived from a parsed `.ldr`.
 *
 * All vectors and quaternions are in **hub-local space** (hub centre at
 * origin, hub frame already converted from LDraw Y-down to Three.js Y-up
 * and scaled from LDU to world units). Consumers (`DynamicRobot`) use this
 * directly to build Rapier bodies and Three.js meshes — there is no further
 * coordinate juggling.
 */

import type * as THREE from 'three'

export interface MotorDriveSpec {
  /** Hub-local position of the motor body's anchor (joint origin). */
  anchorLocal:    THREE.Vector3
  /** Joint axis in hub-local space, unit-length. */
  axisLocal:      THREE.Vector3
  /** Wheel paired with this motor (driven via revolute joint). */
  wheel:          WheelSpec
  /** 'M' or 'L' — for now informational only; both behave the same physically. */
  motorType:      'M' | 'L'
}

export interface WheelSpec {
  /** Hub-local position of the wheel centre. */
  centreLocal: THREE.Vector3
  /** Cylinder radius in world units. */
  radius:      number
  /** Cylinder half-width along axle in world units. */
  halfWidth:   number
  /** Hub-local axle direction, unit-length. Same orientation as the rim part. */
  axisLocal:   THREE.Vector3
  /**
   * Index of the part instance in the original parsed list — used by
   * `DynamicRobot` to find the LDrawLoader sub-Group corresponding to this
   * wheel and re-parent it to the wheel's own physics body.
   */
  partIndex:   number
}

export interface SensorSpec {
  kind:           'distance' | 'color'
  /** Hub-local position of the sensor's lens / ray origin. */
  originLocal:    THREE.Vector3
  /** Hub-local ray direction, unit-length (already normalised). */
  directionLocal: THREE.Vector3
  /** Index in the original parsed list (for visual extraction). */
  partIndex:      number
}

export interface RobotDescription {
  /** Hub half-extents (X,Y,Z) in WU — used for the chassis cuboid collider. */
  hubHalfExtents: THREE.Vector3
  /** Driven motors (left/right symmetry decided downstream by sign of X). */
  motors:         MotorDriveSpec[]
  /** Wheels NOT paired to a motor (casters / passive). */
  casters:        WheelSpec[]
  /** Sensors found on the chassis. May be empty. */
  sensors:        SensorSpec[]
  /**
   * The hub instance's part index — `DynamicRobot` uses this so the imported
   * model's hub mesh can stay as a child of the chassis Group while wheel /
   * sensor meshes are extracted and reparented to their own bodies.
   */
  hubPartIndex:   number
  /** Total parts in the parsed list — for index validation. */
  partCount:      number
  /**
   * True when the source `.ldr` was authored with the hub upside-down relative
   * to the simulator's Y-up convention. Detected by looking at whether wheels
   * end up above the hub centre. Consumers must apply a 180° X-flip to the
   * loaded visual model when this is true; the description's vectors are
   * already corrected.
   */
  chassisFlipped: boolean
}
