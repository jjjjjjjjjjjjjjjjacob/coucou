"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { WorkspaceScope } from "@/lib/use-workspace-scope";
import { buildWorkspaceOperationPath } from "@/lib/workspace-config";

interface UseDuplicateEventToDraftOptions {
  eventId: Id<"events">;
  workspaceScope: WorkspaceScope | null;
}

export function useDuplicateEventToDraft({
  eventId,
  workspaceScope,
}: UseDuplicateEventToDraftOptions) {
  const router = useRouter();
  const duplicateEventMutation = useMutation(api.events.duplicateToDraft);
  const [isDuplicating, setIsDuplicating] = useState(false);

  const duplicateEventToDraft = async () => {
    if (!workspaceScope) {
      toast.error("Workspace scope is required to duplicate this event");
      return;
    }

    setIsDuplicating(true);
    try {
      const duplicateResult = await duplicateEventMutation({
        eventId,
        ...workspaceScope.queryArgs,
      });
      const duplicateDraftPath = buildWorkspaceOperationPath(
        workspaceScope.workspaceSlug,
        "host",
        `new?draftId=${duplicateResult.eventId}`,
      );
      toast.success("Event duplicated to a draft");
      router.push(duplicateDraftPath);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to duplicate event");
    } finally {
      setIsDuplicating(false);
    }
  };

  return { duplicateEventToDraft, isDuplicating };
}
