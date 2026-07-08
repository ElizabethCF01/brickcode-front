import { describe, it, expect } from 'vitest'
import { buildRobotToolbox, filterToolboxCategories } from '../../src/blocks/definitions/robotBlocks'

type CategoryToolbox = { contents: Array<{ name?: string }> }

const names = (toolbox: unknown): Array<string | undefined> =>
  (toolbox as CategoryToolbox).contents.map((c) => c.name)

describe('filterToolboxCategories', () => {
  it('drops the named categories and keeps the rest in order', () => {
    const full = buildRobotToolbox(true, true)
    const filtered = filterToolboxCategories(full, ['Movement', 'Motors'])

    expect(names(filtered)).toEqual(['Events', 'Light', 'Sound', 'Sensors', 'Time'])
    // Pure: the source definition is untouched.
    expect(names(full)).toContain('Movement')
  })

  it('no-ops when nothing is hidden', () => {
    const full = buildRobotToolbox(true, true)
    expect(filterToolboxCategories(full)).toBe(full)
    expect(filterToolboxCategories(full, [])).toBe(full)
  })

  it('ignores names that do not match any category', () => {
    const full = buildRobotToolbox(false, true)
    const filtered = filterToolboxCategories(full, ['NoExiste'])
    expect(names(filtered)).toEqual(names(full))
  })
})
