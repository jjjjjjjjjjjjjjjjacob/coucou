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
let clerkIsLoaded = true;
let clerkIsSignedIn = true;
let convexIsAuthenticated = true;
let convexIsLoading = false;
let routeRsvpStatus: RsvpStatusValue | undefined = null;
let eventRsvpStatus: RsvpStatusValue | undefined = null;
let eventDocument: Event | null | undefined;
let eventList: Event[] | undefined;
let currentSearchParams = new URLSearchParams();

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
  }),
  useClerk: () => ({
    openUserProfile: mock(() => {}),
    signOut: mock(async () => undefined),
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
  useMutation: () => mock(async () => undefined),
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

mock.module("../app/events/[eventId]/rsvp/rsvp-accepted-form", () => ({
  RsvpAcceptedForm: () => <div data-testid="rsvp-form">RSVP form</div>,
}));

const { RsvpPageClient } = await import("../app/events/[eventId]/rsvp/rsvp-page-client");
const { default: Home } = await import("../app/page");
const { default: EventPageClient } = await import("../app/events/[eventId]/page-client");

async function renderRsvpPage() {
  await act(async () => {
    render(
      <Suspense fallback={<div>Loading route</div>}>
        <RsvpPageClient params={Promise.resolve({ eventId: "club" })} formVariant="stepped" />
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
    clerkIsLoaded = true;
    clerkIsSignedIn = true;
    convexIsAuthenticated = true;
    convexIsLoading = false;
    eventDocument = createEvent();
    eventList = [eventDocument];
    routeRsvpStatus = null;
    eventRsvpStatus = null;
    currentSearchParams = new URLSearchParams("step=info");
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

  it("does not evaluate the RSVP experiment for a known homepage RSVP", async () => {
    eventRsvpStatus = { status: "approved" };

    await renderHomePage();

    expect(screen.getByTestId("rsvp-brick-club").getAttribute("href")).toBe("/events/club/ticket");
    expect(postHogFeatureFlagCalls).toEqual([]);
  });

  it("does not evaluate the RSVP experiment for closed homepage events", async () => {
    const closedEvent = createEvent({ status: "inactive" });
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
});
