"use client";
import { api } from "@convex/_generated/api";
import { resolveEventEndTimestamp } from "@convex/lib/eventTiming";
import { useAction, useMutation, useQuery } from "convex/react";
import { CheckCircle, Edit, EyeOff, MoreHorizontal, Share, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ShareEventPopover } from "@/components/share-event-popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatEventTitleInline } from "@/lib/event-display";
import {
  getEventLifecycleActionLabel,
  runEventLifecycleAction,
} from "@/lib/event-lifecycle-actions";
import { buildPublicEventUrl } from "@/lib/event-public-url";
import type { Event } from "@/lib/types";
import { useWorkspaceOperationPath, useWorkspaceScope } from "@/lib/use-workspace-scope";
import { formatEventDateTime } from "@/lib/utils";
import EditEventDialog from "./edit-event-dialog";

export default function EventCardClient({
  event,
  fileUrl,
}: {
  event: Event;
  fileUrl?: string | null;
}) {
  const router = useRouter();
  const workspaceScope = useWorkspaceScope();
  const rsvpsPath = useWorkspaceOperationPath("host", `rsvps?eventId=${event._id}`);
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
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [sendingQrBatch, setSendingQrBatch] = useState(false);

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
        toast.success("Event published");
      }
      if (lifecycleActionResult === "unpublished") {
        toast.success("Event unpublished");
      }
      if (lifecycleActionResult === "skipped") return;
      router.refresh();
    } catch (error: unknown) {
      toast.error((error as Error).message || "Failed to update lifecycle");
    }
  };

  const handleViewClick = () => {
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

  const sendPendingQrCodes = async () => {
    if (!workspaceScope || !pendingDeferredCount) return;
    setSendingQrBatch(true);
    try {
      const result = await sendDeferredQrBatch({
        eventId: event._id,
        ...workspaceScope.queryArgs,
      });
      const successMessage =
        result.failed > 0
          ? `Sent ${result.sent} QR codes (${result.failed} failed, ${result.skipped} skipped)`
          : `Sent ${result.sent} QR codes`;
      toast.success(successMessage);
      router.refresh();
    } catch (error: unknown) {
      toast.error((error as Error).message || "Failed to send QR codes");
    } finally {
      setSendingQrBatch(false);
    }
  };

  const showSendQrCodesButton = !isDraft && (pendingDeferredCount ?? 0) > 0;

  return (
    <Card className="flex flex-col h-content">
      <CardHeader className="pb-0">
        {fileUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileUrl} alt="Flyer" className="h-24 w-full object-cover rounded mb-3" />
        ) : (
          <div className="h-24 bg-foreground/5 rounded mb-3" />
        )}
      </CardHeader>
      <div className="flex flex-col flex-grow justify-between">
        <CardContent className="pb-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="font-medium truncate" title={inlineTitle}>
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
          <div className="text-xs text-foreground/70 mb-3">
            {formatEventDateTime(event.eventDate, event.eventTimezone)} • {event.location}
          </div>
        </CardContent>
        <CardFooter className="pt-0">
          <div className="w-full flex items-center justify-between mt-3 gap-1">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleViewClick}>
                {isDraft ? "Continue editing" : "View"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => router.push(rsvpsPath)}>
                RSVPs
              </Button>
              {showSendQrCodesButton && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={sendPendingQrCodes}
                  disabled={sendingQrBatch}
                >
                  {sendingQrBatch ? "Sending…" : `Send QR codes (${pendingDeferredCount})`}
                </Button>
              )}
            </div>

            <div className="flex gap-2">
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
                    className="aspect-square rounded-full"
                    aria-label="Share event"
                  >
                    <Share className="h-4 w-4" />
                  </Button>
                </ShareEventPopover>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="aspect-square rounded-full"
                  aria-label="Share event"
                  disabled
                >
                  <Share className="h-4 w-4" />
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" aria-label="Open event actions">
                    <MoreHorizontal className="h-6 w-6" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
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
                    onSelect={async (e) => {
                      e.preventDefault();
                      if (!workspaceScope) {
                        return;
                      }
                      try {
                        await setFeaturedEvent({
                          eventId: event._id,
                          ...workspaceScope.queryArgs,
                        });
                        toast.success(`"${inlineTitle}" is now the featured event`);
                        router.refresh();
                      } catch (error) {
                        toast.error("Failed to set featured event: " + (error as Error).message);
                      }
                    }}
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Set as Featured
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this event?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently remove the event and its list credentials.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={async () => {
                            if (!workspaceScope) {
                              return;
                            }
                            await removeEvent({
                              eventId: event._id,
                              ...workspaceScope.queryArgs,
                            });
                            router.refresh();
                          }}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardFooter>
      </div>

      <EditEventDialog
        event={event}
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        showTrigger={false}
      />
    </Card>
  );
}
