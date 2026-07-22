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
import { DashboardTitleBar } from "@/components/dashboard-title-bar";
import { PageToolbar } from "@/components/page-toolbar";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectOption } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
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

function _getStatusIcon(status: TextBlastStatus) {
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

function getStatusBadgeVariant(
  status: TextBlastStatus,
): "draft" | "published" | "denied" | "pending" {
  switch (status) {
    case "draft":
      return "draft";
    case "sent":
      return "published";
    case "failed":
      return "denied";
    case "sending":
      return "pending";
    default:
      return "draft";
  }
}

function getStatusLabel(status: TextBlastStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "sending":
      return "Sending";
    case "sent":
      return "Sent";
    case "failed":
      return "Failed";
    default:
      return status;
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

      if (filterBy !== "all" && blast.status !== filterBy) return false;

      if (sentByFilter !== "all" && blast.sentBy !== sentByFilter) return false;

      return true;
    });

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
    <div className="flex-1 space-y-5">
      <DashboardTitleBar
        title="Text Blasts"
        subtitle="Send bulk SMS messages to event attendees"
        action={
          <Button onClick={handleCreateNew}>
            <Plus className="mr-2 h-4 w-4" />
            New Text Blast
          </Button>
        }
        breadcrumb={[{ label: "Workspace" }]}
      />
      <PageToolbar
        mobileFilterContent={
          <>
            <div className="space-y-1">
              <label className="text-xs text-[var(--text-secondary)]">Event</label>
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
            </div>
            <div className="space-y-1">
              <label className="text-xs text-[var(--text-secondary)]">Status</label>
              <Select
                value={filterBy}
                onValueChange={(value) => setFilterBy(value as FilterOption)}
              >
                <SelectOption value="all">All Statuses</SelectOption>
                <SelectOption value="draft">Drafts</SelectOption>
                <SelectOption value="sent">Sent</SelectOption>
                <SelectOption value="failed">Failed</SelectOption>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-[var(--text-secondary)]">Sort</label>
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
                <SelectOption value="date">Sort by Date</SelectOption>
                <SelectOption value="name">Sort by Name</SelectOption>
                <SelectOption value="recipients">Sort by Recipients</SelectOption>
              </Select>
            </div>
          </>
        }
      >
        <Select
          value={selectedEventId}
          onValueChange={(value) => {
            setSelectedEventId(value);
            setSentByFilter("all");
          }}
          className="hidden w-56 sm:inline-flex"
        >
          <SelectOption value="all">All Events</SelectOption>
          {eventsSorted.map((event) => (
            <SelectOption key={event._id} value={event._id}>
              {formatEventTitleInline(event)}
            </SelectOption>
          ))}
        </Select>
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-[var(--text-secondary)]" />
          <Input
            placeholder="Search text blasts..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="pl-8"
          />
        </div>
        <Select
          value={filterBy}
          onValueChange={(value) => setFilterBy(value as FilterOption)}
          className="hidden w-44 sm:inline-flex"
        >
          <SelectOption value="all">All Statuses</SelectOption>
          <SelectOption value="draft">Drafts</SelectOption>
          <SelectOption value="sent">Sent</SelectOption>
          <SelectOption value="failed">Failed</SelectOption>
        </Select>
        {uniqueSenders.length > 1 ? (
          <Select
            value={sentByFilter}
            onValueChange={(value) => setSentByFilter(value)}
            className="hidden w-44 sm:inline-flex"
          >
            <SelectOption value="all">All Hosts</SelectOption>
            {uniqueSenders.map(({ sentById, sentByName }) => (
              <SelectOption key={sentById} value={sentById}>
                {sentByName}
              </SelectOption>
            ))}
          </Select>
        ) : null}
        <Select
          value={sortBy}
          onValueChange={(value) => setSortBy(value as SortOption)}
          className="hidden w-44 sm:inline-flex"
        >
          <SelectOption value="date">Sort by Date</SelectOption>
          <SelectOption value="name">Sort by Name</SelectOption>
          <SelectOption value="recipients">Sort by Recipients</SelectOption>
        </Select>
      </PageToolbar>

      {filteredAndSortedBlasts.length === 0 ? (
        <Card className="border-[var(--border-subtle)] bg-[var(--surface-2)] shadow-[var(--shadow-card)]">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Send className="mb-4 h-12 w-12 text-[var(--text-secondary)]" />
            <h3 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">
              No text blasts found
            </h3>
            <p className="mb-4 max-w-md text-center text-[var(--text-secondary)]">
              {searchQuery || filterBy !== "all" || sentByFilter !== "all"
                ? "Try adjusting your search or filters"
                : "Create your first text blast to send SMS messages to event attendees"}
            </p>
            <Button onClick={handleCreateNew}>
              <Plus className="mr-2 h-4 w-4" />
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
            const statusVariant = getStatusBadgeVariant(blast.status);
            return (
              <Card
                key={blast._id}
                className="border-[var(--border-subtle)] bg-[var(--surface-2)] shadow-[var(--shadow-card)] transition-shadow hover:shadow-lg"
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-1">
                      <CardTitle className="line-clamp-1 text-lg text-[var(--text-primary)]">
                        {blast.name}
                      </CardTitle>
                      <p className="line-clamp-1 text-sm text-[var(--text-secondary)]">
                        Sent by {blast.sentByName}
                      </p>
                      {targetEventLabels.length > 0 ? (
                        <p className="line-clamp-1 text-xs text-[var(--text-tertiary)]">
                          {targetEventLabels.length === 1
                            ? targetEventLabels[0]
                            : `${targetEventLabels.length} events`}
                        </p>
                      ) : null}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-primary)]">
                        {(blast.status === "draft" || blast.status === "failed") && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem
                                onSelect={(selectEvent) => selectEvent.preventDefault()}
                                disabled={sendingBlastId === blast._id}
                                className="focus:bg-[var(--surface-3)] focus:text-[var(--text-primary)]"
                              >
                                <Send className="mr-2 h-4 w-4" />
                                {sendingBlastId === blast._id ? "Sending..." : "Send Now"}
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-primary)]">
                              <AlertDialogHeader>
                                <AlertDialogTitle>Send Text Blast</AlertDialogTitle>
                                <AlertDialogDescription className="text-[var(--text-secondary)]">
                                  Are you sure you want to send \u201c{blast.name}\u201d to{" "}
                                  {blast.recipientCount} recipient
                                  {blast.recipientCount !== 1 ? "s" : ""}? This action cannot be
                                  undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-primary)] hover:bg-[var(--surface-3)]">
                                  Cancel
                                </AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleSendBlast(blast._id)}>
                                  Send {blast.recipientCount} Message
                                  {blast.recipientCount !== 1 ? "s" : ""}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        <DropdownMenuItem
                          onSelect={() => {
                            setSelectedBlastForDialog(blast._id);
                            setDialogMode("full");
                            setIsDialogOpen(true);
                          }}
                          className="focus:bg-[var(--surface-3)] focus:text-[var(--text-primary)]"
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            setSelectedBlastForDialog(blast._id);
                            setDialogMode("replyActions");
                            setIsDialogOpen(true);
                          }}
                          className="focus:bg-[var(--surface-3)] focus:text-[var(--text-primary)]"
                        >
                          <MessageSquare className="mr-2 h-4 w-4" />
                          Manage Reply Actions
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => handleDuplicateBlast(blast._id)}
                          className="focus:bg-[var(--surface-3)] focus:text-[var(--text-primary)]"
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Duplicate
                        </DropdownMenuItem>
                        {blast.status !== "sending" && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem
                                onSelect={(selectEvent) => selectEvent.preventDefault()}
                                className="text-destructive focus:bg-[var(--surface-3)] focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-primary)]">
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Text Blast</AlertDialogTitle>
                                <AlertDialogDescription className="text-[var(--text-secondary)]">
                                  Are you sure you want to delete \u201c{blast.name}\u201d? This
                                  action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-primary)] hover:bg-[var(--surface-3)]">
                                  Cancel
                                </AlertDialogCancel>
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
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      variant={statusVariant}
                      label={getStatusLabel(blast.status)}
                      showDot={false}
                    />
                    {(blast.replyActionCount ?? 0) > 0 && (
                      <Badge
                        variant="outline"
                        className="flex items-center gap-1 border-[var(--border-subtle)] text-[var(--text-secondary)]"
                      >
                        <MessageSquare className="h-3 w-3" />
                        {blast.replyActionCount} repl{blast.replyActionCount === 1 ? "y" : "ies"}
                      </Badge>
                    )}
                  </div>

                  <p className="line-clamp-3 text-sm text-[var(--text-secondary)]">
                    {blast.message}
                  </p>

                  <div className="flex justify-between text-xs text-[var(--text-secondary)]">
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

                  {blast.status === "sent" && (
                    <div className="flex justify-between text-xs">
                      <span className="text-[var(--status-approved)]">
                        ✓ {blast.sentCount} delivered
                      </span>
                      {blast.failedCount > 0 && (
                        <span className="text-[var(--status-denied)]">
                          ✗ {blast.failedCount} failed
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1">
                    {blast.targetLists.map((listKey) => (
                      <Badge
                        key={listKey}
                        variant="secondary"
                        className="text-xs bg-[var(--surface-3)] text-[var(--text-primary)]"
                      >
                        {listKey}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

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
