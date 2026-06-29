import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import StudentAuthGate from '../../src/simulator/StudentAuthGate'
import JoinClassModal from '../../src/simulator/JoinClassModal'

const { auth, rpc, from, setTeacher } = vi.hoisted(() => {
  let isT = false
  const auth = {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  }
  const rpc = vi.fn()
  const from = vi.fn(() => ({ select: () => ({ limit: () => Promise.resolve({ data: isT ? [{ id: 't' }] : [] }) }) }))
  return { auth, rpc, from, setTeacher: (v: boolean) => { isT = v } }
})
vi.mock('../../src/backend/supabaseClient', () => ({ getSupabase: () => ({ auth, rpc, from }) }))

describe('StudentAuthGate', () => {
  beforeEach(() => { vi.clearAllMocks(); setTeacher(false) })

  it('shows the student login when there is no session', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } })
    render(<StudentAuthGate><div>SIMULATOR</div></StudentAuthGate>)
    expect(await screen.findByPlaceholderText('alumno@escuela.es')).toBeTruthy()
    expect(screen.queryByText('SIMULATOR')).toBeNull()
  })

  it('rejects a teacher session (asks to log in as student)', async () => {
    setTeacher(true)
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 't' } } } })
    render(<StudentAuthGate><div>SIMULATOR</div></StudentAuthGate>)
    expect(await screen.findByText(/Inicia sesión como alumno/)).toBeTruthy()
    expect(screen.queryByText('SIMULATOR')).toBeNull()
  })

  it('renders the simulator for a student session', async () => {
    setTeacher(false)
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 's' } } } })
    render(<StudentAuthGate><div>SIMULATOR</div></StudentAuthGate>)
    await waitFor(() => expect(screen.getByText('SIMULATOR')).toBeTruthy())
  })
})

describe('JoinClassModal (enrollment)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls join_class with the upper-cased code + pseudonym, then onEnrolled', async () => {
    rpc.mockResolvedValue({ data: 'student-id', error: null })
    const onEnrolled = vi.fn()
    render(<JoinClassModal onEnrolled={onEnrolled} />)

    fireEvent.change(screen.getByPlaceholderText('ABC123'), { target: { value: 'c9mwjb' } })
    fireEvent.change(screen.getByPlaceholderText('Estrella7'), { target: { value: 'Estrella7' } })
    fireEvent.click(screen.getByText('Unirme'))

    await waitFor(() => expect(onEnrolled).toHaveBeenCalled())
    expect(rpc).toHaveBeenCalledWith('join_class', { p_class_code: 'C9MWJB', p_pseudonym: 'Estrella7' })
  })

  it('surfaces an invalid class code', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('invalid class code') })
    render(<JoinClassModal onEnrolled={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('ABC123'), { target: { value: 'NOPE12' } })
    fireEvent.click(screen.getByText('Unirme'))
    expect(await screen.findByText(/no válido/i)).toBeTruthy()
  })
})
