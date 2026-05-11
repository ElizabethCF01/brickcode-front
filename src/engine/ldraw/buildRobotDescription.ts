import * as THREE from 'three'
import type { LDrawInstance } from './ldrParser'
import { roleForPart, wheelRadiusLDU, wheelHalfWidthLDU } from './partRoles'
import type {
  RobotDescription,
  WheelSpec,
  MotorDriveSpec,
  SensorSpec,
} from './RobotDescription'

/**
 * 1 LDU = 0.4 mm; 1 WU = 100 mm = 250 LDU.
 * Same constant as `LDrawLibraryManager`, kept local to avoid an import cycle.
 */
const LDU_TO_WU = 1 / 250

/**
 * Convert an LDraw type-1 line into a `THREE.Matrix4` in the Three.js frame
 * (Y-up). LDraw text is Y-down per spec; we apply a Y-only flip
 * (`F = diag(1,-1,1)`, equivalent to mirror across XZ-plane), which is what
 * `LDrawLoader` does internally — so positions computed here agree with
 * positions inside the loaded `THREE.Group`.
 */
export function ldrawInstanceToMatrix(instance: LDrawInstance): THREE.Matrix4 {
  const r = instance.rotation
  // F · R · F with F = diag(1,-1,1):
  //   R'[i][j] = R[i][j] * F[i][i] * F[j][j], F[1]=-1 elsewhere = 1.
  const fr = [
     r[0], -r[1],  r[2],
    -r[3],  r[4], -r[5],
     r[6], -r[7],  r[8],
  ]
  const m = new THREE.Matrix4()
  m.set(
    fr[0], fr[1], fr[2],  instance.position.x,
    fr[3], fr[4], fr[5], -instance.position.y,
    fr[6], fr[7], fr[8],  instance.position.z,
    0,     0,     0,     1,
  )
  return m
}

/** Approximate hub size used when no hub part is recognised. (WU) */
const FALLBACK_HUB_HALF = new THREE.Vector3(0.565, 0.56, 0.225)

/**
 * Build a `RobotDescription` from a parsed `.ldr`. All output coordinates are
 * hub-local in world units (Y-up).
 *
 * Algorithm:
 *  1. Find the hub instance (the first part with role 'hub'). Its transform
 *     defines the chassis frame; everything else is converted into hub-local.
 *  2. Convert each instance to a hub-local matrix.
 *  3. Classify by role: motors, wheels, sensors, beams (ignored), structure.
 *  4. Pair each motor with its nearest wheel (Euclidean in hub-local). Any
 *     wheel left unpaired becomes a caster.
 *  5. Estimate hub half-extents from the AABB of structural parts.
 *
 * If no hub is present, an error is thrown — the caller should fall back to
 * the procedural `SimpleRobot`.
 */
