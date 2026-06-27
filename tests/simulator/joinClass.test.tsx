import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import JoinClassModal from '../../src/simulator/JoinClassModal'
import { getClassCode, getPseudonym } from '../../src/backend/identity'

const flush = vi.fn()
vi.mock('../../src/backend/BackendSync', () => ({ getBackendSync: () => ({ flush }) }))

describe('JoinClassModal', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.stubEnv('VITE_CLASS_CODE', '') // ignore the dev .env.local fallback
  })

  it('persists the class code (upper-cased) + nickname and flushes', () => {
    const onClose = vi.fn()
    render(<JoinClassModal onClose={onClose} />)

    fireEvent.change(screen.getByPlaceholderText('ABC123'), { target: { value: 'c9mwjb' } })
    fireEvent.change(screen.getByLabelText(/Apodo/i), { target: { value: 'Estrella7' } })
    fireEvent.click(screen.getByText('Unirme'))

    expect(getClassCode()).toBe('C9MWJB')
    expect(getPseudonym()).toBe('Estrella7')
    expect(flush).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('does nothing on empty code', () => {
    const onClose = vi.fn()
    render(<JoinClassModal onClose={onClose} />)
    fireEvent.click(screen.getByText('Unirme'))
    expect(getClassCode()).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })
})
