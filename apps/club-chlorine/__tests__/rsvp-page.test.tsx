import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import { act, render, screen, waitFor } from "@testing-library/react";
import { type FunctionReference, getFunctionName } from "convex/server";
import React, { Suspense } from "react";
import type { Event } from "@/lib/types";

type RsvpStatusValue = {
  status: "pending" | "approved" | "denied";
} | null;

type QueryArgs = Record<string, unknown> | "skip";

const routerReplaceCalls: string[] = [];
const postHogFeatureFlagCalls: string[] = [];
const submitRsvpCalls: Array<Record<string, unknown>> = [];
const submitGuestRsvpCalls: Array<Record<string, unknown>> = [];
const clerkSignOutCalls: string[] = [];
const locationAssignCalls: string[] = [];
let clerkIsLoaded = true;
let clerkIsSignedIn = true;
let convexIsAuthenticated = true;
let convexIsLoading = false;
let routeRsvpStatus: RsvpStatusValue | undefined = null;
let eventRsvpStatus: RsvpStatusValue | undefined = null;
let eventDocument: Event | null | undefined;
let eventList: Event[] | undefined;
let currentSearchParams = new URLSearchParams();
let viewportIsMobile = false;

function createMatchMediaResult(query: string): MediaQueryList {
  return {
    matches: query.includes("max-width") ? viewportIsMobile : false,
    media: query,
    onchange: null,
    addListener: mock(() => undefined),
    removeListener: mock(() => undefined),
    addEventListener: mock(() => undefined),
    removeEventListener: mock(() => undefined),
    dispatchEvent: mock(() => false),
  } as MediaQueryList;
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => createMatchMediaResult(query),
});

Object.defineProperty(window.location, "assign", {
  configurable: true,
  value: (nextUrl: string | URL) => {
    locationAssignCalls.push(String(nextUrl));
  },
});

function createEvent(overrides: Partial<Event> = {}): Event {
  return {
    _id: "event_123" as Id<"events">,
    shortId: "club",
    name: "Club Chlorine",
    hosts: ["Club Chlorine"],
    location: "Pool",
    eventDate: Date.now() + 24 * 60 * 60 * 1000,
    eventTimezone: "America/New_York",
    status: "active",
    lifecycle: "published",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    customFields: [],
    maxAttendees: 1,
    attendanceQuestionEnabled: false,
    ...overrides,
  } as Event;
}

function getQueryFunctionName(queryReference: unknown): string {
  return getFunctionName(queryReference as FunctionReference<"query">);
}

mock.module("next/navigation", () => ({
  usePathname: () => "/events/club/rsvp",
  useRouter: () => ({
    push: mock(() => {}),
    replace: (nextPath: string) => {
      routerReplaceCalls.push(nextPath);
    },
    refresh: mock(() => {}),
  }),
  useSearchParams: () => currentSearchParams,
}));

mock.module("@clerk/nextjs", () => ({
  useAuth: () => ({
    isLoaded: clerkIsLoaded,
    isSignedIn: clerkIsSignedIn,
    signOut: async () => {
      clerkSignOutCalls.push("signOut");
    },
  }),
  useClerk: () => ({
    openUserProfile: mock(() => {}),
    signOut: async () => {
      clerkSignOutCalls.push("signOut");
    },
  }),
  useUser: () => ({
    user: clerkIsSignedIn
      ? {
          id: "user_123",
          firstName: "Test",
          lastName: "Guest",
          fullName: "Test Guest",
          primaryPhoneNumber: { phoneNumber: "+15555550123" },
          phoneNumbers: [{ phoneNumber: "+15555550123" }],
        }
      : null,
  }),
}));

