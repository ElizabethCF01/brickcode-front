import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getClassCode, setClassCode, getPseudonym, setNickname, hasJoinedClass } from '../../src/backend/identity'

describe('identity', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.unstubAllEnvs()
    // Neutralize any VITE_CLASS_CODE from the developer's .env.local so the
    // "nothing set" cases are deterministic.
    vi.stubEnv('VITE_CLASS_CODE', '')
  })

  it('returns null class code when nothing is set', () => {
    expect(getClassCode()).toBeNull()
    expect(hasJoinedClass()).toBe(false)
  })

  it('falls back to VITE_CLASS_CODE env', () => {
    vi.stubEnv('VITE_CLASS_CODE', 'ENVCODE')
    expect(getClassCode()).toBe('ENVCODE')
  })

  it('localStorage overrides the env fallback', () => {
    vi.stubEnv('VITE_CLASS_CODE', 'ENVCODE')
    setClassCode('LOCAL1')
    expect(getClassCode()).toBe('LOCAL1')
    expect(hasJoinedClass()).toBe(true)
  })

  it('generates and persists a pupil-xxxx pseudonym', () => {
    const p = getPseudonym()
    expect(p).toMatch(/^pupil-/)
    expect(getPseudonym()).toBe(p) // stable across calls
  })

  it('setNickname stores the nickname; empty falls back to generated', () => {
    setNickname('Estrella7')
    expect(getPseudonym()).toBe('Estrella7')
    setNickname('   ')
    expect(getPseudonym()).toMatch(/^pupil-/)
  })
})
