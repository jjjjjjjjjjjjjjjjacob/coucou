import { normalizePrimaryFieldLookupText } from "@coucou/sdk/shared/primary-fields";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
  ALL_APPROVAL_STATUSES,
  type ApprovalFilter,
  getRawStatusesForApprovalFilter,
  matchesApprovalFilter,
  resolveApprovalStatus,
} from "./rsvpStatus";

export const validRsvpStatuses = ALL_APPROVAL_STATUSES;
export type ValidRsvpStatus = (typeof ALL_APPROVAL_STATUSES)[number];

export type TicketStatusFilter = "not-issued" | "issued" | "disabled" | "redeemed";
export type QrDeliveryFilter = "received" | "not-received";

export type CollectedRsvpFilterOptions = {
  approvalFilter?: ApprovalFilter;
  listFilter?: string;
  ticketStatusFilter?: TicketStatusFilter | null;
};

export type MatchingRsvpFilterOptions = {
  eventId: Id<"events">;
  guestSearch?: string;
  approvalFilter?: ApprovalFilter;
  listFilter?: string;
  ticketStatusFilter?: TicketStatusFilter | null;
};

type FilterableRsvpRecord = Pick<
  Doc<"rsvps">,
  "listKey" | "ticketStatus" | "status" | "approvalStatus"
>;

export function buildRsvpFuzzySearchTerms(searchText: string | undefined): string[] {
  const rawSearchText = (searchText ?? "").trim();
  const normalizedSearchText = normalizePrimaryFieldLookupText(rawSearchText);
  const normalizedWithoutLeadingAt = normalizePrimaryFieldLookupText(
    rawSearchText.replace(/^@+/, ""),
  );
  const searchTerms = [normalizedSearchText, normalizedWithoutLeadingAt].filter(
    (searchTerm): searchTerm is string => searchTerm.length > 0,
  );

  return Array.from(new Set(searchTerms));
}

export function fieldValuesMatchRsvpFuzzySearchTerms(
  fieldValues: Array<string | undefined>,
  searchTerms: string[],
): boolean {
  if (searchTerms.length === 0) {
    return true;
  }

  return fieldValues.some((fieldValue) => {
    const normalizedFieldValue = normalizePrimaryFieldLookupText(fieldValue ?? "");
    return (
      normalizedFieldValue.length > 0 &&
      searchTerms.some((searchTerm) => normalizedFieldValue.includes(searchTerm))
    );
  });
}

export function normalizeTicketStatusFilter(
  redemptionFilter: string | undefined,
): TicketStatusFilter | null {
  if (redemptionFilter === "not-issued") return "not-issued";
  if (
    redemptionFilter === "issued" ||
    redemptionFilter === "disabled" ||
    redemptionFilter === "redeemed"
  ) {
    return redemptionFilter;
  }
  return null;
}

export function normalizeQrDeliveryFilter(
  qrDeliveryFilter: string | undefined,
): QrDeliveryFilter | null {
  if (qrDeliveryFilter === "received" || qrDeliveryFilter === "not-received") {
    return qrDeliveryFilter;
  }
  return null;
}

export function matchesQrDeliveryFilter(
  qrDeliveredAt: number | undefined,
  qrDeliveryFilter: QrDeliveryFilter | null,
): boolean {
  if (!qrDeliveryFilter) return true;

  const qrCodeWasReceived = qrDeliveredAt !== undefined;
  return qrDeliveryFilter === "received" ? qrCodeWasReceived : !qrCodeWasReceived;
}

export function matchesTicketStatusFilter(
  ticketStatus: Doc<"rsvps">["ticketStatus"],
  ticketStatusFilter: TicketStatusFilter | null,
): boolean {
  if (!ticketStatusFilter) return true;

  const normalizedTicketStatus = ticketStatus ?? "not-issued";
  if (ticketStatusFilter === "not-issued") {
    return normalizedTicketStatus === "not-issued";
  }

  return normalizedTicketStatus === ticketStatusFilter;
}

export function applyCollectedRsvpFilters<RsvpRecord extends FilterableRsvpRecord>(
  rsvps: RsvpRecord[],
  {
    approvalFilter = "all",
    listFilter = "all",
    ticketStatusFilter = null,
  }: CollectedRsvpFilterOptions,
): RsvpRecord[] {
  return rsvps.filter((rsvp) => {
    if (!matchesApprovalFilter(rsvp, approvalFilter)) {
      return false;
    }

    if (listFilter !== "all" && rsvp.listKey !== listFilter) {
      return false;
    }

    return matchesTicketStatusFilter(rsvp.ticketStatus, ticketStatusFilter);
  });
}

export function filtersRequireDirectRsvpCount({
  guestSearch,
  ticketStatusFilter,
  qrDeliveryFilter,
}: {
  guestSearch?: string;
  ticketStatusFilter?: TicketStatusFilter | null;
  qrDeliveryFilter?: QrDeliveryFilter | null;
}): boolean {
  return (
    Boolean(guestSearch?.trim()) ||
    ticketStatusFilter !== null ||
    (qrDeliveryFilter !== undefined && qrDeliveryFilter !== null)
  );
}

export async function collectRsvpsMatchingFilters(
  ctx: QueryCtx,
  {
    eventId,
    guestSearch = "",
    approvalFilter = "all",
    listFilter = "all",
    ticketStatusFilter = null,
  }: MatchingRsvpFilterOptions,
): Promise<Array<Doc<"rsvps">>> {
  const trimmedGuestSearch = guestSearch.trim();

  if (trimmedGuestSearch) {
    const searchResults = await ctx.db
      .query("rsvps")
      .withSearchIndex("search_text", (searchQuery) =>
        searchQuery.search("userName", trimmedGuestSearch).eq("eventId", eventId),
      )
      .collect();

    return applyCollectedRsvpFilters(searchResults, {
      approvalFilter,
      listFilter,
      ticketStatusFilter,
    });
  }

  let eventQuery = ctx.db
    .query("rsvps")
    .withIndex("by_event", (indexQuery) => indexQuery.eq("eventId", eventId));

  if (approvalFilter !== "all") {
    const rawStatuses = getRawStatusesForApprovalFilter(approvalFilter);
    eventQuery = eventQuery.filter((query) => {
      if (rawStatuses.length === 1) {
        return query.eq(query.field("status"), rawStatuses[0]);
      }

      return query.or(
        query.eq(query.field("status"), rawStatuses[0]),
        query.eq(query.field("status"), rawStatuses[1]),
      );
    });
  }

  if (ticketStatusFilter) {
    eventQuery = eventQuery.filter((query) => {
      if (ticketStatusFilter === "not-issued") {
        return query.or(
          query.eq(query.field("ticketStatus"), "not-issued"),
          query.eq(query.field("ticketStatus"), undefined),
        );
      }

      return query.eq(query.field("ticketStatus"), ticketStatusFilter);
    });
  }

  if (listFilter !== "all") {
    eventQuery = eventQuery.filter((query) => query.eq(query.field("listKey"), listFilter));
  }

  return applyCollectedRsvpFilters(await eventQuery.collect(), {
    approvalFilter,
    listFilter,
    ticketStatusFilter,
  });
}

export { resolveApprovalStatus };