mock.module("convex/react", () => ({
  useConvexAuth: () => ({
    isAuthenticated: convexIsAuthenticated,
    isLoading: convexIsLoading,
  }),
  useQuery: (queryReference: unknown, queryArgs: QueryArgs) => {
    if (queryArgs === "skip") return undefined;
    const queryFunctionName = getQueryFunctionName(queryReference);
    if (queryFunctionName === "events:getByRouteId") return eventDocument;
    if (queryFunctionName === "events:listAll") return eventList;
    if (queryFunctionName === "rsvps:statusForUserEventByRouteId") return routeRsvpStatus;
    if (queryFunctionName === "rsvps:statusForUserEvent") return eventRsvpStatus;
    if (queryFunctionName === "events:hasNoPasswordList") return true;
    if (queryFunctionName === "events:hasPasswordList") return false;
    if (queryFunctionName === "users:getByClerkUser") return undefined;
    if (queryFunctionName === "socialProfiles:listForCurrentUser") return [];
    return undefined;
  },
  useMutation: (mutationReference: unknown) => {
    const mutationFunctionName = getQueryFunctionName(mutationReference);
    return mock(async (mutationArgs: Record<string, unknown>) => {
      if (mutationFunctionName === "rsvps:submitRequest") {
        submitRsvpCalls.push(mutationArgs);
      }
      if (mutationFunctionName === "rsvps:submitGuestRequest") {
        submitGuestRsvpCalls.push(mutationArgs);
        return {
          ok: true,
          rsvpId: "rsvp_guest_123",
          rsvpHandoffToken: "handoff_123",
          expiresAt: Date.now() + 900_000,
        };
      }
      return undefined;
    });
  },
  useAction: () => mock(async () => ({ ok: true, listKey: "vip", matched: "fallback" })),
}));

mock.module("@coucou/ui/tenant-template", () => ({
  CHLORINE_PHASE_SPLIT_MS: 0,
  RsvpPending: ({ heading }: { heading: string }) => <div>{heading}</div>,
  TenantButton: (props: React.ComponentProps<"button">) => <button {...props} />,
  ChlorineEventRow: ({
    event,
  }: {
    event: { id: string; rsvpHref?: string; rsvpLabel?: string; rsvpDisabled?: boolean };
  }) => (
    <a
      href={event.rsvpHref ?? ""}
      aria-disabled={event.rsvpDisabled ? "true" : undefined}
      data-testid={`rsvp-brick-${event.id}`}
    >
      {event.rsvpLabel ?? "RSVP"}
    </a>
  ),
  useMobile: () => false,
}));

mock.module("@/components/event-referral-share-button", () => ({
  EventReferralShareButton: () => <div data-testid="event-referral-share-button" />,
}));

mock.module("posthog-js", () => ({
  default: {
    capture: mock(() => {}),
    getFeatureFlag: (flagKey: string) => {
      postHogFeatureFlagCalls.push(flagKey);
      return "control";
    },
  },
}));

interface MockRsvpCollectedArgs {
  firstName: string;
  lastName: string;
  phone: string;
  requiresPhoneVerification: boolean;
  shareContact: true;
  attendees: number;
  attendanceStatus: "yes" | "no" | "maybe";
  smsConsent: boolean;
  customFields: Record<string, string>;
  socialProfiles: Array<{ platformKey: string; handle: string }>;
  resolvedListKey: string;
}

interface MockRsvpAcceptedFormProps {
  onCollect?: (args: MockRsvpCollectedArgs) => void | Promise<void>;
}

function createCollectedRsvpArgs(
  overrides: Partial<MockRsvpCollectedArgs> = {},
): MockRsvpCollectedArgs {
  return {
    firstName: "Test",
    lastName: "Guest",
    phone: "+15555550123",
    requiresPhoneVerification: false,
    shareContact: true,
    attendees: 1,
    attendanceStatus: "yes",
    smsConsent: false,
    customFields: {},
    socialProfiles: [],
    resolvedListKey: "vip",
    ...overrides,
  };
}

mock.module("../app/events/[eventId]/rsvp/rsvp-accepted-form", () => ({
  RsvpAcceptedForm: ({ onCollect }: MockRsvpAcceptedFormProps) => (
    <div data-testid="rsvp-form">
      RSVP form
      <button
        type="button"
        data-testid="submit-matching-phone"
        onClick={() => {
          void onCollect?.(createCollectedRsvpArgs());
        }}
      >
        Submit matching phone
      </button>
      <button
        type="button"
        data-testid="submit-changed-phone"
        onClick={() => {
          void onCollect?.(
            createCollectedRsvpArgs({
              phone: "+15555550999",
              requiresPhoneVerification: true,
            }),
          );
        }}
      >
        Submit changed phone
      </button>
    </div>
  ),
}));

const { RsvpPageClient } = await import("../app/events/[eventId]/rsvp/rsvp-page-client");
const { default: Home } = await import("../app/page");
const { default: EventPageClient } = await import("../app/events/[eventId]/page-client");
const { buildRsvpPathForViewport } = await import("../lib/rsvp-flow-routing");

