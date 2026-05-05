import { TableAggregate } from "@convex-dev/aggregate";
import { components } from "../_generated/api";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  ALL_RAW_RSVP_STATUSES,
  getRawStatusesForApprovalFilter,
  type ApprovalFilter,
  type RawRsvpStatus,
} from "./rsvpStatus";

function getAggregateSortKey(rsvp: Doc<"rsvps">): [string, string, string] {
  return [rsvp.eventId, rsvp.status || "pending", rsvp.listKey || "unknown"];
}

// Aggregate for efficient RSVP counting with hierarchical key structure
// Key: [eventId, status, listKey] allows filtering by any combination
export const rsvpAggregate = new TableAggregate<{
  Key: [string, string, string]; // [eventId, status, listKey]
  DataModel: DataModel;
  TableName: "rsvps";
}>(components.rsvpAggregate, {
  sortKey: getAggregateSortKey,
});

// Helper functions to keep aggregate in sync with RSVP table changes

export async function insertRsvpIntoAggregate(
  ctx: MutationCtx,
  rsvp: Doc<"rsvps">,
) {
  console.log(`[AGGREGATE] Inserting RSVP into aggregate:`, {
    eventId: rsvp.eventId,
    status: rsvp.status,
    listKey: rsvp.listKey,
    sortKey: getAggregateSortKey(rsvp),
  });
  await rsvpAggregate.insertIfDoesNotExist(ctx, rsvp);
}

export async function updateRsvpInAggregate(
  ctx: MutationCtx,
  oldRsvp: Doc<"rsvps">,
  newRsvp: Doc<"rsvps">,
) {
  console.log(`[AGGREGATE] Updating RSVP in aggregate:`, {
    old: {
      eventId: oldRsvp.eventId,
      status: oldRsvp.status,
      listKey: oldRsvp.listKey,
    },
    new: {
      eventId: newRsvp.eventId,
      status: newRsvp.status,
      listKey: newRsvp.listKey,
    },
    oldSortKey: getAggregateSortKey(oldRsvp),
    newSortKey: getAggregateSortKey(newRsvp),
  });
  await rsvpAggregate.replace(ctx, oldRsvp, newRsvp);
}

export async function deleteRsvpFromAggregate(
  ctx: MutationCtx,
  rsvp: Doc<"rsvps">,
) {
  console.log(`[AGGREGATE] Deleting RSVP from aggregate:`, {
    eventId: rsvp.eventId,
    status: rsvp.status,
    listKey: rsvp.listKey,
    sortKey: getAggregateSortKey(rsvp),
  });
  await rsvpAggregate.delete(ctx, rsvp);
}

// Test function to check if aggregate is working
export async function testAggregateHealth(
  ctx: QueryCtx,
  eventId: Id<"events">,
) {
  try {
    // Try to get total count for the event
    const totalCount = await rsvpAggregate.count(ctx, {
      bounds: {
        lower: { key: [eventId, "", ""], inclusive: true },
        upper: { key: [eventId, "\uFFFF", "\uFFFF"], inclusive: true },
      },
    });

    // Also try to get total count across all events
    const globalCount = await rsvpAggregate.count(ctx, {
      bounds: {
        lower: { key: ["", "", ""], inclusive: true },
        upper: { key: ["\uFFFF", "\uFFFF", "\uFFFF"], inclusive: true },
      },
    });

    console.log(
      `[AGGREGATE HEALTH] Event ${eventId} count: ${totalCount}, Global count: ${globalCount}`,
    );

    return { eventCount: totalCount, globalCount };
  } catch (error) {
    console.error(`[AGGREGATE HEALTH] Failed to test aggregate:`, error);
    throw error;
  }
}

// Count function that uses the aggregate for efficient filtering
export async function countRsvpsWithAggregate(
  ctx: QueryCtx,
  eventId: Id<"events">,
  approvalFilter: ApprovalFilter = "all",
  listFilter: string = "all",
) {
  try {
    const rawStatuses = getRawStatusesForApprovalFilter(approvalFilter);
    let result: number;

    if (approvalFilter === "all" && listFilter === "all") {
      // Count all RSVPs for this event
      const bounds = {
        lower: { key: [eventId, "", ""] as [string, string, string], inclusive: true },
        upper: { key: [eventId, "\uFFFF", "\uFFFF"] as [string, string, string], inclusive: true },
      };
      result = await rsvpAggregate.count(ctx, { namespace: undefined, bounds });
    } else {
      const statusesToCount =
        approvalFilter === "all" ? ALL_RAW_RSVP_STATUSES : rawStatuses;

      result = 0;
      for (const rawStatus of statusesToCount) {
        const bounds =
          listFilter === "all"
            ? {
                lower: {
                  key: [eventId, rawStatus, ""] as [string, string, string],
                  inclusive: true,
                },
                upper: {
                  key: [eventId, rawStatus, "\uFFFF"] as [string, string, string],
                  inclusive: true,
                },
              }
            : {
                lower: {
                  key: [eventId, rawStatus, listFilter] as [
                    string,
                    string,
                    string,
                  ],
                  inclusive: true,
                },
                upper: {
                  key: [eventId, rawStatus, listFilter] as [
                    string,
                    string,
                    string,
                  ],
                  inclusive: true,
                },
              };
        result += await rsvpAggregate.count(ctx, { namespace: undefined, bounds });
      }
    }

    // If we expect RSVPs but get 0, fallback to direct DB count
    if (result === 0) {
      console.warn(
        `[AGGREGATE] Count returned 0. Falling back to direct DB count.`,
        { eventId, approvalFilter, listFilter },
      );

      // Fallback to direct database count
      let fallbackQuery = ctx.db
        .query("rsvps")
        .withIndex("by_event", (query) => query.eq("eventId", eventId));

      if (approvalFilter !== "all") {
        fallbackQuery = fallbackQuery.filter((query) => {
          if (rawStatuses.length === 1) {
            return query.eq(query.field("status"), rawStatuses[0]);
          }

          return query.or(
            query.eq(query.field("status"), rawStatuses[0] as RawRsvpStatus),
            query.eq(query.field("status"), rawStatuses[1] as RawRsvpStatus),
          );
        });
      }
      if (listFilter !== "all") {
        fallbackQuery = fallbackQuery.filter((query) =>
          query.eq(query.field("listKey"), listFilter),
        );
      }

      const fallbackCount = (await fallbackQuery.collect()).length;
      console.log(`[AGGREGATE] Fallback DB count result`, {
        eventId,
        approvalFilter,
        listFilter,
        fallbackCount,
      });

      return fallbackCount;
    }

    return result;
  } catch (error) {
    console.error(`[AGGREGATE] Error counting RSVPs:`, {
      eventId,
      approvalFilter,
      listFilter,
      error,
    });
    throw new Error(
      `Aggregate count failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
