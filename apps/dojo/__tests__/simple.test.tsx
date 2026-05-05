import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'bun:test'

// Simple component for testing
function TestComponent() {
  return (
    <div>
      <h1>Test Component</h1>
      <p>Hello World</p>
    </div>
  )
}

describe('Simple Test', () => {
  it('renders test component', () => {
    render(<TestComponent />)
    expect(screen.getByRole('heading', { name: /test component/i })).toBeInTheDocument()
    expect(screen.getByText(/hello world/i)).toBeInTheDocument()
  })

  it('basic assertion works', () => {
    expect(1 + 1).toBe(2)
  })
})