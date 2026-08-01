import { describe, expect, it } from "vitest";
import { countRsvpsWithAggregate, rsvpAggregate } from "../convex/lib/rsvpAggregate";
import {
  applyCollectedRsvpFilters,
  buildRsvpFuzzySearchTerms,
  fieldValuesMatchRsvpFuzzySearchTerms,
  filtersRequireDirectRsvpCount,
  normalizeTicketStatusFilter,
} from "../convex/lib/rsvpFilters";

type MockRsvpRecord = {
  listKey: string;
  status: "pending" | "approved" | "denied" | "attending";
  ticketStatus?: "not-issued" | "issued" | "disabled" | "redeemed";
};

describe("RSVP filtering helpers", () => {
  it("uses aggregate counts correctly for list, approval-group, and event-wide totals", async () => {
    const requestedKeys: string[] = [];
    const originalCount = rsvpAggregate.count;

    Object.defineProperty(rsvpAggregate, "count", {
      configurable: true,
      value: (async (
        _context: Parameters<typeof originalCount>[0],
        options: Parameters<typeof originalCount>[1],
      ) => {
        const lowerBoundKey = (
          options as {
            bounds?: {
              lower?: {
                key?: [string, string, string];
              };
            };
          }
        ).bounds?.lower?.key ?? ["", "", ""];
        const [eventId, statusKey, listKey] = lowerBoundKey;
        requestedKeys.push(`${eventId}:${statusKey}:${listKey}`);

        if (statusKey === "" && listKey === "") {
          return 12;
        }

        if (statusKey === "attending" && listKey === "vip") {
          return 3;
        }

        return 1;
      }) as typeof originalCount,
    });

    try {
      const listAggregateCount = await countRsvpsWithAggregate(
        {} as Parameters<typeof countRsvpsWithAggregate>[0],
        "event_123" as never,
        "all",
        "vip",
      );
      const exactAggregateCount = await countRsvpsWithAggregate(
        {} as Parameters<typeof countRsvpsWithAggregate>[0],
        "event_123" as never,
        "approved",
        "vip",
      );
      const eventWideAggregateCount = await countRsvpsWithAggregate(
        {} as Parameters<typeof countRsvpsWithAggregate>[0],
        "event_123" as never,
        "all",
        "all",
      );

      expect(listAggregateCount).toBe(6);
      expect(exactAggregateCount).toBe(4);
      expect(eventWideAggregateCount).toBe(12);
      expect(requestedKeys).toContain("event_123:pending:vip");
      expect(requestedKeys).toContain("event_123:approved:vip");
      expect(requestedKeys).toContain("event_123:attending:vip");
      expect(requestedKeys).toContain("event_123:denied:vip");
      expect(requestedKeys).toContain("event_123::");
    } finally {
      Object.defineProperty(rsvpAggregate, "count", {
        configurable: true,
        value: originalCount,
      });
    }
  });

  it("post-filters guest search results by approval group and list membership", () => {
    const searchResults: MockRsvpRecord[] = [
      { listKey: "vip", status: "approved", ticketStatus: "issued" },
      { listKey: "vip", status: "attending", ticketStatus: "redeemed" },
      { listKey: "general", status: "approved", ticketStatus: "issued" },
      { listKey: "vip", status: "denied", ticketStatus: "issued" },
    ];

    const filteredResults = applyCollectedRsvpFilters(searchResults, {
      approvalFilter: "approved",
      listFilter: "vip",
      ticketStatusFilter: null,
    });

    expect(filteredResults).toEqual([
      { listKey: "vip", status: "approved", ticketStatus: "issued" },
      { listKey: "vip", status: "attending", ticketStatus: "redeemed" },
    ]);
  });

  it("treats undefined ticket status as not-issued during post-filtering", () => {
    const searchResults: MockRsvpRecord[] = [
      { listKey: "vip", status: "approved" },
      { listKey: "vip", status: "approved", ticketStatus: "not-issued" },
      { listKey: "vip", status: "approved", ticketStatus: "issued" },
    ];

    const filteredResults = applyCollectedRsvpFilters(searchResults, {
      approvalFilter: "approved",
      listFilter: "vip",
      ticketStatusFilter: normalizeTicketStatusFilter("not-issued"),
    });

    expect(filteredResults).toEqual([
      { listKey: "vip", status: "approved" },
      { listKey: "vip", status: "approved", ticketStatus: "not-issued" },
    ]);
  });

  it("uses direct counting whenever guest search or ticket filters are active", () => {
    expect(
      filtersRequireDirectRsvpCount({
        guestSearch: "Ava",
        ticketStatusFilter: null,
      }),
    ).toBe(true);

    expect(
      filtersRequireDirectRsvpCount({
        guestSearch: "",
        ticketStatusFilter: normalizeTicketStatusFilter("issued"),
      }),
    ).toBe(true);

    expect(
      filtersRequireDirectRsvpCount({
        guestSearch: "",
        ticketStatusFilter: null,
      }),
    ).toBe(false);
  });

  it("builds RSVP fuzzy search terms for social handles with @ prefixes", () => {
    expect(buildRsvpFuzzySearchTerms("@foo.bar")).toEqual(["@foo.bar", "foo.bar"]);
    expect(fieldValuesMatchRsvpFuzzySearchTerms(["foo.bar"], ["@foo.bar", "foo.bar"])).toBe(true);
  });

  it("matches unified RSVP search terms against guests, socials, and invited-by values", () => {
    const invitedBySearchTerms = buildRsvpFuzzySearchTerms("Orson");
    const socialSearchTerms = buildRsvpFuzzySearchTerms("@foobaz");
    const guestSearchTerms = buildRsvpFuzzySearchTerms("Ava");

    expect(fieldValuesMatchRsvpFuzzySearchTerms(["Ava Green"], guestSearchTerms)).toBe(true);
    expect(
      fieldValuesMatchRsvpFuzzySearchTerms(["orson", "Orson Welles"], invitedBySearchTerms),
    ).toBe(true);
    expect(fieldValuesMatchRsvpFuzzySearchTerms(["foobaz"], socialSearchTerms)).toBe(true);
    expect(fieldValuesMatchRsvpFuzzySearchTerms(["unrelated"], socialSearchTerms)).toBe(false);
  });
});
