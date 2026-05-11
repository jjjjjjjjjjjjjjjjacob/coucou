import { describe, expect, it } from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import { fireEvent, render, screen } from "@testing-library/react";
import EventCardClient from "../app/workspaces/[workspaceSlug]/host/events/event-card-client";
import { Select, SelectOption } from "../components/ui/select";
import { HapticProvider } from "../contexts/haptic-context";
import {
  getDefaultVisibleDashboardTableColumnIds,
  getDefaultVisibleHostRsvpsTableColumnIds,
  mergeDashboardTablePreferenceState,
  shouldHydrateDashboardTablePreferenceState,
  shouldResetHostRsvpsSavedTablePreference,
} from "../lib/dashboard-table-preferences";
import type { Event } from "../lib/types";

interface ConvexTestGlobal {
  __setConvexQueryResponse?: (nextResponse: unknown) => void;
}

function setConvexQueryResponse(nextResponse: unknown) {
  (globalThis as typeof globalThis & ConvexTestGlobal).__setConvexQueryResponse?.(nextResponse);
}

function createEvent(): Event {
  return {
    _id: "event_123" as Id<"events">,
    name: "Club Chlorine",
    hosts: ["Club Chlorine"],
    location: "LE BAIN",
    eventDate: Date.now() + 86_400_000,
    eventTimezone: "America/New_York",
    lifecycle: "published",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe("admin dashboard design pass", () => {
  it("renders native selects with inset custom caret spacing", () => {
    render(
      <HapticProvider>
        <Select aria-label="Event filter" defaultValue="all" onValueChange={() => undefined}>
          <SelectOption value="all">All Events</SelectOption>
        </Select>
      </HapticProvider>,
    );

    const select = screen.getByRole("combobox", { name: "Event filter" });
    expect(select.className).toContain("appearance-none");
    expect(select.className).toContain("pr-10");
    expect((select as HTMLSelectElement).style.backgroundPosition).toBe("right 0.75rem center");
  });

  it("merges saved RSVP table preferences without hiding new event fields", () => {
    const availableColumnIds = [
      "select",
      "guest",
      "listKey",
      "noteForHosts",
      "custom_dietary",
      "actions",
    ];
    const forcedHiddenColumnIds = ["select", "actions"];
    const defaultVisibleColumnIds = getDefaultVisibleDashboardTableColumnIds(
      availableColumnIds,
      forcedHiddenColumnIds,
    );
    const mergedPreferenceState = mergeDashboardTablePreferenceState({
      availableColumnIds,
      defaultVisibleColumnIds,
      savedColumnOrder: ["listKey", "guest", "missingColumn"],
      hiddenColumnIds: ["noteForHosts"],
      forcedHiddenColumnIds,
    });

    expect(mergedPreferenceState.columnOrder).toEqual([
      "listKey",
      "guest",
      "select",
      "noteForHosts",
      "custom_dietary",
      "actions",
    ]);
    expect(mergedPreferenceState.visibleColumnIds).toEqual(["guest", "listKey", "custom_dietary"]);
    expect(mergedPreferenceState.hiddenColumnIds).toEqual(["select", "noteForHosts", "actions"]);
  });

  it("uses compact RSVP table defaults with created at the end", () => {
    const availableColumnIds = [
      "select",
      "guest",
      "listKey",
      "social_instagram",
      "invitedByName",
      "approvalStatus",
      "attendanceStatus",
      "referredByName",
      "createdAt",
      "attendees",
      "smsConsent",
      "ticketStatus",
      "ticketViewedAt",
      "noteForHosts",
      "custom_dietary",
      "actions",
    ];

    expect(getDefaultVisibleHostRsvpsTableColumnIds(availableColumnIds)).toEqual([
      "select",
      "guest",
      "listKey",
      "social_instagram",
      "invitedByName",
      "approvalStatus",
      "attendanceStatus",
      "referredByName",
      "createdAt",
    ]);
  });

  it("resets only old-looking RSVP table preferences", () => {
    const availableColumnIds = [
      "select",
      "guest",
      "listKey",
      "social_instagram",
      "invitedByName",
      "approvalStatus",
      "attendanceStatus",
      "referredByName",
      "createdAt",
      "attendees",
      "smsConsent",
      "ticketStatus",
      "ticketViewedAt",
      "noteForHosts",
      "custom_dietary",
      "actions",
    ];
    const defaultVisibleColumnIds = getDefaultVisibleHostRsvpsTableColumnIds(availableColumnIds);
    const defaultHiddenColumnIds = availableColumnIds.filter(
      (columnId) => !defaultVisibleColumnIds.includes(columnId),
    );

    expect(
      shouldResetHostRsvpsSavedTablePreference({
        availableColumnIds,
        defaultVisibleColumnIds,
        savedColumnOrder: defaultVisibleColumnIds.filter((columnId) => columnId !== "createdAt"),
        hiddenColumnIds: [...defaultHiddenColumnIds, "createdAt"],
      }),
    ).toBe(true);

    expect(
      shouldResetHostRsvpsSavedTablePreference({
        availableColumnIds,
        defaultVisibleColumnIds,
        savedColumnOrder: ["approvalStatus", "guest", "listKey", "createdAt"],
        hiddenColumnIds: defaultHiddenColumnIds,
      }),
    ).toBe(false);
  });

  it("does not rehydrate stale saved table preferences over local edits", () => {
    expect(
      shouldHydrateDashboardTablePreferenceState({
        currentPreferenceSignature: "local-visible-columns",
        savedPreferenceSignature: "older-saved-columns",
        hasLocalPreferenceEdits: true,
      }),
    ).toBe(false);

    expect(
      shouldHydrateDashboardTablePreferenceState({
        currentPreferenceSignature: "saved-columns",
        savedPreferenceSignature: "saved-columns",
        hasLocalPreferenceEdits: true,
      }),
    ).toBe(true);

    expect(
      shouldHydrateDashboardTablePreferenceState({
        currentPreferenceSignature: "default-columns",
        savedPreferenceSignature: "saved-columns",
        hasLocalPreferenceEdits: false,
      }),
    ).toBe(true);
  });

  it("keeps grid-card QR delivery inside the event actions menu", async () => {
    setConvexQueryResponse(1);

    render(
      <HapticProvider>
        <EventCardClient event={createEvent()} fileUrl={null} />
      </HapticProvider>,
    );

    expect(screen.queryByRole("button", { name: /Send QR codes/ })).toBeNull();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Open event actions" }), {
      button: 0,
      ctrlKey: false,
    });

    expect(await screen.findByRole("menuitem", { name: /Send QR codes \(1\)/ })).toBeTruthy();
  });
});
