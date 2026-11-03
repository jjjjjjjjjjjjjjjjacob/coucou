import { v } from "convex/values";
import { internalMutation } from "./functions";
import { anonymizeRsvp } from "./lib/rsvpAnonymization";

// Triggered like the account deletion that scheduled it, so each RSVP sends its
// rsvp.updated erasure notice. Safe to run twice: a finished batch is gone, and
// an RSVP anonymized already is left as it is. An id an identity merge retired
// in the meantime is skipped: the row it merged into was not the deleted
// account's to anonymize.
export const run = internalMutation({
  args: { batchId: v.id("rsvpAnonymizationBatches") },
  handler: async (ctx, { batchId }) => {
    const batch = await ctx.db.get(batchId);
    if (!batch) return;
    for (const rsvpId of batch.rsvpIds) {
      const rsvp = await ctx.db.get(rsvpId);
      if (rsvp) await anonymizeRsvp(ctx, rsvp, { personPhoneHashes: batch.personPhoneHashes });
    }
    await ctx.db.delete(batchId);
  },
});
