import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type FunctionReference, getFunctionName } from "convex/server";
import React from "react";
import type { RsvpCollectedArgs } from "@/lib/rsvp-form-state";
import type { Event } from "@/lib/types";

type QueryArgs = Record<string, unknown> | "skip";
type AttendanceStatusOption = "yes" | "no" | "maybe";

interface MockRsvpStatus {
  customFieldValues?: Record<string, string>;
  socialProfiles?: Array<{ platformKey: string; handle: string }>;
  invitedByName?: string;
  attendanceStatus?: AttendanceStatusOption;
  smsConsent?: boolean;
  smsConsentIpAddress?: string;
}

interface MockUserDocument {
  _id: string;
  firstName?: string;
  lastName?: string;
}

interface MockOrganizerSmsPreference {
  smsConsent: boolean;
  source: "organizer" | "none";
}

let clerkIsSignedIn = false;
let currentRsvpStatus: MockRsvpStatus | null = null;
let currentOrganizerSmsPreference: MockOrganizerSmsPreference | null = null;
let currentUserDocument: MockUserDocument | undefined;
let currentUserSocialProfiles: Array<{ platformKey: string; handle: string }> | undefined;

interface CountrySelectorProps {
  value: string;
  onChange: (countryCode: string) => void;
}

const routerReplaceCalls: string[] = [];
const emptySocialProfiles: Array<{ platformKey: string; handle: string }> = [];
const mutationMock = mock(async (_submission?: RsvpCollectedArgs) => undefined);
const resolveListByPasswordMock = mock(async (argumentsValue: { password: string }) => ({
  ok: true,
  listKey: argumentsValue.password === "fancy" ? "vip" : "ga",
  matched: argumentsValue.password === "fancy" ? "password" : "no-password",
}));

function createEvent(overrides: Partial<Event> = {}): Event {
  return {
    _id: "event_123" as Id<"events">,
    shortId: "dojo-night",
    name: "Dojo Pomodoro",
    hosts: ["Dojo Pomodoro"],
    location: "Pool",
    eventDate: Date.now() + 24 * 60 * 60 * 1000,
    eventTimezone: "America/New_York",
    status: "active",
    lifecycle: "published",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    customFields: [
      {
        key: "dietary",
        label: "Dietary",
        required: false,
        type: "text",
      },
    ],
    maxAttendees: 1,
    attendanceQuestionEnabled: false,
    primaryFieldConfig: {
      socialPlatforms: [
        {
          platformKey: "instagram",
          label: "Instagram",
          required: false,
          placeholder: "@handle",
        },
      ],
      invitedBy: {
        enabled: true,
        label: "Invited by",
        required: false,
        placeholder: "Who invited you?",
      },
    },
    ...overrides,
  } as Event;
}

function getConvexFunctionName(functionReference: unknown): string {
  return getFunctionName(functionReference as FunctionReference<"query" | "mutation" | "action">);
}

function draftStorageKey(eventRouteId: string, clerkUserId?: string): string {
  const baseStorageKey = `dojo:rsvp-draft:v1:${eventRouteId}`;
  return clerkUserId ? `${baseStorageKey}:user:${clerkUserId}` : baseStorageKey;
}

mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: mock(() => {}),
    replace: (nextPath: string) => {
      routerReplaceCalls.push(nextPath);
    },
    refresh: mock(() => {}),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

mock.module("@clerk/nextjs", () => ({
  useUser: () => ({
    isLoaded: true,
    isSignedIn: clerkIsSignedIn,
    user: clerkIsSignedIn
      ? {
          id: "user_123",
          firstName: "Signed",
          lastName: "Guest",
          fullName: "Signed Guest",
          primaryPhoneNumber: { phoneNumber: "+15555550123" },
          phoneNumbers: [{ phoneNumber: "+15555550123" }],
        }
      : null,
  }),
}));

