import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type FunctionReference, getFunctionName } from "convex/server";
import { type ReactNode, Suspense } from "react";
import type { RsvpCollectedArgs } from "@/lib/rsvp-form-state";
import type { Event } from "@/lib/types";

const eventDocument = {
  _id: "event_123" as Id<"events">,
  shortId: "dojo-night",
  name: "Dojo Pomodoro",
  hosts: ["Dojo Pomodoro"],
  location: "Main Room",
  eventDate: Date.now() + 86_400_000,
  eventTimezone: "America/New_York",
  status: "active",
  lifecycle: "published",
  createdAt: Date.now(),
  updatedAt: Date.now(),
} as Event;
let currentEvent: Event | null | undefined = eventDocument;
let featuredEvent: Event | null | undefined = eventDocument;
let currentStatus:
  | { status: "approved" | "pending" | "denied"; listKey: string }
  | null
  | undefined = null;
let isSignedIn = false;
let isAuthenticated = false;
let hasPublicList: boolean | undefined = true;
let hasPasswordList = true;
let searchParameters = new URLSearchParams("ref=friend&utm_source=test");
let entryResolution: { ok: boolean; listKey?: string } | undefined = { ok: true, listKey: "vip" };
const router = { push: mock((_path: string) => {}), replace: mock((_path: string) => {}) };
const signOut = mock(async () => {});
const locationAssign = mock((_url: string) => {});
Object.defineProperty(window.location, "assign", { configurable: true, value: locationAssign });
const submitRsvp = mock(async (_arguments: Record<string, unknown>) => undefined);
const prepareGuestRsvp = mock(async (_arguments: Record<string, unknown>) => ({
  rsvpHandoffToken: "handoff_123",
}));
const resolveEntryPassword = mock(async () => entryResolution);
const resolvePassword = mock(async () => ({
  ok: true,
  listKey: "vip",
  eventRouteId: "dojo-night",
}));
const collected: RsvpCollectedArgs = {
  firstName: "Ada",
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
};
interface FormProps {
  onCollect: (argumentsValue: RsvpCollectedArgs) => Promise<void>;
  hasNoPasswordList?: boolean;
  hasPasswordList?: boolean;
  initialPassword?: string;
}
let renderedFormProps: FormProps | undefined;

mock.module("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => searchParameters,
}));
mock.module("@clerk/nextjs", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn, signOut }) }));
mock.module("@/contexts/haptic-context", () => ({
  useHapticContext: () => ({ trigger: () => undefined }),
}));
mock.module("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated, isLoading: false }),
  useQuery: (reference: unknown, argumentsValue: unknown) => {
    if (argumentsValue === "skip") return undefined;
    const name = getFunctionName(reference as FunctionReference<"query">);
    if (name === "events:getByRouteId") return currentEvent;
    if (name === "events:getFeaturedEvent") return featuredEvent;
    if (name === "events:hasNoPasswordList") return hasPublicList;
    if (name === "events:hasPasswordList") return hasPasswordList;
    if (name === "rsvps:statusForUserEventByRouteId") return currentStatus;
    if (name === "credentials:resolveListByPassword") return entryResolution;
    return undefined;
  },
  useMutation: (reference: unknown) =>
    getFunctionName(reference as FunctionReference<"mutation">) === "rsvps:submitRequest"
      ? submitRsvp
      : getFunctionName(reference as FunctionReference<"mutation">) === "rsvps:prepareGuestRequest"
        ? prepareGuestRsvp
        : mock(() => {
            throw new Error("Unexpected mutation");
          }),
  useAction: (reference: unknown) =>
    getFunctionName(reference as FunctionReference<"action">) ===
    "credentialsNode:resolveListByPassword"
      ? resolveEntryPassword
      : resolvePassword,
}));
mock.module("@/components/event-theme-provider", () => ({
  EventThemeProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="event-theme">{children}</div>
  ),
}));
mock.module("../app/events/[eventId]/rsvp/rsvp-accepted-form", () => ({
  RsvpAcceptedForm: (properties: FormProps) => {
    renderedFormProps = properties;
    return <div data-testid="rsvp-form">RSVP form</div>;
  },
}));

const { RsvpPageClient } = await import("../app/events/[eventId]/rsvp/rsvp-page-client");
const { HomePageClient } = await import("../app/home-page-client");
const { EventEntry } = await import("../components/event-entry");

async function renderRsvp() {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <RsvpPageClient params={Promise.resolve({ eventId: "dojo-night" })} />
      </Suspense>,
    );
  });
}

beforeEach(() => {
  currentEvent = eventDocument;
  featuredEvent = eventDocument;
  currentStatus = null;
  isSignedIn = false;
  isAuthenticated = false;
  hasPublicList = true;
  hasPasswordList = true;
  searchParameters = new URLSearchParams("ref=friend&utm_source=test");
  entryResolution = { ok: true, listKey: "vip" };
  renderedFormProps = undefined;
  router.push.mockClear();
  router.replace.mockClear();
  signOut.mockClear();
  locationAssign.mockClear();
  submitRsvp.mockClear();
  prepareGuestRsvp.mockClear();
  resolvePassword.mockClear();
});

