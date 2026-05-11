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
  orgId: string | null;
  orgSlug: string | null;
}

interface ClerkTestMembership {
  id: string;
  role: "org:admin" | "org:host" | "org:door" | string;
  organization: {
    id: string;
    name: string;
    slug: string | null;
  };
}

const defaultClerkTestState: ClerkTestState = {
  isLoaded: true,
  isSignedIn: true,
  userId: "user_123",
  orgId: "org_123",
  orgSlug: "coucou",
};

const clerkTestState: ClerkTestState = { ...defaultClerkTestState };
const defaultClerkTestMemberships: ClerkTestMembership[] = [
  {
    id: "membership_123",
    role: "org:admin",
    organization: { id: "org_123", name: "Coucou", slug: "coucou" },
  },
];
let clerkTestMemberships: ClerkTestMembership[] = [...defaultClerkTestMemberships];
const routerReplaceCalls: string[] = [];
const routerPushCalls: string[] = [];
const locationAssignCalls: string[] = [];
const locationReplaceCalls: string[] = [];
const clerkSetActiveCalls: Array<{ organization: string }> = [];
let convexQueryResponse: unknown;
const convexMutationCalls: unknown[] = [];
interface ToastTestCall {
  kind: "loading" | "success" | "error" | "info" | "warning" | "dismiss";
  message: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
}

const toastTestCalls: ToastTestCall[] = [];

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
  get organizationMemberships() {
    return clerkTestMemberships;
  },
};

interface ClerkTestGlobal {
  __setClerkTestState?: (nextState: Partial<ClerkTestState>) => void;
  __resetClerkTestState?: () => void;
  __setClerkTestMemberships?: (nextMemberships: ClerkTestMembership[]) => void;
  __getRouterReplaceCalls?: () => string[];
  __clearRouterReplaceCalls?: () => void;
  __getRouterPushCalls?: () => string[];
  __clearRouterPushCalls?: () => void;
  __getLocationAssignCalls?: () => string[];
  __clearLocationAssignCalls?: () => void;
  __getLocationReplaceCalls?: () => string[];
  __clearLocationReplaceCalls?: () => void;
  __getClerkSetActiveCalls?: () => Array<{ organization: string }>;
  __clearClerkSetActiveCalls?: () => void;
  __setConvexQueryResponse?: (nextResponse: unknown) => void;
  __clearConvexQueryResponse?: () => void;
  __getConvexMutationCalls?: () => unknown[];
  __clearConvexMutationCalls?: () => void;
  __getToastTestCalls?: () => ToastTestCall[];
  __clearToastTestCalls?: () => void;
}

const clerkTestGlobal = globalThis as typeof globalThis & ClerkTestGlobal;

clerkTestGlobal.__setClerkTestState = (nextState) => {
  Object.assign(clerkTestState, nextState);
};
clerkTestGlobal.__resetClerkTestState = () => {
  Object.assign(clerkTestState, defaultClerkTestState);
  clerkTestMemberships = [...defaultClerkTestMemberships];
};
clerkTestGlobal.__setClerkTestMemberships = (nextMemberships) => {
  clerkTestMemberships = nextMemberships;
};
clerkTestGlobal.__getRouterReplaceCalls = () => [...routerReplaceCalls];
clerkTestGlobal.__clearRouterReplaceCalls = () => {
  routerReplaceCalls.length = 0;
};
clerkTestGlobal.__getRouterPushCalls = () => [...routerPushCalls];
clerkTestGlobal.__clearRouterPushCalls = () => {
  routerPushCalls.length = 0;
};
clerkTestGlobal.__getLocationAssignCalls = () => [...locationAssignCalls];
clerkTestGlobal.__clearLocationAssignCalls = () => {
  locationAssignCalls.length = 0;
};
clerkTestGlobal.__getLocationReplaceCalls = () => [...locationReplaceCalls];
clerkTestGlobal.__clearLocationReplaceCalls = () => {
  locationReplaceCalls.length = 0;
};
clerkTestGlobal.__getClerkSetActiveCalls = () => [...clerkSetActiveCalls];
clerkTestGlobal.__clearClerkSetActiveCalls = () => {
  clerkSetActiveCalls.length = 0;
};
clerkTestGlobal.__setConvexQueryResponse = (nextResponse) => {
  convexQueryResponse = nextResponse;
};
clerkTestGlobal.__clearConvexQueryResponse = () => {
  convexQueryResponse = undefined;
};
clerkTestGlobal.__getConvexMutationCalls = () => [...convexMutationCalls];
clerkTestGlobal.__clearConvexMutationCalls = () => {
  convexMutationCalls.length = 0;
};
clerkTestGlobal.__getToastTestCalls = () => [...toastTestCalls];
clerkTestGlobal.__clearToastTestCalls = () => {
  toastTestCalls.length = 0;
};

