import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ClassesPage from '../../src/dashboard/pages/ClassesPage'
import { listClasses, createClass } from '../../src/backend/dashboardApi'

vi.mock('../../src/backend/dashboardApi', () => ({
  listClasses: vi.fn(),
  createClass: vi.fn(),
}))

describe('ClassesPage', () => {
  it('renders the teacher\'s classes with their codes', async () => {
    vi.mocked(listClasses).mockResolvedValue([
      { id: 'c1', name: 'Robótica 3ºA', classCode: 'C9MWJB', createdAt: '2026-06-27T10:00:00Z' },
    ])
    render(<MemoryRouter><ClassesPage /></MemoryRouter>)
    expect(await screen.findByText('Robótica 3ºA')).toBeTruthy()
    expect(screen.getByText('C9MWJB')).toBeTruthy()
  })

  it('creates a class and shows it (with its generated code) afterward', async () => {
    // empty first, then the created class on the post-create refetch
    vi.mocked(listClasses)
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ id: 'c2', name: 'Nueva Clase', classCode: 'ABC123', createdAt: '2026-06-28T10:00:00Z' }])
    vi.mocked(createClass).mockResolvedValue({ id: 'c2', name: 'Nueva Clase', classCode: 'ABC123', createdAt: '2026-06-28T10:00:00Z' })

    render(<MemoryRouter><ClassesPage /></MemoryRouter>)
    await screen.findByText(/Aún no tienes clases/)

    fireEvent.change(screen.getByPlaceholderText(/Nombre de la clase/), { target: { value: 'Nueva Clase' } })
    fireEvent.click(screen.getByText('Crear clase'))

    expect(createClass).toHaveBeenCalledWith('Nueva Clase')
    await waitFor(() => expect(screen.getByText('Nueva Clase')).toBeTruthy())
    expect(screen.getByText('ABC123')).toBeTruthy()
  })
})
