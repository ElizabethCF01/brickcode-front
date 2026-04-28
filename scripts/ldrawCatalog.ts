/**
 * Single source of truth for which LDraw parts BrickCode bundles.
 *
 * Adding a new part:
 *   1. Append an entry below.
 *   2. Run `npm run pack-ldraw` (requires LDRAW_LIB_PATH).
 *   3. Reference `public/ldraw/models/packed/<id>.mpd` from runtime code.
 */

export interface LDrawCatalogEntry {
  /** Internal id; becomes the filename of the packed .mpd. */
  id: string
  /** Path relative to the LDraw library root (most parts live in parts/). */
  file: string
  /** Human-readable description. */
  displayName: string
}

export const LDRAW_CATALOG: LDrawCatalogEntry[] = [
  { id: 'brick-2x4',       file: 'parts/3001.dat',  displayName: 'Brick 2×4' },
  { id: 'baseplate-32x32', file: 'parts/3811.dat',  displayName: 'Baseplate 32×32' },
  { id: 'wheel',           file: 'parts/3483.dat',  displayName: 'Wheel hub' },
  { id: 'hub-ev3',         file: 'parts/95646.dat', displayName: 'EV3 Intelligent Brick' },
  { id: 'motor-m',         file: 'parts/99455.dat', displayName: 'EV3 Medium Motor' },
  { id: 'motor-l',         file: 'parts/95658.dat', displayName: 'EV3 Large Motor' },
  { id: 'sensor-distance', file: 'parts/95652.dat', displayName: 'EV3 Ultrasonic Sensor' },
  { id: 'sensor-color',    file: 'parts/95650.dat', displayName: 'EV3 Color Sensor' },
  { id: 'beam-3',          file: 'parts/32523.dat', displayName: 'Technic Beam 3' },
  { id: 'beam-5',          file: 'parts/32316.dat', displayName: 'Technic Beam 5' },
]
