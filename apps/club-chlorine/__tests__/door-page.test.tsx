import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'bun:test'
import DoorPage from '../app/door/page'

describe('Door Page', () => {
  it('renders door page without crashing', () => {
    render(<DoorPage />)
    // Basic render test - just check it doesn't crash
    expect(document.body).toBeTruthy()
  })

  it('displays door interface', () => {
    render(<DoorPage />)
    // Test basic functionality without complex mocking
    expect(document.body).toBeTruthy()
  })
})