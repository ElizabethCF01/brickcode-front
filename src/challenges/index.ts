import { challenge01 } from './challenge-01'
import { challengeBoat } from './challenge-boat'
import type { Level, LevelDefinition } from './types'

export type { Level, LevelDefinition, LevelMeta, LevelCategory, LevelDifficulty } from './types'

/**
 * The level catalog, in display order. Playable levels carry `setup`/`evaluate`;
 * `comingSoon` entries are metadata-only placeholders that render in the grid but
 * can't be launched yet (their scene logic lands in a later level file).
 */
export const LEVELS: Level[] = [
  challenge01,
  challengeBoat,
  {
    id: 'challenge-cave',
    title: '🔦 El coche de la cueva',
    description:
      'El coche recorre una cueva oscura. Programa las luces del hub para iluminar el camino en el momento justo.',
    difficulty: 2,
    tags: ['lights'],
    hints: [],
    comingSoon: true,
  },
]

/** True when a level can actually be launched (has scene + success logic). */
export function isPlayable(level: Level): level is LevelDefinition {
  return 'setup' in level && typeof level.setup === 'function'
}

/** Look up a level by id (e.g. to restore the last-played level). */
export function getLevel(id: string): Level | undefined {
  return LEVELS.find((l) => l.id === id)
}