describe("Dojo event entry and RSVP routing", () => {
  it("mirrors the featured event at home and opens a public RSVP with query state", () => {
    render(<HomePageClient />);
    expect(screen.getByRole("heading", { name: "Dojo Pomodoro" })).toBeTruthy();
    expect(screen.getByText("Main Room")).toBeTruthy();
    expect(screen.getByTestId("event-theme")).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "RSVP" }));
    expect(router.push).toHaveBeenCalledWith("/events/dojo-night/rsvp?ref=friend&utm_source=test");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("retains the private featured-event redirect and the no-feature password lookup", () => {
    hasPublicList = false;
    const view = render(<HomePageClient />);
    expect(router.replace).toHaveBeenCalledWith("/events/dojo-night?ref=friend&utm_source=test");
    view.unmount();
    featuredEvent = null;
    render(<HomePageClient />);
    expect(screen.getByPlaceholderText("Password")).toBeTruthy();
  });
  it("keeps private events behind a password dialog before the form", async () => {
    hasPublicList = false;
    render(<EventEntry event={eventDocument as Parameters<typeof EventEntry>[0]["event"]} />);
    fireEvent.click(screen.getByRole("button", { name: "RSVP" }));
    fireEvent.change(screen.getByLabelText("List password"), { target: { value: "FANCY" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(
        "/events/dojo-night/rsvp?ref=friend&utm_source=test&password=FANCY",
      ),
    );
    expect(signOut).not.toHaveBeenCalled();
  });
  for (const passwordListsExist of [true, false]) {
    it(`shows the form before sign-in with password fields present: ${passwordListsExist}`, async () => {
      hasPasswordList = passwordListsExist;
      await renderRsvp();
      expect(screen.getByTestId("rsvp-form")).toBeTruthy();
      expect(renderedFormProps).toMatchObject({
        hasNoPasswordList: true,
        hasPasswordList: passwordListsExist,
      });
      expect(router.replace).not.toHaveBeenCalled();
    });
  }
  it("waits for Convex authentication and list availability", async () => {
    isSignedIn = true;
    await renderRsvp();
    expect(screen.queryByTestId("rsvp-form")).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });
  for (const status of ["approved", "pending", "denied"] as const) {
    it(`routes an existing ${status} RSVP to its destination`, async () => {
      isSignedIn = true;
      isAuthenticated = true;
      currentStatus = { status, listKey: "ga" };
      await renderRsvp();
      const destination =
        status === "approved" ? "ticket" : status === "pending" ? "status" : "denied";
      expect(router.replace).toHaveBeenCalledWith(
        `/events/dojo-night/${destination}?ref=friend&utm_source=test`,
      );
      expect(screen.queryByTestId("rsvp-form")).toBeNull();
    });
  }
  it("lets a denied guest retry a different resolved list", async () => {
    isSignedIn = true;
    isAuthenticated = true;
    currentStatus = { status: "denied", listKey: "ga" };
    searchParameters.set("password", "FANCY");
    await renderRsvp();
    expect(screen.getByTestId("rsvp-form")).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });
  it("returns invalid private RSVP links to the event gate", async () => {
    hasPublicList = false;
    entryResolution = { ok: false };
    searchParameters.set("password", "wrong");
    await renderRsvp();
    expect(router.replace).toHaveBeenCalledWith(
      "/events/dojo-night?ref=friend&utm_source=test&password=wrong",
    );
    expect(screen.queryByTestId("rsvp-form")).toBeNull();
  });
  it("renders a closed state instead of an RSVP form", async () => {
    currentEvent = { ...eventDocument, eventEndDate: Date.now() - 1 };
    await renderRsvp();
    expect(screen.getByText("RSVP closed.")).toBeTruthy();
    expect(screen.queryByTestId("rsvp-form")).toBeNull();
  });
  it("renders a missing-event state", async () => {
    currentEvent = null;
    await renderRsvp();
    expect(screen.getByText("Event not found.")).toBeTruthy();
  });
  it("submits directly for a verified signed-in phone", async () => {
    isSignedIn = true;
    isAuthenticated = true;
    await renderRsvp();
    await renderedFormProps?.onCollect(collected);
    expect(submitRsvp).toHaveBeenCalledTimes(1);
    expect(submitRsvp.mock.calls[0]?.[0]).toMatchObject({
      listKey: "vip",
      siteKey: "dojo",
      referralCode: "friend",
    });
    expect(prepareGuestRsvp).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith(
      "/events/dojo-night/status?ref=friend&utm_source=test",
    );
  });
  for (const signedIn of [false, true]) {
    it(`submits a guest handoff for an unverified phone (signed in: ${signedIn})`, async () => {
      isSignedIn = signedIn;
      isAuthenticated = signedIn;
      await renderRsvp();
      await renderedFormProps?.onCollect({
        ...collected,
        requiresPhoneVerification: true,
        phone: "+15555550999",
      });
      expect(submitRsvp).not.toHaveBeenCalled();
      expect(prepareGuestRsvp).toHaveBeenCalledTimes(1);
      expect(signOut).toHaveBeenCalledTimes(signedIn ? 1 : 0);
      const destination = new URL(locationAssign.mock.calls[0]?.[0] ?? "");
      expect(destination.searchParams.get("rsvp_handoff")).toBe("handoff_123");
      expect(destination.pathname).toContain("dojo");
      expect(destination.searchParams.get("redirect_url")).toContain("ref=friend");
    });
  }
});
