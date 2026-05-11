import { describe, expect, it, mock } from "bun:test";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import type { Id } from "@convex/_generated/dataModel";
import { HapticProvider } from "@/contexts/haptic-context";
import type { Event } from "@/lib/types";

let currentSearchParameters = new URLSearchParams("step=info");
const routerReplaceCalls: string[] = [];
const mockSignOut = mock(async (_options?: { redirectUrl?: string }) => undefined);

mock.module("next/navigation", () => ({
  usePathname: () => "/events/club/rsvp",
  useRouter: () => ({
    replace: (nextPath: string) => {
      routerReplaceCalls.push(nextPath);
      currentSearchParameters = new URLSearchParams(nextPath.split("?")[1] ?? "");
    },
    push: mock(() => {}),
    refresh: mock(() => {}),
  }),
  useSearchParams: () => currentSearchParameters,
}));

mock.module("@clerk/nextjs", () => ({
  useUser: () => ({
    user: {
      id: "user_123",
      firstName: "",
      lastName: "",
      fullName: "",
      primaryPhoneNumber: { phoneNumber: "+15555550123" },
      phoneNumbers: [{ phoneNumber: "+15555550123" }],
    },
  }),
  useClerk: () => ({
    openUserProfile: mock(() => {}),
    signOut: mockSignOut,
  }),
  UserProfile: () => <div data-testid="user-profile" />,
}));

mock.module("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => mock(async () => undefined),
  useAction: () => mock(async () => ({ ok: true, listKey: "vip", matched: "fallback" })),
}));

mock.module("@coucou/ui/tenant-template", () => ({
  TenantButton: (props: React.ComponentProps<"button">) => <button {...props} />,
}));

const { RsvpAcceptedForm } = await import("../app/events/[eventId]/rsvp/rsvp-accepted-form");

function createEvent(overrides: Partial<Event> = {}): Event {
  return {
    _id: "event_123" as Id<"events">,
    name: "Club Chlorine",
    hosts: ["Club Chlorine"],
    location: "Pool",
    eventDate: Date.now(),
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

async function renderRsvpForm(
  formVariant: "stepped" | "full" = "stepped",
  initialStep: "info" | "details" | "final" = "info",
  eventOverrides: Partial<Event> = {},
) {
  currentSearchParameters = new URLSearchParams(`step=${initialStep}`);
  routerReplaceCalls.length = 0;
  mockSignOut.mockClear();
  await act(async () => {
    render(
      <HapticProvider>
        <RsvpAcceptedForm
          eventId={"event_123" as Id<"events">}
          eventRouteId="club"
          event={createEvent(eventOverrides)}
          submitMode="collect"
          onCollect={mock(async () => undefined)}
          hasNoPasswordList
          hasPasswordList={false}
          formVariant={formVariant}
        />
      </HapticProvider>,
    );
  });
}

describe("RSVP stepper", () => {
  it("renders segmented progress with future steps disabled", async () => {
    await renderRsvpForm("stepped");

    const progress = screen.getByRole("navigation", { name: "RSVP progress" });
    const youStep = within(progress).getByRole("button", { name: /1\s+You/i });
    const detailsStep = within(progress).getByRole("button", { name: /2\s+Details/i });
    const submitStep = within(progress).getByRole("button", { name: /3\s+Submit/i });

    expect(youStep.getAttribute("aria-current")).toBe("step");
    expect((detailsStep as HTMLButtonElement).disabled).toBe(true);
    expect((submitStep as HTMLButtonElement).disabled).toBe(true);
  });

  it("allows completed-step back navigation", async () => {
    await renderRsvpForm("stepped", "final");

    const progress = screen.getByRole("navigation", { name: "RSVP progress" });
    expect(
      within(progress).getByRole("button", { name: /3\s+Submit/i }).getAttribute("aria-current"),
    ).toBe("step");
    expect(
      (within(progress).getByRole("button", { name: /1\s+You/i }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(
      (within(progress).getByRole("button", { name: /2\s+Details/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    fireEvent.click(within(progress).getByRole("button", { name: /1\s+You/i }));

    await waitFor(() => {
      expect(
        within(progress).getByRole("button", { name: /1\s+You/i }).getAttribute("aria-current"),
      ).toBe("step");
    });
    expect(routerReplaceCalls.at(-1)).toBe("/events/club/rsvp?step=info");
  });

  it("does not render progress for the full-form RSVP variant", async () => {
    await renderRsvpForm("full");

    expect(screen.queryByRole("navigation", { name: "RSVP progress" })).toBeNull();
  });

  it("hides the attendees selector when the event is fixed to one attendee", async () => {
    await renderRsvpForm("stepped", "details", { maxAttendees: 1 });

    expect(screen.queryByText(/ATTENDEES/i)).toBeNull();
  });

  it("hides the attendees selector in the full-form RSVP when fixed to one attendee", async () => {
    await renderRsvpForm("full", "info", { maxAttendees: 1 });

    expect(screen.queryByText(/ATTENDEES/i)).toBeNull();
  });

  it("signs out to phone auth without advancing when updating the RSVP phone", async () => {
    await renderRsvpForm("stepped");

    fireEvent.click(screen.getByRole("button", { name: /update/i }));

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
    expect(routerReplaceCalls).toEqual([]);

    const signOutOptions = mockSignOut.mock.calls[0]?.[0] as { redirectUrl?: string } | undefined;
    expect(signOutOptions?.redirectUrl).toContain(
      "http://localhost:5680/clients/club-chlorine/sign-in",
    );
    const redirectUrl = new URL(signOutOptions?.redirectUrl ?? "").searchParams.get(
      "redirect_url",
    );
    expect(redirectUrl).toContain("/events/club/rsvp?step=info");
    expect(redirectUrl).toContain("__clerk_synced=false");
  });
});
