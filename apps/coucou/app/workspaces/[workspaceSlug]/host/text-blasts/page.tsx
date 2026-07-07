"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  CheckCircle,
  Clock,
  Copy,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
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
import type { BadgeProps } from "@/components/ui/badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectOption } from "@/components/ui/select";
import { formatEventTitleInline } from "@/lib/event-display";
import type { Event, TextBlast, TextBlastStatus } from "@/lib/types";
import { useWorkspaceScope } from "@/lib/use-workspace-scope";
import { formatEventDateTime } from "@/lib/utils";
import TextBlastDialog from "./text-blast-dialog";

type TextBlastWithSender = TextBlast & { sentByName: string };
type FilterOption = "all" | "draft" | "sent" | "failed";
type SortOption = "date" | "name" | "recipients";

function getBlastTargetEventIds(blast: TextBlast): Id<"events">[] {
  return blast.targetEventIds && blast.targetEventIds.length > 0
    ? blast.targetEventIds
    : [blast.eventId];
}

function getStatusIcon(status: TextBlastStatus) {
  switch (status) {
    case "draft":
      return <Clock className="h-4 w-4" />;
    case "sending":
      return <Send className="h-4 w-4 animate-pulse" />;
    case "sent":
      return <CheckCircle className="h-4 w-4" />;
    case "failed":
      return <XCircle className="h-4 w-4" />;
    default:
      return <Clock className="h-4 w-4" />;
  }
}

function getStatusBadgeProps(status: TextBlastStatus): {
  variant: NonNullable<BadgeProps["variant"]>;
  label: string;
} {
  switch (status) {
    case "draft":
      return { variant: "secondary", label: "Draft" };
    case "sending":
      return { variant: "default", label: "Sending" };
    case "sent":
      return { variant: "success", label: "Sent" };
    case "failed":
      return { variant: "destructive", label: "Failed" };
    default:
      return { variant: "secondary", label: status };
  }
}

