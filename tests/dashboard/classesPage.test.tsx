import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ClassesPage from '../../src/dashboard/pages/ClassesPage'

vi.mock('../../src/backend/dashboardApi', () => ({
  listClasses: vi.fn().mockResolvedValue([
    { id: 'c1', name: 'Robótica 3ºA', classCode: 'C9MWJB', createdAt: '2026-06-27T10:00:00Z' },
  ]),
}))

describe('ClassesPage', () => {
  it('renders the teacher\'s classes with their codes', async () => {
    render(<MemoryRouter><ClassesPage /></MemoryRouter>)
    expect(await screen.findByText('Robótica 3ºA')).toBeTruthy()
    expect(screen.getByText('C9MWJB')).toBeTruthy()
  })
})
