import React from "react";
import { afterEach, beforeAll, afterAll, expect, mock } from "bun:test";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";

// Add missing jest-dom color utilities for Bun compatibility
const mockUtils = {
  EXPECTED_COLOR: (str: string) => str,
  RECEIVED_COLOR: (str: string) => str,
  matcherHint: (str: string) => str,
  printExpected: (str: string) => str,
  printReceived: (str: string) => str,
  printWithType: (str: string) => str,
  stringify: (obj: any) => JSON.stringify(obj),
  diff: (a: any, b: any) =>
    `Expected: ${JSON.stringify(a)}, Received: ${JSON.stringify(b)}`,
};

// Patch the matchers to work with Bun's expect
const patchedMatchers = Object.fromEntries(
  Object.entries(matchers).map(([name, matcher]) => [
    name,
    function (this: any, ...args: any[]) {
      // Provide missing utils if the matcher needs them
      if (!this.utils) {
        this.utils = mockUtils;
      }
      return (matcher as any).call(this, ...args);
    },
  ]),
);

expect.extend(patchedMatchers);

// Make testing functions globally available

// Mock Clerk
mock.module("@clerk/nextjs", () => ({
  useAuth: () => ({
    isSignedIn: true,
    orgRole: "admin",
    has: () => true,
    userId: "user_123",
  }),
  useUser: () => ({
    user: {
      id: "user_123",
      fullName: "Test User",
      firstName: "Test",
      lastName: "User",
      primaryPhoneNumber: { phoneNumber: "+1234567890" },
      phoneNumbers: [{ phoneNumber: "+1234567890" }],
      organizationMemberships: [
        {
          id: "membership_123",
          role: "org:admin" as const,
          organization: { id: "org_123", name: "Test Organization" },
        },
      ],
    },
  }),
  useClerk: () => ({
    openUserProfile: () => {},
  }),
  useSession: () => ({
    session: {
      id: "session_123",
      user: { id: "user_123", fullName: "Test User" },
    },
  }),
  useOrganization: () => ({
    organization: {
      id: "org_123",
      name: "Test Organization",
    },
  }),
  useOrganizationList: () => ({
    userMemberships: {
      data: [
        {
          id: "membership_123",
          organization: { id: "org_123", name: "Test Organization" },
        },
      ],
    },
    setActive: () => {},
  }),
  SignedIn: ({ children }: { children: React.ReactNode }) => children,
  SignedOut: ({ children }: { children: React.ReactNode }) => children,
  UserProfile: () =>
    React.createElement(
      "div",
      { "data-testid": "user-profile" },
      "User Profile",
    ),
  SignIn: () =>
    React.createElement(
      "div",
      { "data-testid": "clerk-sign-in" },
      "Sign In Component",
    ),
  SignInButton: () =>
    React.createElement(
      "button",
      { "data-testid": "sign-in-button" },
      "Sign In",
    ),
  SignOutButton: () =>
    React.createElement(
      "button",
      { "data-testid": "sign-out-button" },
      "Sign Out",
    ),
  OrganizationSwitcher: () =>
    React.createElement(
      "div",
      { "data-testid": "org-switcher" },
      "Org Switcher",
    ),
  UserButton: () =>
    React.createElement("button", { "data-testid": "user-button" }, "User"),
  RedirectToSignIn: () =>
    React.createElement("div", {}, "Redirecting to sign in..."),
  RedirectToUserProfile: () =>
    React.createElement("div", {}, "Redirecting to user profile..."),
}));

// Mock Convex
mock.module("convex/react", () => ({
  useQuery: () => {
    // Return safe default data that works for most queries
    return [
      {
        _id: "event_123",
        name: "Test Event",
        location: "Test Location",
        eventDate: Date.now(),
        status: "active",
      },
    ];
  },
  useMutation: () => ({
    mutate: () => {},
    isPending: false,
    isError: false,
    error: null,
  }),
  useAction: () => () => Promise.resolve({ ok: true }),
}));

// Mock TanStack Query
mock.module("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: mock(() => ({
      _id: "event_123",
      name: "Test Event",
      location: "Test Location",
      eventDate: Date.now(),
      status: "active",
    })),
    isLoading: false,
    isError: false,
    error: null,
  }),
  useMutation: () => ({
    mutate: () => {},
    isPending: false,
    isError: false,
    error: null,
  }),
  QueryClient: class MockQueryClient {},
  QueryClientProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

// Mock Convex React Query
mock.module("@convex-dev/react-query", () => ({
  convexQuery: (queryFn: any, args: any) => ({ queryFn, args }),
  useConvexMutation: () => () => {},
}));

// Mock Next.js
mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    prefetch: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
    pathname: "/",
    query: {},
    asPath: "/",
  }),
  usePathname: () => "/",
  useSearchParams: () => ({
    get: (key: string) => {
      if (key === "password") return "test123";
      if (key === "eventId") return "event_123";
      return null;
    },
    has: () => false,
    getAll: () => [],
    keys: () => [],
    values: () => [],
    entries: () => [],
    toString: () => "",
  }),
  useParams: () => ({
    eventId: "event_123",
    code: "abc123",
  }),
  redirect: () => {
    // Mock redirect without throwing
    return null;
  },
  notFound: () => {
    // Mock notFound without throwing
    return null;
  },
}));

mock.module("next/link", () => ({
  __esModule: true,
  default: function MockLink({ children, href, ...props }: any) {
    return React.createElement("a", { href, ...props }, children);
  },
}));

// Mock other dependencies
mock.module("sonner", () => ({
  toast: {
    success: () => {},
    error: () => {},
    info: () => {},
    warning: () => {},
  },
}));

mock.module("react-qr-code", () => ({
  default: function MockQRCode({ value, ...props }: any) {
    return React.createElement(
      "div",
      {
        "data-testid": "qr-code",
        "data-value": value,
        ...props,
      },
      "QR Code",
    );
  },
}));

// Setup DOM mocks if window is available
if (typeof window !== "undefined") {
  // Mock window.location
  Object.defineProperty(window, "location", {
    value: {
      origin: "http://localhost:3000",
      href: "http://localhost:3000/",
      search: "",
      pathname: "/",
    },
    writable: true,
  });

  // Mock matchMedia
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });

  // Mock IntersectionObserver
  (window as any).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  // Mock ResizeObserver
  (window as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Also set up global mocks
(global as any).IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
(global as any).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Suppress console warnings during tests
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("Warning: ReactDOM.render is deprecated")
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterEach(() => cleanup());
afterAll(() => {
  console.error = originalError;
});
