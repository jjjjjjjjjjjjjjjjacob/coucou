import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { rsvpAggregate } from "./rsvpAggregate";

export async function updateRsvpListKeyRecords(
  context: MutationCtx,
  rsvp: Doc<"rsvps">,
  listKey: string,
): Promise<void> {
  await context.db.patch(rsvp._id, { listKey });
  // Previous partial updates may have left the source entry missing or the
  // destination present. Both writes must roll back with the list change on failure.
  await rsvpAggregate.deleteIfExists(context, rsvp);
  await rsvpAggregate.insertIfDoesNotExist(context, { ...rsvp, listKey });

  const redemption = await context.db
    .query("redemptions")
    .withIndex("by_event_user", (queryBuilder) =>
      queryBuilder.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId),
    )
    .unique();
  if (redemption) {
    await context.db.patch(redemption._id, { listKey });
  }

  const approvals = await context.db
    .query("approvals")
    .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", rsvp._id))
    .collect();
  for (const approval of approvals) {
    await context.db.patch(approval._id, { listKey });
  }
}
