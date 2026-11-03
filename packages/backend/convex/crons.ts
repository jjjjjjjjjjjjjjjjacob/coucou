import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "rerun stalled RSVP anonymization batches",
  { minutes: 10 },
  internal.rsvpAnonymizationBatches.rerunStalled,
);

export default crons;