// Mock Clerk
mock.module("@clerk/nextjs", () => ({
  useAuth: () => ({
    isLoaded: clerkTestState.isLoaded,
    isSignedIn: clerkTestState.isSignedIn,
    orgRole: "admin",
    orgSlug: clerkTestState.orgSlug,
    orgId: clerkTestState.orgId,
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
    organization:
      clerkTestMemberships.find((membership) => membership.organization.id === clerkTestState.orgId)
        ?.organization ?? null,
  }),
  useOrganizationList: () => ({
    userMemberships: {
      data: clerkTestMemberships,
    },
    setActive: async (params: { organization: string }) => {
      clerkSetActiveCalls.push(params);
      const activeMembership = clerkTestMemberships.find(
        (membership) => membership.organization.id === params.organization,
      );
      clerkTestState.orgId = params.organization;
      clerkTestState.orgSlug = activeMembership?.organization.slug ?? null;
    },
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
    isLoading: false,
    isAuthenticated: true,
  }),
  useQuery: () => {
    if (convexQueryResponse !== undefined) {
      return convexQueryResponse;
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
  useMutation: () => async (args: unknown) => {
    convexMutationCalls.push(args);
    return "mutation_result";
  },
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
    push: (href: string) => {
      routerPushCalls.push(href);
    },
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
    loading: (
      message: React.ReactNode,
      data?: {
        id?: string | number;
        className?: string;
        style?: React.CSSProperties;
      },
    ) => {
      const id = data?.id ?? `toast_${toastTestCalls.length + 1}`;
      const toastCall: ToastTestCall = {
        kind: "loading",
        message: String(message),
        id,
      };
      if (data?.className) toastCall.className = data.className;
      if (data?.style) toastCall.style = data.style;
      toastTestCalls.push(toastCall);
      return id;
    },
    success: (
      message: React.ReactNode,
      data?: {
        id?: string | number;
        className?: string;
        style?: React.CSSProperties;
      },
    ) => {
      const toastCall: ToastTestCall = {
        kind: "success",
        message: String(message),
        id: data?.id,
      };
      if (data?.className) toastCall.className = data.className;
      if (data?.style) toastCall.style = data.style;
      toastTestCalls.push(toastCall);
    },
    error: (
      message: React.ReactNode,
      data?: {
        id?: string | number;
        className?: string;
        style?: React.CSSProperties;
      },
    ) => {
      const toastCall: ToastTestCall = {
        kind: "error",
        message: String(message),
        id: data?.id,
      };
      if (data?.className) toastCall.className = data.className;
      if (data?.style) toastCall.style = data.style;
      toastTestCalls.push(toastCall);
    },
    info: (message: React.ReactNode) => {
      toastTestCalls.push({ kind: "info", message: String(message) });
    },
    warning: (message: React.ReactNode) => {
      toastTestCalls.push({ kind: "warning", message: String(message) });
    },
    dismiss: (id?: string | number) => {
      toastTestCalls.push({ kind: "dismiss", message: "", id });
    },
  },
}));

mock.module("posthog-js", () => ({
  default: {
    capture: () => {},
    captureException: () => {},
    identify: () => {},
    reset: () => {},
  },
  capture: () => {},
  captureException: () => {},
  identify: () => {},
  reset: () => {},
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
      assign: (href: string) => {
        locationAssignCalls.push(href);
      },
      replace: (href: string) => {
        locationReplaceCalls.push(href);
      },
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
  clerkTestGlobal.__clearRouterReplaceCalls?.();
  clerkTestGlobal.__clearRouterPushCalls?.();
  clerkTestGlobal.__clearLocationAssignCalls?.();
  clerkTestGlobal.__clearLocationReplaceCalls?.();
  clerkTestGlobal.__clearClerkSetActiveCalls?.();
  clerkTestGlobal.__clearConvexQueryResponse?.();
  clerkTestGlobal.__clearConvexMutationCalls?.();
  clerkTestGlobal.__clearToastTestCalls?.();
});
afterAll(() => {
  console.error = originalError;
});
