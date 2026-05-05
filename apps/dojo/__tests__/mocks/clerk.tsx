import React from 'react'

// Mock Clerk hooks
export const mockUseAuth = () => ({
  isSignedIn: true,
  orgRole: 'admin',
  has: () => true,
  userId: 'user_123',
})

export const mockUseUser = () => ({
  user: {
    id: 'user_123',
    fullName: 'Test User',
    firstName: 'Test',
    lastName: 'User',
    primaryPhoneNumber: { phoneNumber: '+1234567890' },
    phoneNumbers: [{ phoneNumber: '+1234567890' }],
  },
})

export const mockUseClerk = () => ({
  openUserProfile: () => {},
})

export const mockUseSession = () => ({
  session: {
    id: 'session_123',
    user: {
      id: 'user_123',
      fullName: 'Test User',
    },
  },
})

// Mock Clerk components
export const SignedIn = ({ children }: { children: React.ReactNode }) => <>{children}</>
export const UserProfile = () => <div data-testid="user-profile">User Profile</div>