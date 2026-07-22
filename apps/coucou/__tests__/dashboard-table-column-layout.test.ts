import { describe, expect, it } from "bun:test";
import {
  mergeDashboardTablePreferenceState,
  moveDashboardTableColumnId,
} from "../lib/dashboard-table-preferences";

const NEW_GUEST_DIRECTORY_COLUMN_IDS = [
  "select",
  "person",
  "tags",
  "notes",
  "defaultListKey",
  "latestEventStatus",
  "smsConsent",
  "receivedTexts",
  "eventCount",
  "eventsAttended",
  "role",
  "firstRsvpAt",
  "events",
  "actions",
];

const PRIOR_RELEASE_COLUMN_IDS = [
  "select",
  "person",
  "events",
  "defaultListKey",
  "tags",
  "latestEventStatus",
  "smsConsent",
  "receivedTexts",
  "role",
  "firstRsvpAt",
  "actions",
];

describe("moveDashboardTableColumnId", () => {
  it("moves a column before and after a target", () => {
    const columnOrder = ["a", "b", "c", "d"];
    expect(moveDashboardTableColumnId(columnOrder, "d", "b", "before")).toEqual([
      "a",
      "d",
      "b",
      "c",
    ]);
    expect(moveDashboardTableColumnId(columnOrder, "a", "c", "after")).toEqual([
      "b",
      "c",
      "a",
      "d",
    ]);
  });

  it("returns the original array for no-op or invalid moves", () => {
    const columnOrder = ["a", "b", "c"];
    expect(moveDashboardTableColumnId(columnOrder, "a", "a", "before")).toBe(columnOrder);
    expect(moveDashboardTableColumnId(columnOrder, "missing", "b", "before")).toBe(columnOrder);
    expect(moveDashboardTableColumnId(columnOrder, "a", "missing", "after")).toBe(columnOrder);
    // Dropping "b" before "c" leaves the order unchanged.
    expect(moveDashboardTableColumnId(columnOrder, "b", "c", "before")).toBe(columnOrder);
  });
});

describe("guest directory preference migration behavior", () => {
  it("appends the new columns after a prior release's saved order and keeps events visible", () => {
    const mergedState = mergeDashboardTablePreferenceState({
      availableColumnIds: NEW_GUEST_DIRECTORY_COLUMN_IDS,
      defaultVisibleColumnIds: NEW_GUEST_DIRECTORY_COLUMN_IDS.filter(
        (columnId) => columnId !== "events",
      ),
      savedColumnOrder: PRIOR_RELEASE_COLUMN_IDS,
      hiddenColumnIds: [],
    });

    expect(mergedState.columnOrder).toEqual([
      ...PRIOR_RELEASE_COLUMN_IDS,
      "notes",
      "eventCount",
      "eventsAttended",
    ]);
    // Saved (empty) hiddenColumnIds win over the new defaults: events stays visible.
    expect(mergedState.hiddenColumnIds).toEqual([]);
    expect(mergedState.visibleColumnIds).toContain("events");
  });

  it("hides events by default for fresh users", () => {
    const mergedState = mergeDashboardTablePreferenceState({
      availableColumnIds: NEW_GUEST_DIRECTORY_COLUMN_IDS,
      defaultVisibleColumnIds: NEW_GUEST_DIRECTORY_COLUMN_IDS.filter(
        (columnId) => columnId !== "events",
      ),
      savedColumnOrder: undefined,
      hiddenColumnIds: undefined,
    });

    expect(mergedState.columnOrder).toEqual(NEW_GUEST_DIRECTORY_COLUMN_IDS);
    expect(mergedState.hiddenColumnIds).toEqual(["events"]);
    expect(mergedState.visibleColumnIds).not.toContain("events");
  });
});