export default function TextBlastsPage() {
  const searchParams = useSearchParams();
  const workspaceScope = useWorkspaceScope();
  const events = useQuery(api.events.listAll, {
    ...(workspaceScope?.queryArgs ?? {}),
  }) as Event[] | undefined;

  const eventsSorted = useMemo<Event[]>(
    () =>
      (events ?? [])
        .slice()
        .sort(
          (firstEvent, secondEvent) => (secondEvent.eventDate ?? 0) - (firstEvent.eventDate ?? 0),
        ),
    [events],
  );

  const initialEventId = searchParams.get("eventId") ?? "all";
  const [selectedEventId, setSelectedEventId] = useState<string>(initialEventId);

  const textBlasts = useQuery(
    api.textBlasts.getBlastsByWorkspaceWithSenderNames,
    workspaceScope
      ? {
          ...workspaceScope.queryArgs,
        }
      : "skip",
  ) as TextBlastWithSender[] | undefined;

  const duplicateBlastMutation = useMutation(api.textBlasts.duplicateBlast);
  const deleteBlastMutation = useMutation(api.textBlasts.deleteBlast);
  const sendBlastAction = useAction(api.textBlasts.sendBlast);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterBy, setFilterBy] = useState<FilterOption>("all");
  const [sortBy, setSortBy] = useState<SortOption>("date");
  const [sentByFilter, setSentByFilter] = useState<string>("all");
  const [selectedBlastForDialog, setSelectedBlastForDialog] = useState<Id<"textBlasts"> | null>(
    null,
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"full" | "replyActions">("full");
  const [sendingBlastId, setSendingBlastId] = useState<Id<"textBlasts"> | null>(null);

  // Get unique sender names for filter dropdown
  const uniqueSenders = useMemo(() => {
    if (!textBlasts) return [];
    const senderMap = new Map<string, string>();
    textBlasts.forEach((blast) => {
      senderMap.set(blast.sentBy, blast.sentByName);
    });
    return Array.from(senderMap.entries()).map(([sentById, sentByName]) => ({
      sentById,
      sentByName,
    }));
  }, [textBlasts]);

  const eventsMap = useMemo(() => {
    const map = new Map<Id<"events">, Event>();
    events?.forEach((event) => {
      map.set(event._id, event);
    });
    return map;
  }, [events]);

  const filteredAndSortedBlasts = useMemo<TextBlastWithSender[]>(() => {
    if (!textBlasts) return [];

    let filtered = textBlasts.filter((blast) => {
      // Search filter
      const targetEvents = getBlastTargetEventIds(blast)
        .map((eventId) => eventsMap.get(eventId))
        .filter((event): event is Event => event !== undefined);
      const matchesSearch =
        blast.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        targetEvents.some((event) =>
          formatEventTitleInline(event).toLowerCase().includes(searchQuery.toLowerCase()),
        ) ||
        blast.message.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (
        selectedEventId !== "all" &&
        !getBlastTargetEventIds(blast).includes(selectedEventId as Id<"events">)
      ) {
        return false;
      }

      // Status filter
      if (filterBy !== "all" && blast.status !== filterBy) return false;

      // Sent by filter
      if (sentByFilter !== "all" && blast.sentBy !== sentByFilter) return false;

      return true;
    });

    // Sort
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "date":
          return b.createdAt - a.createdAt;
        case "recipients":
          return b.recipientCount - a.recipientCount;
        default:
          return 0;
      }
    });

    return filtered;
  }, [textBlasts, searchQuery, selectedEventId, filterBy, sentByFilter, sortBy, eventsMap]);

  const handleDuplicateBlast = async (blastId: Id<"textBlasts">) => {
    try {
      if (!workspaceScope) {
        toast.error("Workspace scope is required to duplicate text blasts");
        return;
      }
      await duplicateBlastMutation({ blastId, ...workspaceScope.queryArgs });
      toast.success("Text blast duplicated successfully");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to duplicate text blast");
    }
  };

  const handleDeleteBlast = async (blastId: Id<"textBlasts">) => {
    try {
      if (!workspaceScope) {
        toast.error("Workspace scope is required to delete text blasts");
        return;
      }
      await deleteBlastMutation({ blastId, ...workspaceScope.queryArgs });
      toast.success("Text blast deleted successfully");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to delete text blast");
    }
  };

  const handleSendBlast = async (blastId: Id<"textBlasts">) => {
    if (!workspaceScope) {
      toast.error("Workspace scope is required to send text blasts");
      return;
    }
    setSendingBlastId(blastId);
    try {
      const result = await sendBlastAction({
        blastId,
        ...workspaceScope.queryArgs,
      });
      if (result.success) {
        toast.success(
          `Text blast queued. Sending to ${result.totalRecipients} recipient${result.totalRecipients !== 1 ? "s" : ""}.`,
        );
      } else {
        toast.error(result.message || "Failed to send text blast");
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to send text blast");
    } finally {
      setSendingBlastId(null);
    }
  };

  const handleCreateNew = () => {
    setSelectedBlastForDialog(null);
    setDialogMode("full");
    setIsDialogOpen(true);
  };

  return (
    <div className="flex-1 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Text Blasts</h2>
          <p className="text-muted-foreground">Send bulk SMS messages to event attendees</p>
        </div>
        <Button onClick={handleCreateNew}>
          <Plus className="h-4 w-4 mr-2" />
          New Text Blast
        </Button>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-2 flex-1 flex-wrap">
          {/* Event Selector */}
          <Select
            value={selectedEventId}
            onValueChange={(value) => {
              setSelectedEventId(value);
              setSentByFilter("all");
            }}
          >
            <SelectOption value="all">All Events</SelectOption>
            {eventsSorted.map((event) => (
              <SelectOption key={event._id} value={event._id}>
                {formatEventTitleInline(event)}
              </SelectOption>
            ))}
          </Select>

          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search text blasts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>

          {/* Status Filter */}
          <Select value={filterBy} onValueChange={(value) => setFilterBy(value as FilterOption)}>
            <SelectOption value="all">All Statuses</SelectOption>
            <SelectOption value="draft">Drafts</SelectOption>
            <SelectOption value="sent">Sent</SelectOption>
            <SelectOption value="failed">Failed</SelectOption>
          </Select>

          {/* Sent By Filter */}
          {uniqueSenders.length > 1 && (
            <Select value={sentByFilter} onValueChange={(value) => setSentByFilter(value)}>
              <SelectOption value="all">All Hosts</SelectOption>
              {uniqueSenders.map(({ sentById, sentByName }) => (
                <SelectOption key={sentById} value={sentById}>
                  {sentByName}
                </SelectOption>
              ))}
            </Select>
          )}

          {/* Sort */}
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
            <SelectOption value="date">Sort by Date</SelectOption>
            <SelectOption value="name">Sort by Name</SelectOption>
            <SelectOption value="recipients">Sort by Recipients</SelectOption>
          </Select>
        </div>
      </div>

      {/* Text Blasts Grid */}
      {filteredAndSortedBlasts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Send className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No text blasts found</h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery || filterBy !== "all" || sentByFilter !== "all"
                ? "Try adjusting your search or filters"
                : "Create your first text blast to send SMS messages to event attendees"}
            </p>
            <Button onClick={handleCreateNew}>
              <Plus className="h-4 w-4 mr-2" />
              Create Text Blast
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredAndSortedBlasts.map((blast) => {
            const targetEventLabels = getBlastTargetEventIds(blast)
              .map((eventId) => eventsMap.get(eventId))
              .filter((event): event is Event => event !== undefined)
              .map((event) => formatEventTitleInline(event));
            const statusBadge = getStatusBadgeProps(blast.status);
            return (
              <Card key={blast._id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <CardTitle className="text-lg line-clamp-1">{blast.name}</CardTitle>
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        Sent by {blast.sentByName}
                      </p>
                      {targetEventLabels.length > 0 && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {targetEventLabels.length === 1
                            ? targetEventLabels[0]
                            : `${targetEventLabels.length} events`}
                        </p>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {(blast.status === "draft" || blast.status === "failed") && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem
                                onSelect={(e) => e.preventDefault()}
                                disabled={sendingBlastId === blast._id}
                              >
                                <Send className="h-4 w-4 mr-2" />
                                {sendingBlastId === blast._id ? "Sending..." : "Send Now"}
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Send Text Blast</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to send &ldquo;
                                  {blast.name}&rdquo; to {blast.recipientCount} recipient
                                  {blast.recipientCount !== 1 ? "s" : ""}?
                                  {blast.status === "failed" &&
                                    " This will retry the failed blast."}
                                  This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleSendBlast(blast._id)}>
                                  Send {blast.recipientCount} Message
                                  {blast.recipientCount !== 1 ? "s" : ""}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedBlastForDialog(blast._id);
                            setDialogMode("full");
                            setIsDialogOpen(true);
                          }}
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedBlastForDialog(blast._id);
                            setDialogMode("replyActions");
                            setIsDialogOpen(true);
                          }}
                        >
                          <MessageSquare className="h-4 w-4 mr-2" />
                          Manage Reply Actions
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicateBlast(blast._id)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        {blast.status !== "sending" && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem
                                onSelect={(e) => e.preventDefault()}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Text Blast</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {blast.status === "sent" ? (
                                    <>
                                      Are you sure you want to delete &ldquo;
                                      {blast.name}&rdquo;? This text blast was already sent to{" "}
                                      {blast.sentCount} recipient
                                      {blast.sentCount !== 1 ? "s" : ""}.
                                      <br />
                                      <br />
                                      This will remove the text blast record from your dashboard,
                                      but it will not affect messages that were already sent. This
                                      action cannot be undone.
                                    </>
                                  ) : blast.status === "failed" ? (
                                    <>
                                      Are you sure you want to delete &ldquo;
                                      {blast.name}&rdquo;? This text blast failed to send.
                                      <br />
                                      <br />
                                      This action cannot be undone.
                                    </>
                                  ) : (
                                    <>
                                      Are you sure you want to delete &ldquo;
                                      {blast.name}&rdquo;? This action cannot be undone.
                                    </>
                                  )}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteBlast(blast._id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  {/* Status Badge */}
                  <div className="flex items-center gap-2">
                    <Badge variant={statusBadge.variant} className="flex items-center gap-1">
                      {getStatusIcon(blast.status)}
                      {statusBadge.label}
                    </Badge>
                    {(blast.replyActionCount ?? 0) > 0 && (
                      <Badge variant="outline" className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {blast.replyActionCount} repl{blast.replyActionCount === 1 ? "y" : "ies"}
                      </Badge>
                    )}
                  </div>

                  {/* Message Preview */}
                  <p className="text-sm line-clamp-3 text-muted-foreground">{blast.message}</p>

                  {/* Stats */}
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      {blast.recipientCount} recipient
                      {blast.recipientCount !== 1 ? "s" : ""}
                    </span>
                    <span>
                      {blast.status === "sent" && blast.sentAt
                        ? `Sent ${formatEventDateTime(blast.sentAt)}`
                        : `Created ${formatEventDateTime(blast.createdAt)}`}
                    </span>
                  </div>

                  {/* Delivery Stats for Sent Blasts */}
                  {blast.status === "sent" && (
                    <div className="flex justify-between text-xs">
                      <span className="text-green-600">✓ {blast.sentCount} delivered</span>
                      {blast.failedCount > 0 && (
                        <span className="text-red-600">✗ {blast.failedCount} failed</span>
                      )}
                    </div>
                  )}

                  {/* Target Lists */}
                  <div className="flex flex-wrap gap-1">
                    {blast.targetLists.map((listKey) => (
                      <Badge key={listKey} variant="outline" className="text-xs">
                        {listKey.toUpperCase()}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Text Blast Dialog */}
      <TextBlastDialog
        isOpen={isDialogOpen}
        onClose={() => {
          setIsDialogOpen(false);
          setSelectedBlastForDialog(null);
          setDialogMode("full");
        }}
        blastId={selectedBlastForDialog}
        mode={dialogMode}
      />
    </div>
  );
}
