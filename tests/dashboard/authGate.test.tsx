import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AuthGate from '../../src/dashboard/AuthGate'

const auth = {
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
}
vi.mock('../../src/backend/supabaseClient', () => ({ getSupabase: () => ({ auth }) }))

const renderGate = () =>
  render(
    <MemoryRouter>
      <AuthGate><div>SECRET DASHBOARD</div></AuthGate>
    </MemoryRouter>,
  )

describe('AuthGate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the login form when there is no session', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } })
    renderGate()
    expect(await screen.findByText(/Profesor/)).toBeTruthy()
    expect(screen.queryByText('SECRET DASHBOARD')).toBeNull()
  })

  it('renders children when authenticated', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'x' } } } })
    renderGate()
    await waitFor(() => expect(screen.getByText('SECRET DASHBOARD')).toBeTruthy())
  })
})
