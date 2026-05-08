import { afterAll, afterEach, beforeAll, expect, mock } from "bun:test";
import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup } from "@testing-library/react";
import React from "react";

// Add missing jest-dom color utilities for Bun compatibility
const mockUtils = {
  EXPECTED_COLOR: (str: string) => str,
  RECEIVED_COLOR: (str: string) => str,
  matcherHint: (str: string) => str,
  printExpected: (str: string) => str,
  printReceived: (str: string) => str,
  printWithType: (str: string) => str,
  stringify: (obj: unknown) => JSON.stringify(obj),
  diff: (a: unknown, b: unknown) =>
    `Expected: ${JSON.stringify(a)}, Received: ${JSON.stringify(b)}`,
};

type JestDomMatcherContext = {
  utils?: typeof mockUtils;
};

type JestDomMatcher = (this: JestDomMatcherContext, ...args: unknown[]) => unknown;

// Patch the matchers to work with Bun's expect
const patchedMatchers = Object.fromEntries(
  Object.entries(matchers).map(([name, matcher]) => [
    name,
    function (this: JestDomMatcherContext, ...args: unknown[]) {
      // Provide missing utils if the matcher needs them
      if (!this.utils) {
        this.utils = mockUtils;
      }
      return (matcher as JestDomMatcher).call(this, ...args);
    },
  ]),
);

expect.extend(patchedMatchers);

// Make testing functions globally available

interface ClerkTestState {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
}

interface ConvexAuthTestState {
  isLoading: boolean;
  isAuthenticated: boolean;
}

const defaultClerkTestState: ClerkTestState = {
  isLoaded: true,
  isSignedIn: true,
  userId: "user_123",
};

const clerkTestState: ClerkTestState = { ...defaultClerkTestState };
const defaultConvexAuthTestState: ConvexAuthTestState = {
  isLoading: false,
  isAuthenticated: true,
};
const convexAuthTestState: ConvexAuthTestState = {
  ...defaultConvexAuthTestState,
};
const routerReplaceCalls: string[] = [];

const testUser = {
  id: "user_123",
  fullName: "Test User",
  firstName: "Test",
  lastName: "User",
  primaryEmailAddressId: "email_123",
  primaryPhoneNumberId: "phone_123",
  primaryEmailAddress: { emailAddress: "test@example.com" },
  emailAddresses: [{ id: "email_123", emailAddress: "test@example.com" }],
  primaryPhoneNumber: { id: "phone_123", phoneNumber: "+1234567890" },
  phoneNumbers: [{ id: "phone_123", phoneNumber: "+1234567890" }],
  organizationMemberships: [
    {
      id: "membership_123",
      role: "org:admin" as const,
      organization: { id: "org_123", name: "Test Organization" },
    },
  ],
};

interface ClerkTestGlobal {
  __setClerkTestState?: (nextState: Partial<ClerkTestState>) => void;
  __resetClerkTestState?: () => void;
  __setConvexAuthTestState?: (nextState: Partial<ConvexAuthTestState>) => void;
  __resetConvexAuthTestState?: () => void;
  __getRouterReplaceCalls?: () => string[];
  __clearRouterReplaceCalls?: () => void;
}

const clerkTestGlobal = globalThis as typeof globalThis & ClerkTestGlobal;

clerkTestGlobal.__setClerkTestState = (nextState) => {
  Object.assign(clerkTestState, nextState);
};
clerkTestGlobal.__resetClerkTestState = () => {
  Object.assign(clerkTestState, defaultClerkTestState);
};
clerkTestGlobal.__setConvexAuthTestState = (nextState) => {
  Object.assign(convexAuthTestState, nextState);
};
clerkTestGlobal.__resetConvexAuthTestState = () => {
  Object.assign(convexAuthTestState, defaultConvexAuthTestState);
};
clerkTestGlobal.__getRouterReplaceCalls = () => [...routerReplaceCalls];
clerkTestGlobal.__clearRouterReplaceCalls = () => {
  routerReplaceCalls.length = 0;
};

