import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type PartnerEventAccessMode = "all" | "selected";

type EventScopedPartnerResource = Pick<
  Doc<"apiClients"> | Doc<"webhookEndpoints">,
  "eventAccessMode" | "allowedEventIds"
>;

export function resolvePartnerEventAccessMode(
  resource: EventScopedPartnerResource,
): PartnerEventAccessMode {
  return resource.eventAccessMode ?? "all";
}

export function partnerResourceCanAccessEvent(
  resource: EventScopedPartnerResource,
  eventId: Id<"events">,
): boolean {
  if (resolvePartnerEventAccessMode(resource) === "all") {
    return true;
  }
  return (resource.allowedEventIds ?? []).includes(eventId);
}

export function buildPartnerEventAccessSummary(resource: EventScopedPartnerResource) {
  const eventAccessMode = resolvePartnerEventAccessMode(resource);
  return {
    eventAccessMode,
    allowedEventIds: eventAccessMode === "selected" ? (resource.allowedEventIds ?? []) : [],
    isLegacyAllEventsAccess: resource.eventAccessMode === undefined,
  };
}

export async function validatePartnerEventAccess(
  ctx: QueryCtx | MutationCtx,
  {
    workspaceId,
    eventAccessMode,
    allowedEventIds,
  }: {
    workspaceId: Id<"workspaces">;
    eventAccessMode: PartnerEventAccessMode;
    allowedEventIds?: Id<"events">[];
  },
): Promise<Id<"events">[]> {
  if (eventAccessMode === "all") {
    return [];
  }

  const uniqueAllowedEventIds = [...new Set(allowedEventIds ?? [])];
  if (uniqueAllowedEventIds.length === 0) {
    throw new Error("Select at least one event or explicitly grant all events");
  }

  const workspace = await ctx.db.get(workspaceId);
  if (!workspace) {
    throw new Error("Workspace not found");
  }

  for (const allowedEventId of uniqueAllowedEventIds) {
    const event = await ctx.db.get(allowedEventId);
    if (!event || event.workspaceSlug !== workspace.slug) {
      throw new Error("Every selected event must belong to this workspace");
    }
  }

  return uniqueAllowedEventIds;
}
