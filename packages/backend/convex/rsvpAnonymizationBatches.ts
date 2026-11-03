import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./functions";
import { blankNextHeldRsvps, cleanUpAnonymizedRsvps } from "./lib/rsvpAnonymization";

// A run is scheduled with no delay, so a batch still here this long after its
// run was scheduled failed, and the sweep in crons.ts runs it again.
const STALLED_BATCH_AGE_MS = 10 * 60 * 1000;
const STALLED_BATCHES_PER_SWEEP = 100;

// Triggered like the account deletion that scheduled it, so each RSVP it blanks
// sends its rsvp.updated erasure notice. Safe to run twice: a finished batch is
// gone, a blanked row is never selected again, a cleaned-up record is gone or
// already rewritten, and a recipient row is rechecked at most.
export const run = internalMutation({
  args: { batchId: v.id("rsvpAnonymizationBatches") },
  handler: async (ctx, { batchId }) => {
    const batch = await ctx.db.get(batchId);
    if (!batch) return;
    const { _id, _creationTime, attempts, scheduledAt, createdAt, ...work } = batch;
    const remainingWork = await cleanUpAnonymizedRsvps(
      ctx,
      work.blankHeldRsvps ? await blankNextHeldRsvps(ctx, work) : work,
    );
    if (!remainingWork) {
      await ctx.db.delete(batchId);
      return;
    }
    await ctx.db.patch(batchId, { ...remainingWork, attempts: 1, scheduledAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.rsvpAnonymizationBatches.run, { batchId });
  },
});

// A failed run leaves its batch, with the person's phone hashes, in place. The
// sweep schedules it again until it finishes; attempts shows how often it failed.
export const rerunStalled = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const stalledBatches = await ctx.db
      .query("rsvpAnonymizationBatches")
      .withIndex("by_scheduled_at", (queryBuilder) =>
        queryBuilder.lt("scheduledAt", now - STALLED_BATCH_AGE_MS),
      )
      .take(STALLED_BATCHES_PER_SWEEP);
    for (const batch of stalledBatches) {
      console.error(
        `RSVP anonymization batch ${batch._id} did not finish after ${batch.attempts} attempt(s); running it again`,
      );
      await ctx.db.patch(batch._id, { attempts: batch.attempts + 1, scheduledAt: now });
      await ctx.scheduler.runAfter(0, internal.rsvpAnonymizationBatches.run, {
        batchId: batch._id,
      });
    }
  },
});
