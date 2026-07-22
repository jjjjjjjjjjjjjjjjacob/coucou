"use client";

import { api } from "@convex/_generated/api";
import { resolveEventEndTimestamp } from "@convex/lib/eventTiming";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, type MouseEvent, useState } from "react";
import { toast } from "sonner";
import { EventContextMenu } from "@/components/event-context-menu";
import { EventDeleteDialog } from "@/components/event-delete-dialog";
import { EventListRowActions } from "@/components/event-list-row-actions";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { useDuplicateEventToDraft } from "@/hooks/use-duplicate-event-to-draft";
import { formatEventTitleInline } from "@/lib/event-display";
import {
  getEventLifecycleActionLabel,
  runEventLifecycleAction,
} from "@/lib/event-lifecycle-actions";
import { buildPublicEventUrl } from "@/lib/event-public-url";
import type { Event } from "@/lib/types";
import { useWorkspaceOperationPath, useWorkspaceScope } from "@/lib/use-workspace-scope";
import { formatEventDateTime } from "@/lib/utils";

interface EventListRowProps {
  event: Event;
}

export function EventListRow({ event }: EventListRowProps) {
  const router = useRouter();
  const workspaceScope = useWorkspaceScope();
  const eventDetailPath = useWorkspaceOperationPath("host", `events/${event._id}`);
  const editDraftPath = useWorkspaceOperationPath("host", `new?draftId=${event._id}`);
  const workspace = useQuery(
    api.workspaces.getWorkspaceBySlug,
    workspaceScope ? { slug: workspaceScope.workspaceSlug } : "skip",
  );
  const removeEvent = useMutation(api.events.remove);
  const setFeaturedEvent = useMutation(api.events.setFeaturedEvent);
  const publishEvent = useMutation(api.events.publishEvent);
  const unpublishEvent = useMutation(api.events.unpublishEvent);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { duplicateEventToDraft, isDuplicating } = useDuplicateEventToDraft({
    eventId: event._id,
    workspaceScope,
  });

  const inlineTitle = formatEventTitleInline(event);
  const lifecycle = event.lifecycle ?? "published";
  const isDraft = lifecycle === "draft";
  const now = Date.now();
  const endTimestamp =
    resolveEventEndTimestamp({
      eventDate: event.eventDate,
      eventEndDate: event.eventEndDate,
    }) ?? 0;
  const isPast = !isDraft && endTimestamp > 0 && endTimestamp < now;
  const statusVariant = isDraft ? "draft" : isPast ? "past" : "published";
  const publicEventUrl = buildPublicEventUrl(workspace ?? null, event, {
    currentOrigin: typeof window !== "undefined" ? window.location.origin : null,
    vercelEnvironment: process.env.NEXT_PUBLIC_VERCEL_ENV,
  });
  const lifecycleActionLabel = getEventLifecycleActionLabel(isDraft);

  const togglePublish = async () => {
    try {
      const lifecycleActionResult = await runEventLifecycleAction({
        eventId: event._id,
        isDraft,
        workspaceScope,
        publishEvent,
        unpublishEvent,
      });
      if (lifecycleActionResult === "published") toast.success("Event published");
      if (lifecycleActionResult === "unpublished") toast.success("Event unpublished");
      if (lifecycleActionResult === "skipped") return;
      router.refresh();
    } catch (error: unknown) {
      toast.error((error as Error).message || "Failed to update lifecycle");
    }
  };

  const handleSetFeatured = async () => {
    if (!workspaceScope) return;
    try {
      await setFeaturedEvent({
        eventId: event._id,
        ...workspaceScope.queryArgs,
      });
      toast.success(`"${inlineTitle}" is now the featured event`);
      router.refresh();
    } catch (error: unknown) {
      toast.error("Failed to set featured event: " + (error as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!workspaceScope) return;
    await removeEvent({
      eventId: event._id,
      ...workspaceScope.queryArgs,
    });
    toast.success("Event deleted");
    setShowDeleteDialog(false);
    router.refresh();
  };

  const handleView = () => {
    if (isDraft) {
      router.push(editDraftPath);
      return;
    }
    if (publicEventUrl) {
      window.open(publicEventUrl, "_blank", "noopener,noreferrer");
      return;
    }
    router.push(`/events/${event._id}`);
  };

  const openEventDetails = () => {
    router.push(eventDetailPath);
  };

  const handleRowClick = (clickEvent: MouseEvent<HTMLDivElement>) => {
    if (
      clickEvent.target instanceof Element &&
      clickEvent.target.closest("button, a, input, select, textarea, [role='menuitem']")
    ) {
      return;
    }
    openEventDetails();
  };

  const handleRowKeyDown = (keyboardEvent: KeyboardEvent<HTMLDivElement>) => {
    if (keyboardEvent.target !== keyboardEvent.currentTarget) return;
    if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
      keyboardEvent.preventDefault();
      openEventDetails();
    }
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            role="link"
            tabIndex={0}
            aria-label={`Open ${inlineTitle} details`}
            onClick={handleRowClick}
            onKeyDown={handleRowKeyDown}
            className="group flex cursor-pointer items-center gap-4 rounded-lg border bg-card p-4 text-card-foreground shadow-sm transition-colors hover:bg-[var(--tt-highlight)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-primary)]/30"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={eventDetailPath}
                  className="max-w-[24rem] truncate text-sm font-medium text-[var(--text-primary)] hover:underline"
                >
                  {inlineTitle}
                </Link>
                {event.isFeatured ? <StatusBadge variant="issued" label="Featured" /> : null}
                <StatusBadge variant={statusVariant} />
              </div>
              <div className="text-xs tabular-nums text-[var(--text-secondary)]">
                {formatEventDateTime(event.eventDate, event.eventTimezone)} • {event.location}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                <EventListRowActions
                  event={event}
                  isDraft={isDraft}
                  publicEventUrl={publicEventUrl}
                  lifecycleActionLabel={lifecycleActionLabel}
                  onView={handleView}
                  onTogglePublish={togglePublish}
                  onSetFeatured={handleSetFeatured}
                  onDelete={() => setShowDeleteDialog(true)}
                />
              </div>
            </div>
          </div>
        </ContextMenuTrigger>
        <EventContextMenu
          event={event}
          isDraft={isDraft}
          publicEventUrl={publicEventUrl}
          lifecycleActionLabel={lifecycleActionLabel}
          onOpenDetails={openEventDetails}
          onView={handleView}
          onDuplicateToDraft={duplicateEventToDraft}
          onTogglePublish={togglePublish}
          onSetFeatured={handleSetFeatured}
          onDelete={() => setShowDeleteDialog(true)}
          isDuplicating={isDuplicating}
        />
      </ContextMenu>

      <EventDeleteDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onDelete={handleDelete}
      />
    </>
  );
}
