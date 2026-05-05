import React from 'react'
import { mock } from 'bun:test'
import { EventBrandingProvider } from '@/contexts/event-branding-context'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Mock providers that provide the necessary context
const MockClerkProvider = ({ children }: { children: React.ReactNode }) => children
const MockConvexProvider = ({ children }: { children: React.ReactNode }) => children
const queryClient = new QueryClient()

const MockQueryClientProvider = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)

// Create a proper mock haptic context that actually works
const HapticContext = React.createContext<any>(undefined)

// Export useHapticContext so it can be mocked
export const useHapticContext = () => {
  const context = React.useContext(HapticContext)
  if (context === undefined) {
    // Fallback to a default mock if context is not provided
    return {
      settings: { enabled: true, intensity: 'medium' },
      updateSettings: mock(),
      trigger: mock(() => true),
      isSupported: true,
    }
  }
  return context
}

// Mock HapticProvider that provides actual context
const MockHapticProvider = ({ children }: { children: React.ReactNode }) => {
  const mockValue = {
    settings: { enabled: true, intensity: 'medium' },
    updateSettings: mock(),
    trigger: mock(() => true),
    isSupported: true,
  }

  return (
    <HapticContext.Provider value={mockValue}>
      {children}
    </HapticContext.Provider>
  )
}

export function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <MockClerkProvider>
      <MockConvexProvider>
        <MockQueryClientProvider>
          <MockHapticProvider>
            <EventBrandingProvider>
              {children}
            </EventBrandingProvider>
          </MockHapticProvider>
        </MockQueryClientProvider>
      </MockConvexProvider>
    </MockClerkProvider>
  )
}

// Custom render function that includes providers
export * from '@testing-library/react'
import { render as rtlRender, RenderOptions } from '@testing-library/react'

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  wrapper?: React.ComponentType<any>
}

export function renderWithProviders(
  ui: React.ReactElement,
  options: CustomRenderOptions = {}
) {
  const { wrapper, ...renderOptions } = options

  const Wrapper = wrapper || TestWrapper

  return rtlRender(ui, {
    wrapper: Wrapper,
    ...renderOptions,
  })
}