export function buildRobotDescription(parts: LDrawInstance[]): RobotDescription {
  // ── Locate the hub ─────────────────────────────────────────────────────────
  const hubIdx = parts.findIndex((p) => roleForPart(p.partFile) === 'hub')
  if (hubIdx < 0) {
    throw new Error('buildRobotDescription: no hub part found in the model.')
  }
  const hubInstance = parts[hubIdx]

  // World-space matrix of the hub. We express everything in a frame that's
  // **translated** to the hub but **axis-aligned with the world** (Y-up). We
  // do NOT use the hub's own rotation as the basis: if the hub is authored
  // upside-down in the .ldr (e.g. Rx(180°)), expressing wheels in the hub's
  // own frame gives "wheel below hub" hub-locally but "wheel above hub" in the
  // world — which is what physics actually sees. The world-aligned offset
  // sidesteps that.
  const hubWorldMatrix = ldrawInstanceToMatrix(hubInstance)
  const hubWorldPos = new THREE.Vector3().setFromMatrixPosition(hubWorldMatrix)
  const hubWorldQuat = new THREE.Quaternion()
  hubWorldMatrix.decompose(new THREE.Vector3(), hubWorldQuat, new THREE.Vector3())
  // Hub's local +Y mapped into world: if its world-Y is negative, the hub is
  // upside-down → the loaded visual model needs an Rx(π) flip to align.
  const hubWorldUp = new THREE.Vector3(0, 1, 0).applyQuaternion(hubWorldQuat)
  const chassisFlipped = hubWorldUp.y < 0

  // ── Convert every part to a world-aligned, hub-translated frame ────────────
  interface Entry {
    index: number
    instance: LDrawInstance
    role: ReturnType<typeof roleForPart>
    /** Position in WU, world axes, origin at hub. */
    localPos: THREE.Vector3
    /** Part's world-space orientation (axes match world). */
    worldQuat: THREE.Quaternion
  }
  const entries: Entry[] = parts.map((inst, index) => {
    const worldM = ldrawInstanceToMatrix(inst)
    const worldPos = new THREE.Vector3().setFromMatrixPosition(worldM)
    const worldQuat = new THREE.Quaternion()
    worldM.decompose(new THREE.Vector3(), worldQuat, new THREE.Vector3())
    // Offset from hub, scaled to WU. No rotation applied — axes stay world.
    const localPos = worldPos.clone().sub(hubWorldPos).multiplyScalar(LDU_TO_WU)
    return {
      index,
      instance: inst,
      role: roleForPart(inst.partFile),
      localPos,
      worldQuat,
    }
  })

  // ── Classify ───────────────────────────────────────────────────────────────
  const motorEntries  = entries.filter((e) => e.role === 'motor_m' || e.role === 'motor_l')
  const wheelEntries  = entries.filter((e) => e.role === 'wheel')
  const sensorEntries = entries.filter((e) => e.role === 'sensor_distance' || e.role === 'sensor_color')

  // ── Build WheelSpec for every wheel ────────────────────────────────────────
  // Wheel axle: LDraw wheel parts (3483 et al.) are authored axle-along-Y
  // in the part's local frame. To find the axle in hub-local space we apply
  // the wheel's world rotation to (0,1,0) and snap to the nearest world axis
  // (X or Z) — Y itself would mean the wheel is lying flat and is not a
  // driven wheel for our purposes. This handles speed-bot (axle along Z)
  // and the original procedural robot (axle along X) without hardcoding.
  const snapToHorizontalAxis = (v: THREE.Vector3): THREE.Vector3 => {
    const ax = Math.abs(v.x), az = Math.abs(v.z)
    return ax >= az
      ? new THREE.Vector3(Math.sign(v.x) || 1, 0, 0)
      : new THREE.Vector3(0, 0, Math.sign(v.z) || 1)
  }

  const allWheels: (WheelSpec & { entry: Entry })[] = wheelEntries.map((e) => {
    const localAxle = new THREE.Vector3(0, 1, 0).applyQuaternion(e.worldQuat)
    const axis = snapToHorizontalAxis(localAxle)
    return {
      centreLocal: e.localPos.clone(),
      radius:      wheelRadiusLDU(e.instance.partFile) * LDU_TO_WU,
      halfWidth:   wheelHalfWidthLDU(e.instance.partFile) * LDU_TO_WU,
      axisLocal:   axis,
      partIndex:   e.index,
      entry:       e,
    }
  })

  // ── Pair each motor with its nearest wheel ─────────────────────────────────
  const usedWheelIndices = new Set<number>()
  const motors: MotorDriveSpec[] = motorEntries.map((m) => {
    let best: typeof allWheels[number] | null = null
    let bestDist = Infinity
    for (const w of allWheels) {
      if (usedWheelIndices.has(w.partIndex)) continue
      const d = w.centreLocal.distanceTo(m.localPos)
      if (d < bestDist) {
        bestDist = d
        best = w
      }
    }
    if (!best) {
      throw new Error(
        `buildRobotDescription: motor at ${m.localPos.toArray()} has no wheel within range.`,
      )
    }
    usedWheelIndices.add(best.partIndex)

    // Motor axle must match the wheel's snapped axle — the revolute joint
    // constrains both bodies to a shared axis.
    return {
      anchorLocal: best.centreLocal.clone(),  // joint anchored at wheel centre
      axisLocal:   best.axisLocal.clone(),
      wheel:       { ...best },               // strip the `entry` field
      motorType:   m.role === 'motor_l' ? 'L' : 'M',
    }
  })

  const casters: WheelSpec[] = allWheels
    .filter((w) => !usedWheelIndices.has(w.partIndex))
    .map((w) => ({
      centreLocal: w.centreLocal,
      radius:      w.radius,
      halfWidth:   w.halfWidth,
      axisLocal:   w.axisLocal,
      partIndex:   w.partIndex,
    }))

  // ── Sensors ────────────────────────────────────────────────────────────────
  // LDraw sensors point along their local −Z (lens face after the loader's
  // Y-flip). Studio exports of EV3 sensors follow this convention. Direction
  // is computed in world axes (matches the world-aligned frame we use here).
  const sensors: SensorSpec[] = sensorEntries.map((s) => ({
    kind:           s.role === 'sensor_color' ? 'color' : 'distance',
    originLocal:    s.localPos.clone(),
    directionLocal: new THREE.Vector3(0, 0, -1).applyQuaternion(s.worldQuat).normalize(),
    partIndex:      s.index,
  }))

  // ── Hub half-extents from structural AABB ──────────────────────────────────
  // Take all entries that aren't wheels/casters/sensors (so beams + structure
  // + the hub itself contribute) and compute the AABB in hub-local.
  const structuralRoles = new Set<ReturnType<typeof roleForPart>>([
    'hub', 'motor_m', 'motor_l', 'beam', 'structure',
  ])
  const aabb = new THREE.Box3()
  let aabbHasPoints = false
  for (const e of entries) {
    if (!structuralRoles.has(e.role)) continue
    aabb.expandByPoint(e.localPos)
    aabbHasPoints = true
  }
  // Add a margin so the cuboid encompasses parts, not just their origins.
  // When the AABB has points we trust it directly — forcing a fallback
  // minimum here used to inflate the cuboid past the wheel positions, which
  // (a) overlapped the wheel colliders and (b) pushed the chassis below the
  // floor. Fallback is only used when no structural points were found.
  const HALF_MARGIN = 0.15
  let hubHalfExtents: THREE.Vector3
  if (aabbHasPoints) {
    const size = new THREE.Vector3()
    aabb.getSize(size)
    hubHalfExtents = new THREE.Vector3(
      size.x / 2 + HALF_MARGIN,
      size.y / 2 + HALF_MARGIN,
      size.z / 2 + HALF_MARGIN,
    )
  } else {
    hubHalfExtents = FALLBACK_HUB_HALF.clone()
  }

  return {
    hubHalfExtents,
    motors,
    casters,
    sensors,
    hubPartIndex: hubIdx,
    partCount:    parts.length,
    chassisFlipped,
  }
}
