import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Home from '../src/Home'

describe('Home', () => {
  it('shows the title and a teacher login link to /dashboard', () => {
    render(<MemoryRouter><Home /></MemoryRouter>)
    expect(screen.getByText(/BrickCode/)).toBeTruthy()
    const link = screen.getByText('Entrar como profesor').closest('a')
    expect(link?.getAttribute('href')).toBe('/dashboard')
  })
})