async function renderRsvpPage() {
  await act(async () => {
    render(
      <Suspense fallback={<div>Loading route</div>}>
        <RsvpPageClient params={Promise.resolve({ eventId: "club" })} />
      </Suspense>,
    );
  });
}

async function renderHomePage() {
  await act(async () => {
    render(<Home />);
  });
}

async function renderEventPage() {
  await act(async () => {
    render(
      <Suspense fallback={<div>Loading route</div>}>
        <EventPageClient params={Promise.resolve({ eventId: "club" })} />
      </Suspense>,
    );
  });
}

describe("RSVP page reservation-status gate", () => {
  beforeEach(() => {
    routerReplaceCalls.length = 0;
    postHogFeatureFlagCalls.length = 0;
    submitRsvpCalls.length = 0;
    submitGuestRsvpCalls.length = 0;
    clerkSignOutCalls.length = 0;
    locationAssignCalls.length = 0;
    clerkIsLoaded = true;
    clerkIsSignedIn = true;
    convexIsAuthenticated = true;
    convexIsLoading = false;
    eventDocument = createEvent();
    eventList = [eventDocument];
    routeRsvpStatus = null;
    eventRsvpStatus = null;
    currentSearchParams = new URLSearchParams("step=info");
    viewportIsMobile = false;
  });

  it("builds segmented RSVP paths on mobile without evaluating the RSVP experiment", () => {
    const rsvpPath = buildRsvpPathForViewport("club", currentSearchParams, "mobile");

    expect(rsvpPath).toBe("/events/club/rsvp/info?step=info");
    expect(postHogFeatureFlagCalls).toEqual([]);
  });

  it("evaluates the RSVP experiment for desktop RSVP paths", () => {
    const rsvpPath = buildRsvpPathForViewport("club", currentSearchParams, "desktop");

    expect(rsvpPath).toBe("/events/club/rsvp/full");
    expect(postHogFeatureFlagCalls).toEqual(["rsvp-flow-route"]);
  });

  it("holds the form while RSVP status is still loading", async () => {
    routeRsvpStatus = undefined;

    await renderRsvpPage();

    expect(screen.getByRole("img", { name: "Loading" })).toBeTruthy();
    expect(screen.queryByTestId("rsvp-form")).toBeNull();
    expect(routerReplaceCalls).toEqual([]);
  });

  it("holds the form while Convex auth is still syncing", async () => {
    convexIsAuthenticated = false;
    convexIsLoading = true;

    await renderRsvpPage();

    expect(screen.getByRole("img", { name: "Loading" })).toBeTruthy();
    expect(screen.queryByTestId("rsvp-form")).toBeNull();
    expect(routerReplaceCalls).toEqual([]);
  });

  it("redirects approved RSVPs without rendering the form", async () => {
    routeRsvpStatus = { status: "approved" };

    await renderRsvpPage();

    await waitFor(() => {
      expect(routerReplaceCalls).toEqual(["/events/club/ticket"]);
    });
    expect(screen.queryByTestId("rsvp-form")).toBeNull();
  });

  it("redirects pending RSVPs without rendering the form", async () => {
    routeRsvpStatus = { status: "pending" };

    await renderRsvpPage();

    await waitFor(() => {
      expect(routerReplaceCalls).toEqual(["/events/club/status"]);
    });
    expect(screen.queryByTestId("rsvp-form")).toBeNull();
  });

  it("redirects denied RSVPs without rendering the form", async () => {
    routeRsvpStatus = { status: "denied" };

    await renderRsvpPage();

    await waitFor(() => {
      expect(routerReplaceCalls).toEqual(["/events/club/denied"]);
    });
    expect(screen.queryByTestId("rsvp-form")).toBeNull();
  });

  it("renders the form after an authenticated no-RSVP result", async () => {
    routeRsvpStatus = null;

    await renderRsvpPage();

    expect(screen.getByTestId("rsvp-form")).toBeTruthy();
    expect(routerReplaceCalls).toEqual([]);
  });

  it("submits directly when a signed-in RSVP keeps the Clerk phone", async () => {
    routeRsvpStatus = null;

    await renderRsvpPage();

    await act(async () => {
      screen.getByTestId("submit-matching-phone").click();
    });

    await waitFor(() => {
      expect(submitRsvpCalls).toHaveLength(1);
    });
    expect(submitGuestRsvpCalls).toEqual([]);
    expect(clerkSignOutCalls).toEqual([]);
    expect(locationAssignCalls).toEqual([]);
    expect(routerReplaceCalls).toEqual(["/events/club/status"]);
    expect(submitRsvpCalls[0]?.phone).toBe("+15555550123");
    expect(submitRsvpCalls[0]?.firstName).toBe("Test");
    expect(submitRsvpCalls[0]?.lastName).toBe("Guest");
  });

  it("submits a handoff RSVP and signs out when a signed-in RSVP changes phone", async () => {
    routeRsvpStatus = null;

    await renderRsvpPage();

    await act(async () => {
      screen.getByTestId("submit-changed-phone").click();
    });

    await waitFor(() => {
      expect(submitGuestRsvpCalls).toHaveLength(1);
    });
    expect(submitRsvpCalls).toEqual([]);
    expect(submitGuestRsvpCalls[0]?.phone).toBe("+15555550999");
    expect(clerkSignOutCalls).toEqual(["signOut"]);
    expect(locationAssignCalls).toHaveLength(1);
    expect(locationAssignCalls[0]).toContain("rsvp_handoff=handoff_123");
    expect(locationAssignCalls[0]).not.toContain("5555550999");
  });

  it("uses segmented RSVP links on mobile homepage events without evaluating the experiment", async () => {
    viewportIsMobile = true;

    await renderHomePage();

    await waitFor(() => {
      expect(screen.getByTestId("rsvp-brick-club").getAttribute("href")).toBe(
        "/events/club/rsvp/info?step=info",
      );
    });
    expect(postHogFeatureFlagCalls).toEqual([]);
  });

  it("evaluates the RSVP experiment for desktop homepage events", async () => {
    await renderHomePage();

    await waitFor(() => {
      expect(screen.getByTestId("rsvp-brick-club").getAttribute("href")).toBe(
        "/events/club/rsvp/full",
      );
    });
    expect(postHogFeatureFlagCalls).toEqual(["rsvp-flow-route"]);
  });

  it("does not evaluate the RSVP experiment for a known homepage RSVP", async () => {
    eventRsvpStatus = { status: "approved" };

    await renderHomePage();

    expect(screen.getByTestId("rsvp-brick-club").getAttribute("href")).toBe("/events/club/ticket");
    expect(postHogFeatureFlagCalls).toEqual([]);
  });

  it("does not evaluate the RSVP experiment for closed homepage events", async () => {
    const closedEvent = createEvent({ lifecycle: "draft" });
    eventDocument = closedEvent;
    eventList = [closedEvent];
    eventRsvpStatus = null;

    await renderHomePage();

    expect(screen.getByTestId("rsvp-brick-club").getAttribute("aria-disabled")).toBe("true");
    expect(postHogFeatureFlagCalls).toEqual([]);
  });

  it("does not evaluate the RSVP experiment before homepage auth loads", async () => {
    clerkIsLoaded = false;
    eventRsvpStatus = undefined;

    await renderHomePage();

    expect(screen.getByTestId("rsvp-brick-club").getAttribute("aria-disabled")).toBe("true");
    expect(postHogFeatureFlagCalls).toEqual([]);
  });

  it("does not evaluate the RSVP experiment for a known focused event RSVP", async () => {
    routeRsvpStatus = { status: "approved" };

    await renderEventPage();

    expect(screen.getByTestId("rsvp-brick-club").getAttribute("href")).toBe("/events/club/ticket");
    expect(postHogFeatureFlagCalls).toEqual([]);
  });

  it("does not evaluate the RSVP experiment before focused event auth loads", async () => {
    clerkIsLoaded = false;
    routeRsvpStatus = undefined;

    await renderEventPage();

    expect(screen.getByTestId("rsvp-brick-club").getAttribute("aria-disabled")).toBe("true");
    expect(postHogFeatureFlagCalls).toEqual([]);
  });

  it("uses segmented RSVP links on mobile focused events without evaluating the experiment", async () => {
    viewportIsMobile = true;

    await renderEventPage();

    await waitFor(() => {
      expect(screen.getByTestId("rsvp-brick-club").getAttribute("href")).toBe(
        "/events/club/rsvp/info?step=info",
      );
    });
    expect(postHogFeatureFlagCalls).toEqual([]);
  });
});
