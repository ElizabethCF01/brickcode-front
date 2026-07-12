import { describe, it, expect } from 'vitest'
import { levelAssets } from '../../src/challenges/levelAssets'
import { challenge01 } from '../../src/challenges/challenge-01'
import { challengeBoat } from '../../src/challenges/challenge-boat'
import { challengeCave } from '../../src/challenges/challenge-cave'

// The SimpleRobot part kit — always preloaded (imported-robot levels fall back
// to a SimpleRobot on import failure, and getPart throws on cache misses).
const ROBOT_PARTS = ['HUB_EV3', 'MOTOR_M', 'WHEEL_LARGE', 'WHEEL_TIRE', 'SENSOR_DISTANCE']

const TAXI = '/ldraw/models/packed/spike-taxi.mpd'

describe('levelAssets', () => {
  it('cave level: robot parts + its own decor models, nothing else', () => {
    const { parts, models } = levelAssets(challengeCave, TAXI)
    expect(parts).toEqual(ROBOT_PARTS)
    // robot: 'simple' → the imported taxi model is NOT loaded.
    expect(models).toEqual([
      '/ldraw/models/packed/cave_car.mpd',
      '/ldraw/models/packed/rock-big.mpd',
      '/ldraw/models/packed/tree-pine.mpd',
      '/ldraw/models/packed/bat.mpd',
    ])
  })

  it('boat level: robot parts + the six river decor models', () => {
    const { parts, models } = levelAssets(challengeBoat, TAXI)
    expect(parts).toEqual(ROBOT_PARTS)
    expect(models).toHaveLength(6)
    expect(models).toContain('/ldraw/models/packed/coco.mpd')
    expect(models).toContain('/ldraw/models/packed/boat.mpd')
  })

  it('imported-robot level adds the packed model and derives its source .ldr', () => {
    const { models } = levelAssets(challenge01, TAXI)
    expect(models[0]).toBe(TAXI)
    expect(models[1]).toBe('/ldraw/models/source/spike-taxi.ldr')
    expect(models.slice(2)).toEqual(challenge01.decorModels)
  })

  it('imported-robot level without env model falls back to decor only', () => {
    const { parts, models } = levelAssets(challenge01, null)
    expect(parts).toEqual(ROBOT_PARTS)
    expect(models).toEqual(challenge01.decorModels)
  })

  it('respects an explicit source URL over derivation', () => {
    const { models } = levelAssets(challenge01, TAXI, '/custom/source.ldr')
    expect(models[1]).toBe('/custom/source.ldr')
  })
})
