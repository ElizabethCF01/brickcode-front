/**
 * Map known LDraw part filenames → semantic roles for robot reconstruction.
 *
 * This is the single source of truth for "which `.dat` is a hub vs motor vs
 * wheel". When we add support for new EV3 parts (or non-EV3 robotics kits),
 * extend this table.
 *
 * Anything not in the table is treated as `'structure'` — visual only, no
 * physics body, no special handling.
 */

export type PartRole =
  | 'hub'
  | 'motor_m'
  | 'motor_l'
  | 'wheel'
  | 'tyre'
  | 'sensor_distance'
  | 'sensor_color'
  | 'beam'
  | 'structure'

const ROLE_TABLE: Record<string, PartRole> = {
  // EV3 brain
  '95646.dat': 'hub',

  // EV3 motors
  '99455.dat': 'motor_m',
  '95658.dat': 'motor_l',

  // EV3 sensors
  '95652.dat': 'sensor_distance',
  '95650.dat': 'sensor_color',

  // Spike Essential / Powered Up — small 2-port hub with yellow bottom.
  // Studio export uses '67351-bl.dat' which we strip to the official id at
  // import time.
  '67351.dat':    'hub',
  '67351c01.dat': 'hub',
  '66757.dat':    'structure',  // Battery insert that pairs with 67351 — not a body

  // Spike Essential small angular motor (azure back). c01 = with coiled cable.
  '68488.dat':    'motor_m',
  '68488c01.dat': 'motor_m',

  // Wheels — drive wheels paired with motors. Tyres ride on top of these
  // and contribute to visuals only (no physics body of their own).
  '3483.dat':  'wheel',  // Technic wheel hub 17.5×6
  '3482.dat':  'tyre',
  '56908.dat': 'wheel',  // Technic wheel rim 30.4×20
  '41669.dat': 'tyre',   // Tyre 30.4×14 mounts on 56908
  '55013.dat': 'structure', // Axle joiner — not a wheel
  '41897.dat': 'structure', // Bush 1×2 — common motor-side bush

  // Spike Prime/Essential wheel with integral azure tyre (one piece).
  '65834p01.dat': 'wheel',

  // Wedge belt wheels are sometimes decorative belts and sometimes passive
  // caster wheels (front of spike-taxi). Mark as 'wheel' so the parser
  // creates a free-spinning physics body when unpaired with a motor.
  '4185.dat':  'wheel',  // Wedge belt wheel (front caster on spike-taxi)
  '2815.dat':  'tyre',   // Wedge belt wheel tyre — mounts on 4185
  '41239.dat': 'structure',

  // Common Technic structural pieces
  '2780.dat':  'structure',  // Technic pin
  '32140.dat': 'structure',  // Liftarm bent
  '43093.dat': 'structure',  // Axle pin
  '32278.dat': 'structure',  // Liftarm bent thick
  '99948.dat': 'structure',
  '92911.dat': 'structure',

  // Technic beams (structural only)
  '32523.dat': 'beam',
  '32316.dat': 'beam',
  '32525.dat': 'beam',
  '64179.dat': 'beam',
  '32524.dat': 'beam',
}

/** Look up the role for a part filename. Unknown parts get 'structure'. */
export function roleForPart(partFile: string): PartRole {
  return ROLE_TABLE[partFile.toLowerCase()] ?? 'structure'
}

/**
 * Approximate radius (in LDU) for known wheel parts. Used so the dynamic
 * cylinder collider matches the visual wheel size without needing geometry
 * inspection. Values from the LDraw library `.dat` headers; tuned by eye for
 * Studio 2.0 part variants that aren't in the official catalogue.
 */
export function wheelRadiusLDU(partFile: string): number {
  const f = partFile.toLowerCase()
  if (f === '3483.dat')     return 21.5  // wheel hub 17.5×6 (rim only)
  if (f === '56908.dat')    return 38    // wheel rim 30.4×20 — radius taken with tyre
  if (f === '65834p01.dat') return 44    // Spike wheel 14×35 with integral azure tyre
  if (f === '4185.dat')     return 22    // Wedge belt wheel + tyre 2815 ≈ 22 LDU
  if (f === '41239.dat')    return 18    // Wedge belt wheel (when used as wheel)
  return 20                              // safe default
}

/** Approximate half-width (along the axle) in LDU for known wheels. */
export function wheelHalfWidthLDU(partFile: string): number {
  const f = partFile.toLowerCase()
  if (f === '3483.dat')     return 8
  if (f === '56908.dat')    return 18    // 30.4×20 → half-width 10 + tyre 4 ≈ 14, leave a little extra
  if (f === '65834p01.dat') return 17.5  // 14 mm width → 35 LDU → half-width 17.5
  if (f === '4185.dat')     return 6
  if (f === '41239.dat')    return 6
  return 8
}
