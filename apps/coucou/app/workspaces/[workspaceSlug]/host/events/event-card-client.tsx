"use client";
import { api } from "@convex/_generated/api";
import { resolveEventEndTimestamp } from "@convex/lib/eventTiming";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  CheckCircle,
  Edit,
  ExternalLink,
  EyeOff,
  MoreHorizontal,
  QrCode,
  Share,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { type KeyboardEvent, type MouseEvent, useState } from "react";
import { toast } from "sonner";
import { EventContextMenu } from "@/components/event-context-menu";
import { EventDeleteDialog } from "@/components/event-delete-dialog";
import { ShareEventPopover } from "@/components/share-event-popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

export default function EventCardClient({
  event,
  fileUrl,
}: {
  event: Event;
  fileUrl?: string | null;
}) {
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
  const sendDeferredQrBatch = useAction(api.qrDelivery.sendDeferredQrBatch);
  const pendingDeferredCount = useQuery(
    api.qrDelivery.countPendingDeferredRecipients,
    workspaceScope ? { eventId: event._id, ...workspaceScope.queryArgs } : "skip",
  );
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [sendingQrBatch, setSendingQrBatch] = useState(false);
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
  const badgeLabel = isDraft ? "Draft" : isPast ? "Past" : "Published";
  const badgeVariant: "outline" | "success" = isDraft || isPast ? "outline" : "success";
  const publicEventUrl = buildPublicEventUrl(workspace ?? null, event, {
    currentOrigin: typeof window !== "undefined" ? window.location.origin : null,
    vercelEnvironment: process.env.NEXT_PUBLIC_VERCEL_ENV,
  });
  const canShareEvent = Boolean(publicEventUrl);
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
      if (lifecycleActionResult === "published") {
        posthog.capture("event_published", {
          event_id: event._id,
          event_name: inlineTitle,
          workspace_slug: workspaceScope?.workspaceSlug,
        });
        toast.success("Event published");
      }
      if (lifecycleActionResult === "unpublished") {
        posthog.capture("event_unpublished", {
          event_id: event._id,
          event_name: inlineTitle,
          workspace_slug: workspaceScope?.workspaceSlug,
        });
        toast.success("Event unpublished");
      }
      if (lifecycleActionResult === "skipped") return;
      router.refresh();
    } catch (error: unknown) {
      posthog.captureException(error);
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

  const openEventDetails = () => {
    posthog.capture("event_details_viewed", {
      event_id: event._id,
      event_name: inlineTitle,
      workspace_slug: workspaceScope?.workspaceSlug,
    });
    router.push(eventDetailPath);
  };

  const handleCardClick = (clickEvent: MouseEvent<HTMLDivElement>) => {
    if (
      clickEvent.target instanceof Element &&
      clickEvent.target.closest("button, a, input, select, textarea, [role='menuitem']")
    ) {
      return;
    }
    openEventDetails();
  };

  const handleCardKeyDown = (keyboardEvent: KeyboardEvent<HTMLDivElement>) => {
    if (keyboardEvent.target !== keyboardEvent.currentTarget) return;
    if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
      keyboardEvent.preventDefault();
      openEventDetails();
    }
  };

  const handleViewClick = () => {
    if (isDraft) {
      router.push(editDraftPath);
      return;
    }
    posthog.capture("event_viewed", {
      event_id: event._id,
      event_name: inlineTitle,
      workspace_slug: workspaceScope?.workspaceSlug,
    });
    if (publicEventUrl) {
      window.open(publicEventUrl, "_blank", "noopener,noreferrer");
      return;
    }
    router.push(`/events/${event._id}`);
  };

  const sendPendingQrCodes = async () => {
    if (!workspaceScope || !pendingDeferredCount) return;
    setSendingQrBatch(true);
    try {
      const result = await sendDeferredQrBatch({
        eventId: event._id,
        ...workspaceScope.queryArgs,
      });
      posthog.capture("qr_codes_batch_sent", {
        event_id: event._id,
        event_name: inlineTitle,
        sent_count: result.sent,
        failed_count: result.failed,
        skipped_count: result.skipped,
        workspace_slug: workspaceScope?.workspaceSlug,
      });
      const successMessage =
        result.failed > 0
          ? `Sent ${result.sent} QR codes (${result.failed} failed, ${result.skipped} skipped)`
          : `Sent ${result.sent} QR codes`;
      if (result.failed > 0) {
        toast.error(
          `${successMessage}. ${result.failures[0]?.message ?? "Open the text thread for delivery details."}`,
        );
      } else {
        toast.success(successMessage);
      }
      router.refresh();
    } catch (error: unknown) {
      posthog.captureException(error);
      toast.error((error as Error).message || "Failed to send QR codes");
    } finally {
      setSendingQrBatch(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (!workspaceScope) return;
    await removeEvent({
      eventId: event._id,
      ...workspaceScope.queryArgs,
    });
    posthog.capture("event_deleted", {
      event_id: event._id,
      event_name: inlineTitle,
      workspace_slug: workspaceScope.workspaceSlug,
    });
    setShowDeleteDialog(false);
    router.refresh();
  };

  const showSendQrCodesButton = !isDraft && (pendingDeferredCount ?? 0) > 0;

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <Card
            role="link"
            tabIndex={0}
            aria-label={`Open ${inlineTitle} details`}
            className="flex h-full cursor-pointer flex-col overflow-hidden rounded-md transition-colors hover:border-[var(--text-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-primary)]/30"
            onClick={handleCardClick}
            onKeyDown={handleCardKeyDown}
          >
            <CardHeader className="pb-0">
              {fileUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={fileUrl}
                  alt="Flyer"
                  className="mb-3 h-28 w-full rounded-sm object-cover"
                />
              ) : (
                <div className="mb-3 h-28 rounded-sm bg-foreground/5" />
              )}
            </CardHeader>
            <div className="flex flex-col flex-grow justify-between">
              <CardContent className="pb-0">
                <div className="mb-1 flex min-w-0 items-center gap-2">
                  <div className="min-w-0 flex-1 truncate font-medium" title={inlineTitle}>
                    {inlineTitle}
                  </div>
                  {event.isFeatured && (
                    <Badge variant="secondary" className="text-xs">
                      Featured
                    </Badge>
                  )}
                  <Badge variant={badgeVariant} className="text-xs capitalize">
                    {badgeLabel}
                  </Badge>
                </div>
                <div className="mb-3 text-xs text-foreground/70">
                  {formatEventDateTime(event.eventDate, event.eventTimezone)} • {event.location}
                </div>
              </CardContent>
              <CardFooter className="pt-0">
                <div className="mt-3 flex w-full items-center justify-between gap-2">
                  <div className="flex min-w-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={openEventDetails}
                      className="min-h-10"
                    >
                      Details
                    </Button>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    {canShareEvent ? (
                      <ShareEventPopover
                        eventId={event._id}
                        eventUrl={publicEventUrl}
                        siteKey={workspaceScope?.siteKey}
                        workspaceSlug={workspaceScope?.workspaceSlug}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          className="size-10 rounded-full"
                          aria-label="Share event"
                        >
                          <Share className="h-4 w-4" />
                        </Button>
                      </ShareEventPopover>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="size-10 rounded-full"
                        aria-label="Share event"
                        disabled
                      >
                        <Share className="h-4 w-4" />
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-10"
                          aria-label="Open event actions"
                        >
                          <MoreHorizontal className="h-6 w-6" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem
                          onSelect={(menuEvent) => {
                            menuEvent.preventDefault();
                            handleViewClick();
                          }}
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          {isDraft ? "Continue editing" : "View public page"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {showSendQrCodesButton && (
                          <>
                            <DropdownMenuItem
                              disabled={sendingQrBatch}
                              onSelect={(menuEvent) => {
                                menuEvent.preventDefault();
                                void sendPendingQrCodes();
                              }}
                            >
                              <QrCode className="mr-2 h-4 w-4" />
                              {sendingQrBatch
                                ? "Sending QR codes..."
                                : `Send QR codes (${pendingDeferredCount})`}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        )}
                        <DropdownMenuItem
                          onSelect={(event) => {
                            event.preventDefault();
                            void togglePublish();
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
                          disabled={event.isFeatured}
                          onSelect={(menuEvent) => {
                            menuEvent.preventDefault();
                            void handleSetFeatured();
                          }}
                        >
                          <CheckCircle className="mr-2 h-4 w-4" />
                          Set as Featured
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={openEventDetails}>
                          <Edit className="mr-2 h-4 w-4" />
                          Configure
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={(menuEvent) => {
                            menuEvent.preventDefault();
                            setShowDeleteDialog(true);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardFooter>
            </div>
          </Card>
        </ContextMenuTrigger>
        <EventContextMenu
          event={event}
          isDraft={isDraft}
          publicEventUrl={publicEventUrl}
          lifecycleActionLabel={lifecycleActionLabel}
          onOpenDetails={openEventDetails}
          onView={handleViewClick}
          onDuplicateToDraft={duplicateEventToDraft}
          onTogglePublish={togglePublish}
          onSetFeatured={handleSetFeatured}
          onDelete={() => setShowDeleteDialog(true)}
          onSendQrCodes={showSendQrCodesButton ? sendPendingQrCodes : undefined}
          sendingQrCodes={sendingQrBatch}
          pendingQrCount={showSendQrCodesButton ? (pendingDeferredCount ?? 0) : 0}
          isDuplicating={isDuplicating}
        />
      </ContextMenu>

      <EventDeleteDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onDelete={handleDeleteEvent}
      />
    </>
  );
}