// Mock Clerk
mock.module("@clerk/nextjs", () => ({
  useAuth: () => ({
    isLoaded: clerkTestState.isLoaded,
    isSignedIn: clerkTestState.isSignedIn,
    orgRole: "admin",
    has: () => true,
    userId: clerkTestState.isSignedIn ? clerkTestState.userId : null,
  }),
  useUser: () => ({
    isLoaded: clerkTestState.isLoaded,
    isSignedIn: clerkTestState.isSignedIn,
    user: clerkTestState.isSignedIn ? testUser : null,
  }),
  useClerk: () => ({
    openUserProfile: () => {},
  }),
  useSignIn: () => ({
    isLoaded: true,
    signIn: {
      create: async () => ({
        status: "needs_first_factor",
      }),
      attemptFirstFactor: async () => ({
        status: "complete",
        createdSessionId: "session_123",
      }),
    },
    setActive: async () => {},
  }),
  useSignUp: () => ({
    isLoaded: true,
    signUp: {
      create: async () => ({
        status: "missing_requirements",
      }),
      preparePhoneNumberVerification: async () => ({
        status: "missing_requirements",
      }),
      attemptPhoneNumberVerification: async () => ({
        status: "complete",
        createdSessionId: "session_123",
      }),
      prepareEmailAddressVerification: async () => ({
        status: "missing_requirements",
      }),
      attemptEmailAddressVerification: async () => ({
        status: "complete",
        createdSessionId: "session_123",
      }),
    },
    setActive: async () => {},
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
  UserProfile: () => React.createElement("div", { "data-testid": "user-profile" }, "User Profile"),
  SignIn: () => React.createElement("div", { "data-testid": "clerk-sign-in" }, "Sign In Component"),
  SignInButton: () => React.createElement("button", { "data-testid": "sign-in-button" }, "Sign In"),
  SignOutButton: () =>
    React.createElement("button", { "data-testid": "sign-out-button" }, "Sign Out"),
  OrganizationSwitcher: () =>
    React.createElement("div", { "data-testid": "org-switcher" }, "Org Switcher"),
  UserButton: () => React.createElement("button", { "data-testid": "user-button" }, "User"),
  RedirectToSignIn: () => React.createElement("div", {}, "Redirecting to sign in..."),
  RedirectToUserProfile: () => React.createElement("div", {}, "Redirecting to user profile..."),
}));

// Mock Convex
mock.module("convex/react", () => ({
  useConvexAuth: () => ({
    isLoading: convexAuthTestState.isLoading,
    isAuthenticated: convexAuthTestState.isAuthenticated,
  }),
  useQuery: (_queryReference: unknown, queryArguments?: unknown) => {
    if (queryArguments === "skip") {
      return undefined;
    }
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
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock Convex React Query
mock.module("@convex-dev/react-query", () => ({
  convexQuery: (queryFn: unknown, args: unknown) => ({ queryFn, args }),
  useConvexMutation: () => () => {},
}));

// Mock Next.js
mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: (href: string) => {
      routerReplaceCalls.push(href);
    },
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
  default: function MockLink({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: React.ReactNode;
    href: string;
  }) {
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
  default: function MockQRCode({
    value,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
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
  Object.defineProperty(window, "IntersectionObserver", {
    writable: true,
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });

  // Mock ResizeObserver
  Object.defineProperty(window, "ResizeObserver", {
    writable: true,
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
}

// Also set up global mocks
Object.defineProperty(globalThis, "IntersectionObserver", {
  writable: true,
  value: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});
Object.defineProperty(globalThis, "ResizeObserver", {
  writable: true,
  value: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});

// Suppress console warnings during tests
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("Warning: ReactDOM.render is deprecated")) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterEach(() => {
  cleanup();
  clerkTestGlobal.__resetClerkTestState?.();
  clerkTestGlobal.__resetConvexAuthTestState?.();
  clerkTestGlobal.__clearRouterReplaceCalls?.();
});
afterAll(() => {
  console.error = originalError;
});