mock.module("convex/react", () => ({
  useQuery: (queryReference: unknown, queryArgs: QueryArgs) => {
    if (queryArgs === "skip") return undefined;
    const queryFunctionName = getConvexFunctionName(queryReference);
    if (queryFunctionName === "rsvps:statusForUserEvent") return currentRsvpStatus;
    if (queryFunctionName === "rsvps:smsPreferenceForUserEvent") {
      return currentOrganizerSmsPreference;
    }
    if (queryFunctionName === "users:getByClerkUser") return currentUserDocument;
    if (queryFunctionName === "socialProfiles:listForCurrentUser") {
      return currentUserSocialProfiles ?? emptySocialProfiles;
    }
    return undefined;
  },
  useMutation: () => mutationMock,
  useAction: () => resolveListByPasswordMock,
}));

mock.module("@/contexts/haptic-context", () => ({
  useHapticContext: () => ({ trigger: () => undefined }),
}));
mock.module("@coucou/ui/auth", () => ({
  countries: [
    { code: "+1", flag: "US", name: "United States" },
    { code: "+44", flag: "GB", name: "United Kingdom" },
  ],
  CountrySelector: ({ value, onChange }: CountrySelectorProps) => (
    <select
      aria-label="Country code"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="+1">US +1</option>
      <option value="+44">GB +44</option>
    </select>
  ),
}));

mock.module("@coucou/ui/tenant-template", () => ({
  TenantButton: (props: React.ComponentProps<"button">) => <button {...props} />,
}));

