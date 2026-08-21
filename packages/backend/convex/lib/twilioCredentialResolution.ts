import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type TwilioCredentialDatabaseReader = Pick<QueryCtx | MutationCtx, "db">;

export type StoredTwilioCredentialMatch = {
  credential: Doc<"twilioCredentials">;
  source: "event" | "workspace";
};

export async function findTwilioCredentialForScope(
  ctx: TwilioCredentialDatabaseReader,
  workspaceId: Id<"workspaces">,
  eventId?: Id<"events">,
): Promise<Doc<"twilioCredentials"> | null> {
  if (eventId) {
    return await ctx.db
      .query("twilioCredentials")
      .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", eventId))
      .unique();
  }

  const workspaceCredentials = await ctx.db
    .query("twilioCredentials")
    .withIndex("by_workspace", (queryBuilder) => queryBuilder.eq("workspaceId", workspaceId))
    .collect();
  return workspaceCredentials.find((credential) => credential.eventId === undefined) ?? null;
}

export async function resolveStoredTwilioCredentialForEvent(
  ctx: TwilioCredentialDatabaseReader,
  eventId: Id<"events">,
): Promise<StoredTwilioCredentialMatch | null> {
  const eventCredential = await ctx.db
    .query("twilioCredentials")
    .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", eventId))
    .unique();
  if (eventCredential) {
    return { credential: eventCredential, source: "event" };
  }

  const event = await ctx.db.get(eventId);
  const workspaceSlug = event?.workspaceSlug ?? event?.siteKey;
  if (!workspaceSlug) {
    return null;
  }
  const workspace = await ctx.db
    .query("workspaces")
    .withIndex("by_slug", (queryBuilder) => queryBuilder.eq("slug", workspaceSlug))
    .unique();
  if (!workspace) {
    return null;
  }
  const workspaceCredential = await findTwilioCredentialForScope(ctx, workspace._id);
  return workspaceCredential ? { credential: workspaceCredential, source: "workspace" } : null;
}
