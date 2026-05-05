import React from 'react'

// Mock Next.js router
export const mockUseRouter = () => ({
  push: () => {},
  replace: () => {},
  prefetch: () => {},
  back: () => {},
  forward: () => {},
  refresh: () => {},
  pathname: '/',
  query: {},
  asPath: '/',
})

export const mockUseSearchParams = () => ({
  get: (key: string) => {
    if (key === 'password') return 'test123'
    if (key === 'eventId') return 'event_123'
    return null
  },
  has: () => false,
  getAll: () => [],
  keys: () => [],
  values: () => [],
  entries: () => [],
  toString: () => '',
})

export const mockUseParams = () => ({
  eventId: 'event_123',
  code: 'abc123',
})

// Mock Next.js Link component
export const MockLink = ({
  children,
  href,
  ...props
}: {
  children: React.ReactNode
  href: string
  [key: string]: any
}) => (
  <a href={href} {...props}>
    {children}
  </a>
)

// Mock Next.js use() hook
export const mockUse = (promise: any) => {
  if (promise && typeof promise.then === 'function') {
    // If it's a promise, return resolved value
    return { eventId: 'event_123', code: 'abc123' }
  }
  // If it's already resolved (like params), return it
  return promise || { eventId: 'event_123', code: 'abc123' }
}