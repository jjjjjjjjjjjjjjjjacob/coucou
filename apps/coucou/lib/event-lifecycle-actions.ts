import type { Id } from "@convex/_generated/dataModel";

interface EventLifecycleWorkspaceScope {
  queryArgs: {
    siteKey: string;
    workspaceSlug: string;
  };
}

type EventLifecycleMutation = (args: {
  eventId: Id<"events">;
  siteKey: string;
  workspaceSlug: string;
}) => Promise<unknown>;

export type EventLifecycleActionResult = "published" | "unpublished" | "skipped";

export function getEventLifecycleActionLabel(isDraft: boolean): "Publish" | "Unpublish" {
  return isDraft ? "Publish" : "Unpublish";
}

export async function runEventLifecycleAction({
  eventId,
  isDraft,
  workspaceScope,
  publishEvent,
  unpublishEvent,
}: {
  eventId: Id<"events">;
  isDraft: boolean;
  workspaceScope: EventLifecycleWorkspaceScope | null;
  publishEvent: EventLifecycleMutation;
  unpublishEvent: EventLifecycleMutation;
}): Promise<EventLifecycleActionResult> {
  if (!workspaceScope) return "skipped";

  if (isDraft) {
    await publishEvent({
      eventId,
      ...workspaceScope.queryArgs,
    });
    return "published";
  }

  await unpublishEvent({
    eventId,
    ...workspaceScope.queryArgs,
  });
  return "unpublished";
}
