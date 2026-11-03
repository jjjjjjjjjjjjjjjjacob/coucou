import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "rerun stalled RSVP anonymization batches",
  { minutes: 10 },
  internal.rsvpAnonymizationBatches.rerunStalled,
);

// A queued delivery waits for the next dispatcher run; this one picks up any
// that a failed run left behind.
crons.interval(
  "dispatch queued webhook deliveries",
  { minutes: 10 },
  internal.webhookDeliveries.dispatchQueuedDeliveries,
);

export default crons;