mock.module("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ open, children }: { open?: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  AlertDialogAction: (props: React.ComponentProps<"button">) => <button {...props} />,
  AlertDialogCancel: (props: React.ComponentProps<"button">) => <button {...props} />,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

mock.module("@/lib/sms-consent", () => ({
  fetchSmsConsentIpAddress: mock(async () => "127.0.0.1"),
}));

mock.module("sonner", () => ({
  toast: {
    success: mock(() => undefined),
    error: mock(() => undefined),
  },
}));

const { RsvpAcceptedForm } = await import("../app/events/[eventId]/rsvp/rsvp-accepted-form");

describe("RsvpAcceptedForm draft persistence", () => {
  beforeEach(() => {
    resolveListByPasswordMock.mockImplementation(async (argumentsValue: { password: string }) => ({
      ok: true,
      listKey: argumentsValue.password === "fancy" ? "vip" : "ga",
      matched: argumentsValue.password === "fancy" ? "password" : "no-password",
    }));
    clerkIsSignedIn = false;
    currentRsvpStatus = null;
    currentOrganizerSmsPreference = null;
    currentUserDocument = undefined;
    currentUserSocialProfiles = undefined;
    routerReplaceCalls.length = 0;
    window.localStorage.clear();
  });

  it("debounces non-signed-in RSVP form state before submit and restores it on remount", async () => {
    const eventRouteId = "dojo-night";
    const storageKey = draftStorageKey(eventRouteId);
    const event = createEvent();

    const renderedForm = render(
      <RsvpAcceptedForm
        onCollect={mutationMock}
        eventId={event._id}
        eventRouteId={eventRouteId}
        event={event}
        hasNoPasswordList
        isSignedIn={false}
      />,
    );

    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Ada" } });
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: "Lovelace" } });
    fireEvent.change(screen.getByLabelText(/phone number/i), {
      target: { value: "5105080309" },
    });
    fireEvent.change(screen.getByLabelText(/instagram/i), { target: { value: "@ada" } });
    fireEvent.change(screen.getByLabelText(/invited by/i), { target: { value: "Orson" } });
    fireEvent.change(screen.getByPlaceholderText("Dietary"), {
      target: { value: "Vegetarian" },
    });
    fireEvent.change(screen.getByPlaceholderText(/anything hosts should know/i), {
      target: { value: "Arriving late" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "pool" } });
    fireEvent.click(screen.getByLabelText(/recurring sms messages from dojo pomodoro/i));

    await waitFor(() => {
      const rawDraft = window.localStorage.getItem(storageKey);
      expect(rawDraft).not.toBeNull();
      const draft = JSON.parse(rawDraft ?? "{}") as Record<string, unknown>;
      expect(draft.firstName).toBe("Ada");
      expect(draft.lastName).toBe("Lovelace");
      expect(draft.phoneCountryCode).toBe("+1");
      expect(draft.phoneNationalNumber).toBe("510 508 0309");
      expect(draft.socialProfiles).toEqual({ instagram: "@ada" });
      expect(draft.custom).toEqual({ dietary: "Vegetarian" });
      expect(draft.invitedByName).toBe("Orson");
      expect(draft.note).toBe("Arriving late");
      expect(draft.accessPassword).toBe("pool");
      expect(draft.smsConsentEnabled).toBe(true);
    });

    renderedForm.unmount();
    render(
      <RsvpAcceptedForm
        onCollect={mutationMock}
        eventId={event._id}
        eventRouteId={eventRouteId}
        event={event}
        hasNoPasswordList
        isSignedIn={false}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/first name/i)).toHaveValue("Ada");
      expect(screen.getByLabelText(/last name/i)).toHaveValue("Lovelace");
      expect(screen.getByLabelText(/phone number/i)).toHaveValue("510 508 0309");
      expect(screen.getByLabelText(/instagram/i)).toHaveValue("@ada");
      expect(screen.getByLabelText(/invited by/i)).toHaveValue("Orson");
      expect(screen.getByPlaceholderText("Dietary")).toHaveValue("Vegetarian");
      expect(screen.getByPlaceholderText(/anything hosts should know/i)).toHaveValue(
        "Arriving late",
      );
      expect(screen.getByLabelText(/password/i)).toHaveValue("pool");
      expect(screen.getByLabelText(/recurring sms messages from dojo pomodoro/i)).not.toBeChecked();
    });
  });

  it("does not erase the realtime draft after a successful collect submit", async () => {
    const eventRouteId = "dojo-night";
    const storageKey = draftStorageKey(eventRouteId);
    const event = createEvent();
    const onCollect = mock(async (_submission: RsvpCollectedArgs) => undefined);

    render(
      <RsvpAcceptedForm
        eventId={event._id}
        eventRouteId={eventRouteId}
        event={event}
        hasNoPasswordList
        isSignedIn={false}
        onCollect={onCollect}
      />,
    );

    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Ada" } });
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: "Lovelace" } });
    fireEvent.change(screen.getByLabelText(/phone number/i), {
      target: { value: "5105080309" },
    });

    await waitFor(() => {
      const rawDraft = window.localStorage.getItem(storageKey);
      expect(rawDraft).not.toBeNull();
      const draft = JSON.parse(rawDraft ?? "{}") as Record<string, unknown>;
      expect(draft.firstName).toBe("Ada");
      expect(draft.lastName).toBe("Lovelace");
      expect(draft.phoneNationalNumber).toBe("510 508 0309");
    });

    const submitButton = screen.getByRole("button", { name: /submit request/i });
    await waitFor(() => {
      expect(submitButton.hasAttribute("disabled")).toBe(false);
    });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(onCollect).toHaveBeenCalledTimes(1);
    });
    expect(onCollect.mock.calls[0]?.[0]).toMatchObject({ smsConsent: false });
    const rawDraftAfterSubmit = window.localStorage.getItem(storageKey);
    expect(rawDraftAfterSubmit).not.toBeNull();
    const draftAfterSubmit = JSON.parse(rawDraftAfterSubmit ?? "{}") as Record<string, unknown>;
    expect(draftAfterSubmit.firstName).toBe("Ada");
    expect(draftAfterSubmit.lastName).toBe("Lovelace");
  });

  it("persists signed-in RSVP form state when no db values are present", async () => {
    clerkIsSignedIn = true;
    const eventRouteId = "dojo-night";
    const storageKey = draftStorageKey(eventRouteId, "user_123");
    const event = createEvent();

    const renderedForm = render(
      <RsvpAcceptedForm
        onCollect={mutationMock}
        eventId={event._id}
        eventRouteId={eventRouteId}
        event={event}
        hasNoPasswordList
        isSignedIn
      />,
    );

    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Local" } });
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: "Draft" } });
    fireEvent.change(screen.getByLabelText(/phone number/i), {
      target: { value: "5105089999" },
    });

    await waitFor(() => {
      const rawDraft = window.localStorage.getItem(storageKey);
      expect(rawDraft).not.toBeNull();
      const draft = JSON.parse(rawDraft ?? "{}") as Record<string, unknown>;
      expect(draft.firstName).toBe("Local");
      expect(draft.lastName).toBe("Draft");
      expect(draft.phoneNationalNumber).toBe("510 508 9999");
    });

    renderedForm.unmount();
    render(
      <RsvpAcceptedForm
        onCollect={mutationMock}
        eventId={event._id}
        eventRouteId={eventRouteId}
        event={event}
        hasNoPasswordList
        isSignedIn
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/first name/i)).toHaveValue("Local");
      expect(screen.getByLabelText(/last name/i)).toHaveValue("Draft");
      expect(screen.getByLabelText(/phone number/i)).toHaveValue("510 508 9999");
    });
  });

  it("shows first-time SMS consent as optional and unchecked without an encouragement dialog", () => {
    render(
      <RsvpAcceptedForm
        onCollect={mutationMock}
        eventId={createEvent()._id}
        eventRouteId="dojo-night"
        event={createEvent()}
        hasPasswordList={false}
        isSignedIn={false}
      />,
    );

    const smsConsentCheckbox = screen.getByLabelText(/recurring sms messages from dojo pomodoro/i);
    expect(smsConsentCheckbox).not.toBeChecked();
    expect(
      screen.getByText(
        /Dojo Pomodoro may send account notifications, RSVP and guest-list updates/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Get Event Updates by SMS/i)).not.toBeInTheDocument();
  });

  it("defaults a future-event RSVP to an existing organizer SMS opt-in", async () => {
    clerkIsSignedIn = true;
    currentOrganizerSmsPreference = {
      smsConsent: true,
      source: "organizer",
    };

    render(
      <RsvpAcceptedForm
        onCollect={mutationMock}
        eventId={createEvent()._id}
        eventRouteId="dojo-night"
        event={createEvent()}
        hasPasswordList={false}
        isSignedIn
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/recurring sms messages from dojo pomodoro/i)).toBeChecked();
    });
  });
  it("uses configured social, custom, invited-by, attendees, and attendance fields in order", async () => {
    clerkIsSignedIn = true;
    const event = createEvent({ maxAttendees: 3, attendanceQuestionEnabled: true });
    const onCollect = mock(async (_submission: RsvpCollectedArgs) => undefined);
    render(
      <RsvpAcceptedForm
        eventId={event._id}
        event={event}
        isSignedIn
        hasNoPasswordList
        onCollect={onCollect}
      />,
    );
    const orderedFields = [
      screen.getByLabelText(/first name/i),
      screen.getByLabelText(/phone number/i),
      screen.getByLabelText(/instagram/i),
      screen.getByPlaceholderText("Dietary"),
      screen.getByLabelText(/invited by/i),
      screen.getByLabelText(/attendees/i),
      screen.getByPlaceholderText(/anything hosts should know/i),
      screen.getByLabelText(/password/i),
    ];
    for (let fieldIndex = 1; fieldIndex < orderedFields.length; fieldIndex++) {
      expect(
        orderedFields[fieldIndex - 1]?.compareDocumentPosition(orderedFields[fieldIndex]!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    fireEvent.change(screen.getByLabelText(/attendees/i), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Maybe" }));
    fireEvent.change(screen.getByLabelText(/instagram/i), { target: { value: "@configured" } });
    fireEvent.change(screen.getByLabelText(/invited by/i), { target: { value: "Host" } });
    const submitButton = screen.getByRole("button", { name: /submit request/i });
    await waitFor(() => expect(submitButton.hasAttribute("disabled")).toBe(false), {
      mutationObserverOptions: { childList: true, subtree: true },
    });
    fireEvent.click(submitButton);
    await waitFor(() => expect(onCollect).toHaveBeenCalledTimes(1));
    expect(onCollect.mock.calls[0]?.[0]).toMatchObject({
      attendees: 3,
      attendanceStatus: "maybe",
      invitedByName: "Host",
      socialProfiles: [{ platformKey: "instagram", handle: "@configured" }],
    });
  });

  it("honors configured required fields and omits disabled questions", async () => {
    clerkIsSignedIn = true;
    const event = createEvent({
      primaryFieldConfig: {
        socialPlatforms: [{ platformKey: "instagram", label: "Instagram", required: true }],
        invitedBy: { enabled: false },
      },
    });
    const onCollect = mock(async (_submission: RsvpCollectedArgs) => undefined);
    render(
      <RsvpAcceptedForm
        eventId={event._id}
        event={event}
        isSignedIn
        hasNoPasswordList
        hasPasswordList={false}
        onCollect={onCollect}
      />,
    );
    expect(screen.queryByLabelText(/invited by/i)).toBeNull();
    expect(screen.queryByLabelText(/attendees/i)).toBeNull();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(screen.queryByText("Attending?")).toBeNull();
    const submitButton = screen.getByRole("button", { name: /submit request/i });
    await waitFor(() => expect(submitButton.hasAttribute("disabled")).toBe(false));
    fireEvent.click(submitButton);
    await waitFor(() =>
      expect(screen.getAllByText("Instagram is required").length).toBeGreaterThan(0),
    );
    expect(onCollect).not.toHaveBeenCalled();
  });

  it("invalidates a previous password immediately and shows the public-list fallback", async () => {
    clerkIsSignedIn = true;
    const event = createEvent();
    const onCollect = mock(async (_submission: RsvpCollectedArgs) => undefined);
    render(
      <RsvpAcceptedForm
        eventId={event._id}
        event={event}
        isSignedIn
        hasNoPasswordList
        initialPassword="FANCY"
        onCollect={onCollect}
      />,
    );
    const submitButton = screen.getByRole("button", { name: /submit request/i });
    await waitFor(() => expect(submitButton.hasAttribute("disabled")).toBe(false));
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "unknown" } });
    expect(submitButton).toBeDisabled();
    await act(async () => {
      fireEvent.submit(submitButton.closest("form")!);
    });
    expect(onCollect).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByText(/Password not recognized — RSVP will be submitted to/)).toBeTruthy(),
    );
    await waitFor(() => expect(submitButton.hasAttribute("disabled")).toBe(false));
    fireEvent.click(submitButton);
    await waitFor(() => expect(onCollect).toHaveBeenCalledTimes(1));
    expect(onCollect.mock.calls[0]?.[0]).toMatchObject({ resolvedListKey: "ga" });
  });

  it("ignores an old lookup that finishes after the guest switches passwords", async () => {
    clerkIsSignedIn = true;
    let finishOldLookup:
      | ((result: { ok: boolean; listKey: string; matched: string }) => void)
      | undefined;
    resolveListByPasswordMock.mockImplementation(async ({ password }) => {
      if (password === "fancy")
        return await new Promise((resolve) => {
          finishOldLookup = resolve;
        });
      return { ok: true, listKey: "ga", matched: "no-password" };
    });
    const event = createEvent();
    const onCollect = mock(async (_submission: RsvpCollectedArgs) => undefined);
    render(
      <RsvpAcceptedForm
        eventId={event._id}
        event={event}
        isSignedIn
        hasNoPasswordList
        onCollect={onCollect}
      />,
    );
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "fancy" } });
    await waitFor(() => expect(finishOldLookup).toBeDefined());
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "public" } });
    await waitFor(() =>
      expect(screen.getByText(/Password not recognized — RSVP will be submitted to/)).toBeTruthy(),
    );
    await act(async () => {
      finishOldLookup?.({ ok: true, listKey: "vip", matched: "password" });
    });
    fireEvent.click(screen.getByRole("button", { name: /submit request/i }));
    await waitFor(() => expect(onCollect).toHaveBeenCalledTimes(1));
    expect(onCollect.mock.calls[0]?.[0]).toMatchObject({ resolvedListKey: "ga" });
  });
});
