import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type FunctionReference, getFunctionName } from "convex/server";
import React from "react";
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

let clerkIsSignedIn = false;
let currentRsvpStatus: MockRsvpStatus | null = null;
let currentUserDocument: MockUserDocument | undefined;
let currentUserSocialProfiles: Array<{ platformKey: string; handle: string }> | undefined;

interface CountrySelectorProps {
  value: string;
  onChange: (countryCode: string) => void;
}

const routerReplaceCalls: string[] = [];
const emptySocialProfiles: Array<{ platformKey: string; handle: string }> = [];
const mutationMock = mock(async () => undefined);
const resolveListByPasswordMock = mock(async () => ({
  ok: true,
  listKey: "vip",
  matched: "fallback",
}));

function createEvent(overrides: Partial<Event> = {}): Event {
  return {
    _id: "event_123" as Id<"events">,
    shortId: "chlorine-night",
    name: "Club Chlorine",
    hosts: ["Club Chlorine"],
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
  const baseStorageKey = `club-chlorine:rsvp-draft:v1:${eventRouteId}`;
  return clerkUserId ? `${baseStorageKey}:user:${clerkUserId}` : baseStorageKey;
}

function createStoredDraft(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    updatedAt: Date.now(),
    name: "",
    firstName: "",
    lastName: "",
    phoneCountryCode: "+1",
    phoneNationalNumber: "",
    custom: {},
    socialProfiles: {},
    invitedByName: "",
    note: "",
    attendanceStatus: "yes",
    attendees: 1,
    accessPassword: "",
    smsConsentEnabled: false,
    hasAcknowledgedSmsOptOutPrompt: false,
    ...overrides,
  };
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
    if (queryFunctionName === "users:getByClerkUser") return currentUserDocument;
    if (queryFunctionName === "socialProfiles:listForCurrentUser") {
      return currentUserSocialProfiles ?? emptySocialProfiles;
    }
    return undefined;
  },
  useMutation: () => mutationMock,
  useAction: () => resolveListByPasswordMock,
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
    clerkIsSignedIn = false;
    currentRsvpStatus = null;
    currentUserDocument = undefined;
    currentUserSocialProfiles = undefined;
    routerReplaceCalls.length = 0;
    window.localStorage.clear();
  });

  it("debounces non-signed-in RSVP form state before submit and restores it on remount", async () => {
    const eventRouteId = "chlorine-night";
    const storageKey = draftStorageKey(eventRouteId);
    const event = createEvent();

    const renderedForm = render(
      <RsvpAcceptedForm
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
    fireEvent.click(screen.getByLabelText(/enable sms/i));

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
      expect(screen.getByLabelText(/enable sms/i)).toBeChecked();
    });
  });

  it("does not erase the realtime draft after a successful collect submit", async () => {
    const eventRouteId = "chlorine-night";
    const storageKey = draftStorageKey(eventRouteId);
    const event = createEvent();
    const onCollect = mock(async () => undefined);

    render(
      <RsvpAcceptedForm
        eventId={event._id}
        eventRouteId={eventRouteId}
        event={event}
        hasNoPasswordList
        isSignedIn={false}
        submitMode="collect"
        onCollect={onCollect}
      />,
    );

    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Ada" } });
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: "Lovelace" } });
    fireEvent.change(screen.getByLabelText(/phone number/i), {
      target: { value: "5105080309" },
    });
    fireEvent.click(screen.getByLabelText(/enable sms/i));

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
      expect(submitButton).not.toBeDisabled();
    });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(onCollect).toHaveBeenCalledTimes(1);
    });
    const rawDraftAfterSubmit = window.localStorage.getItem(storageKey);
    expect(rawDraftAfterSubmit).not.toBeNull();
    const draftAfterSubmit = JSON.parse(rawDraftAfterSubmit ?? "{}") as Record<string, unknown>;
    expect(draftAfterSubmit.firstName).toBe("Ada");
    expect(draftAfterSubmit.lastName).toBe("Lovelace");
  });

  it("persists signed-in RSVP form state when no db values are present", async () => {
    clerkIsSignedIn = true;
    const eventRouteId = "chlorine-night";
    const storageKey = draftStorageKey(eventRouteId, "user_123");
    const event = createEvent();

    const renderedForm = render(
      <RsvpAcceptedForm
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

  it("overwrites local drafts with present db values", async () => {
    clerkIsSignedIn = true;
    const eventRouteId = "chlorine-night";
    const event = createEvent();
    window.localStorage.setItem(
      draftStorageKey(eventRouteId, "user_123"),
      JSON.stringify(
        createStoredDraft({
          name: "Local Draft",
          firstName: "Local",
          lastName: "Draft",
          phoneNationalNumber: "510 508 9999",
          custom: { dietary: "Local meal" },
          socialProfiles: { instagram: "@local" },
          invitedByName: "Local Host",
          attendanceStatus: "maybe",
          smsConsentEnabled: true,
        }),
      ),
    );
    currentUserDocument = {
      _id: "user_doc_123",
      firstName: "Database",
      lastName: "Guest",
    };
    currentRsvpStatus = {
      customFieldValues: { dietary: "Database meal" },
      socialProfiles: [{ platformKey: "instagram", handle: "@database" }],
      invitedByName: "Database Host",
      attendanceStatus: "no",
      smsConsent: false,
    };

    render(
      <RsvpAcceptedForm
        eventId={event._id}
        eventRouteId={eventRouteId}
        event={event}
        hasNoPasswordList
        isSignedIn
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/first name/i)).toHaveValue("Database");
      expect(screen.getByLabelText(/last name/i)).toHaveValue("Guest");
      expect(screen.getByPlaceholderText("Dietary")).toHaveValue("Database meal");
      expect(screen.getByLabelText(/instagram/i)).toHaveValue("@database");
      expect(screen.getByLabelText(/invited by/i)).toHaveValue("Database Host");
      expect(screen.getByLabelText(/enable sms/i)).not.toBeChecked();
    });
  });
});
