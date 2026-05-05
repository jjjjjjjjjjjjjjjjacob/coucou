import React from 'react'
import { render as rtlRender, type RenderOptions } from '@testing-library/react'

// Create a custom render function
function render(ui: React.ReactElement, options?: RenderOptions) {
  return rtlRender(ui, options)
}

// Re-export everything
export * from '@testing-library/react'
export { render }