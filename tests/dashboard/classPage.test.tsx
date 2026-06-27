import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ClassPage from '../../src/dashboard/pages/ClassPage'

vi.mock('../../src/backend/dashboardApi', () => ({
  listClasses: vi.fn().mockResolvedValue([
    { id: 'c1', name: 'Robótica 3ºA', classCode: 'C9MWJB', createdAt: '2026-06-27T10:00:00Z' },
  ]),
  getClassEventStats: vi.fn().mockResolvedValue([
    {
      studentId: 's1', pseudonym: 'Estrella7', runCount: 4, failureCount: 1,
      blockFrequency: { robot_move_for: 3, robot_turn: 2 },
    },
  ]),
}))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="classes/:classId" element={<ClassPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ClassPage', () => {
  it('renders per-student stats and the block-frequency chips (SQL aggregate)', async () => {
    renderAt('/classes/c1')
    // class header from listClasses
    expect(await screen.findByText('Robótica 3ºA')).toBeTruthy()
    // student + counts from getClassEventStats
    expect(screen.getByText('Estrella7')).toBeTruthy()
    expect(screen.getByText('4')).toBeTruthy() // run count
    // block-frequency chips — the DS payoff, top blocks descending
    expect(screen.getByText('robot_move_for ×3')).toBeTruthy()
    expect(screen.getByText('robot_turn ×2')).toBeTruthy()
  })
})
