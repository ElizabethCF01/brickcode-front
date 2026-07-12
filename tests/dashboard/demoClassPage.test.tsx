import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DemoClassPage from '../../src/dashboard/pages/DemoClassPage'

// End-to-end check of the analytics wiring (slide 09): synthetic class →
// analyzeStudent → indicator bars + strategy pills rendered on the page.
describe('DemoClassPage (class analytics)', () => {
  const renderPage = () => render(<MemoryRouter><DemoClassPage /></MemoryRouter>)

  it('renders a row per synthetic student', () => {
    renderPage()
    expect(screen.getByText('Student 01')).toBeTruthy()
    expect(screen.getByText('Student 09')).toBeTruthy()
  })

  it('shows all three derived strategy labels', () => {
    renderPage()
    expect(screen.getAllByText('decomposing').length).toBeGreaterThan(0)
    expect(screen.getAllByText('guessing').length).toBeGreaterThan(0)
    expect(screen.getAllByText('stuck').length).toBeGreaterThan(0)
  })

  it('marks the data as synthetic so it is not mistaken for real students', () => {
    renderPage()
    expect(screen.getByText(/synthetic/i)).toBeTruthy()
  })
})
