import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./functions";
import { eraseContactsRebuiltBeforeBlanking } from "./lib/deleteUserData";
import { blankNextHeldRsvps, cleanUpAnonymizedRsvps } from "./lib/rsvpAnonymization";

// A run is scheduled with no delay, so a batch still here this long after its
// run was scheduled failed, and the sweep in crons.ts runs it again.
const STALLED_BATCH_AGE_MS = 10 * 60 * 1000;
const STALLED_BATCHES_PER_SWEEP = 100;
// The sweep raises an attention flag when a batch reaches this many attempts.
const ATTEMPTS_BEFORE_ATTENTION_FLAG = 3;

// Triggered like the account deletion that scheduled it, so each RSVP it blanks
// gets its contact sync. Safe to run twice: a finished batch is
// gone, a blanked row is never selected again, a cleaned-up record is gone or
// already rewritten, and a recipient row is rechecked at most.
export const run = internalMutation({
  args: { batchId: v.id("rsvpAnonymizationBatches") },
  handler: async (ctx, { batchId }) => {
    const batch = await ctx.db.get(batchId);
    if (!batch) return;
    const { _id, _creationTime, attempts, scheduledAt, createdAt, ...work } = batch;
    const blankedWork = work.blankHeldRsvps ? await blankNextHeldRsvps(ctx, work) : work;
    if (work.blankHeldRsvps && !blankedWork.blankHeldRsvps) {
      await eraseContactsRebuiltBeforeBlanking(ctx, blankedWork.person);
    }
    const remainingWork = await cleanUpAnonymizedRsvps(ctx, blankedWork);
    if (!remainingWork) {
      await ctx.db.delete(batchId);
      return;
    }
    await ctx.db.patch(batchId, { ...remainingWork, attempts: 1, scheduledAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.rsvpAnonymizationBatches.run, { batchId });
  },
});

// A failed run leaves its batch, with the person's phone hashes, in place. The
// sweep schedules it again until it finishes, and after a few failed runs
// raises an attention flag, so a batch that fails every time is not retried
// unseen. The flag names the batch, never the person.
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
      const attempts = batch.attempts + 1;
      if (attempts === ATTEMPTS_BEFORE_ATTENTION_FLAG) {
        await ctx.db.insert("attentionFlags", {
          kind: "flag",
          label: `RSVP anonymization batch ${batch._id} keeps failing`,
          detail: `Run ${attempts} of this account-deletion or erasure batch is starting after ${batch.attempts} failed runs. It is retried every 10 minutes and keeps the person's phone hashes until it finishes. Read its errors in the Convex logs.`,
          observedAt: now,
          sourceModule: "rsvpAnonymizationBatches",
          status: "open",
        });
      }
      await ctx.db.patch(batch._id, { attempts, scheduledAt: now });
      await ctx.scheduler.runAfter(0, internal.rsvpAnonymizationBatches.run, {
        batchId: batch._id,
      });
    }
  },
});
