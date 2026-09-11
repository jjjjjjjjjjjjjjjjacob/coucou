"use node";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import {
  createEventArgs,
  type EventEditorSaveResult,
  eventUpdateActionArgs,
} from "./lib/eventEditorArgs";

// A single mutation owns every write so errors roll back the entire save.
export const create = action({
  args: createEventArgs,
  handler: async (ctx, args): Promise<{ eventId: Id<"events"> }> =>
    ctx.runMutation(api.eventWrites.create, args),
});
export const update = action({
  args: eventUpdateActionArgs,
  handler: async (ctx, args): Promise<EventEditorSaveResult> =>
    ctx.runMutation(api.eventWrites.update, args),
});
export const updateAndPublish = action({
  args: eventUpdateActionArgs,
  handler: async (ctx, args): Promise<EventEditorSaveResult> =>
    ctx.runMutation(api.eventWrites.updateAndPublish, args),
});
