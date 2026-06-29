import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AuthGate from '../../src/dashboard/AuthGate'

const { auth, from, setTeacher } = vi.hoisted(() => {
  let isT = false
  const auth = {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  }
  // currentUserIsTeacher() → from('teachers').select('id').limit(1)
  const from = vi.fn(() => ({ select: () => ({ limit: () => Promise.resolve({ data: isT ? [{ id: 't' }] : [] }) }) }))
  return { auth, from, setTeacher: (v: boolean) => { isT = v } }
})
vi.mock('../../src/backend/supabaseClient', () => ({ getSupabase: () => ({ auth, from }) }))

const renderGate = () =>
  render(
    <MemoryRouter><AuthGate><div>SECRET DASHBOARD</div></AuthGate></MemoryRouter>,
  )

describe('AuthGate (dashboard)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the login form when there is no session', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } })
    renderGate()
    expect(await screen.findByPlaceholderText('profe@escuela.es')).toBeTruthy()
    expect(screen.queryByText('SECRET DASHBOARD')).toBeNull()
  })

  it('renders the dashboard for a teacher session', async () => {
    setTeacher(true)
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 't' } } } })
    renderGate()
    await waitFor(() => expect(screen.getByText('SECRET DASHBOARD')).toBeTruthy())
  })

  it('rejects a student session (no teachers row) with a note', async () => {
    setTeacher(false)
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 's' } } } })
    renderGate()
    expect(await screen.findByText(/no es de profesor/i)).toBeTruthy()
    expect(screen.queryByText('SECRET DASHBOARD')).toBeNull()
  })
})
