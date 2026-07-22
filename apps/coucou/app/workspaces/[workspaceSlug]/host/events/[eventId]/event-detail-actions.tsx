"use client";

import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { CheckCircle, ChevronDown, Copy, EyeOff, MoreHorizontal, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { EventDeleteDialog } from "@/components/event-delete-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDuplicateEventToDraft } from "@/hooks/use-duplicate-event-to-draft";
import {
  getEventLifecycleActionLabel,
  runEventLifecycleAction,
} from "@/lib/event-lifecycle-actions";
import type { Event } from "@/lib/types";
import { useWorkspaceOperationPath, useWorkspaceScope } from "@/lib/use-workspace-scope";

interface EventDetailActionsProps {
  event: Event;
}

export function EventDetailActions({ event }: EventDetailActionsProps) {
  const router = useRouter();
  const workspaceScope = useWorkspaceScope();
  const eventsPath = useWorkspaceOperationPath("host", "events");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const publishEvent = useMutation(api.events.publishEvent);
  const unpublishEvent = useMutation(api.events.unpublishEvent);
  const setFeaturedEvent = useMutation(api.events.setFeaturedEvent);
  const removeEvent = useMutation(api.events.remove);
  const { duplicateEventToDraft, isDuplicating } = useDuplicateEventToDraft({
    eventId: event._id,
    workspaceScope,
  });

  const isDraft = (event.lifecycle ?? "published") === "draft";
  const lifecycleActionLabel = getEventLifecycleActionLabel(isDraft);

  const handleTogglePublish = async () => {
    if (!workspaceScope) return;
    try {
      const result = await runEventLifecycleAction({
        eventId: event._id,
        isDraft,
        workspaceScope,
        publishEvent,
        unpublishEvent,
      });
      if (result === "published") toast.success("Event published");
      if (result === "unpublished") toast.success("Event unpublished");
      if (result === "skipped") return;
      router.refresh();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to update lifecycle");
    }
  };

  const handleSetFeatured = async () => {
    if (!workspaceScope) return;
    try {
      await setFeaturedEvent({ eventId: event._id, ...workspaceScope.queryArgs });
      toast.success("Event set as featured");
      router.refresh();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to set featured event");
    }
  };

  const handleDelete = async () => {
    if (!workspaceScope) return;
    try {
      await removeEvent({ eventId: event._id, ...workspaceScope.queryArgs });
      toast.success("Event deleted");
      setShowDeleteDialog(false);
      router.push(eventsPath);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to delete event");
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-[var(--border-subtle)] bg-transparent"
            disabled={!workspaceScope}
          >
            <MoreHorizontal className="h-4 w-4" />
            Actions
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onSelect={() => {
              void duplicateEventToDraft();
            }}
            disabled={isDuplicating}
          >
            <Copy className="mr-2 h-4 w-4" />
            {isDuplicating ? "Duplicating..." : "Duplicate to draft"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              void handleTogglePublish();
            }}
          >
            {isDraft ? (
              <CheckCircle className="mr-2 h-4 w-4" />
            ) : (
              <EyeOff className="mr-2 h-4 w-4" />
            )}
            {lifecycleActionLabel}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              void handleSetFeatured();
            }}
            disabled={event.isFeatured}
          >
            <Star className="mr-2 h-4 w-4" />
            {event.isFeatured ? "Featured" : "Set as featured"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setShowDeleteDialog(true);
            }}
            variant="destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" /> Delete event
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EventDeleteDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onDelete={handleDelete}
      />
    </>
  );
}
