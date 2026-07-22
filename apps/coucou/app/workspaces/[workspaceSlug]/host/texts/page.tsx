"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useQuery } from "convex/react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Info,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DashboardTitleBar } from "@/components/dashboard-title-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectOption } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatEventTitleInline } from "@/lib/event-display";
import type {
  Event,
  SmsConversationDirection,
  SmsConversationKind,
  SmsConversationMessage,
  SmsConversationThread,
} from "@/lib/types";
import { useWorkspaceScope } from "@/lib/use-workspace-scope";
import { cn } from "@/lib/utils";

type ThreadDetail = {
  thread: SmsConversationThread;
  event: Event | null;
  messages: SmsConversationMessage[];
};

function formatConversationTimestamp(timestamp: number | undefined): string {
  if (!timestamp) return "-";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatConversationFullTimestamp(timestamp: number | undefined): string {
  if (!timestamp) return "-";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function formatKindLabel(kind: SmsConversationKind | undefined): string {
  switch (kind) {
    case "manual":
      return "Manual";
    case "blast":
      return "Blast";
    case "approval":
      return "Approval";
    case "consent":
      return "Consent";
    case "reply_action":
      return "Reply action";
    case "opt_out":
      return "Opt-out";
    case "help":
      return "Help";
    case "delivery_status":
      return "Delivery";
    case "system":
      return "System";
    case "sms":
    default:
      return "SMS";
  }
}

function getDirectionLabel(direction: SmsConversationDirection | undefined): string {
  switch (direction) {
    case "inbound":
      return "Inbound";
    case "outbound":
      return "Outbound";
    case "system":
      return "System";
    default:
      return "Message";
  }
}

function getStatusIcon(status: string | undefined) {
  switch (status) {
    case "sent":
    case "delivered":
      return <CheckCircle2 className="h-3.5 w-3.5" />;
    case "failed":
    case "undelivered":
      return <AlertCircle className="h-3.5 w-3.5" />;
    case "pending":
    case "queued":
    case "accepted":
      return <Clock className="h-3.5 w-3.5" />;
    default:
      return <Info className="h-3.5 w-3.5" />;
  }
}

function getThreadPreview(thread: SmsConversationThread): string {
  const lastMessageBody = thread.lastMessageBody?.trim();
  if (lastMessageBody) return lastMessageBody;
  return `${thread.messageCount} message${thread.messageCount === 1 ? "" : "s"}`;
}

function EmptyThreadState() {
  return (
    <div className="flex min-h-[28rem] flex-1 flex-col items-center justify-center px-6 text-center text-muted-foreground">
      <MessageSquare className="mb-4 h-11 w-11" />
      <h3 className="text-sm font-semibold text-foreground">No conversation selected</h3>
      <p className="mt-1 max-w-sm text-sm">
        Choose a guest thread to see messages, reply-action history, and delivery details.
      </p>
    </div>
  );
}

function MessageBubble({ message }: { message: SmsConversationMessage }) {
  if (message.direction === "system") {
    return (
      <div className="flex justify-center">
        <div className="max-w-[88%] rounded-md border border-border bg-secondary/40 px-3 py-2 text-center text-xs text-muted-foreground">
          <div>{message.body || formatKindLabel(message.kind)}</div>
          <div className="mt-1 flex items-center justify-center gap-2 text-[11px]">
            <span>{formatConversationFullTimestamp(message.createdAt)}</span>
            {message.providerStatus ? <span>{message.providerStatus}</span> : null}
          </div>
        </div>
      </div>
    );
  }

  const isOutbound = message.direction === "outbound";
  return (
    <div className={cn("flex", isOutbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[82%] rounded-lg border px-4 py-3 shadow-sm",
          isOutbound
            ? "border-primary/20 bg-primary text-primary-foreground"
            : "border-border bg-card text-foreground",
        )}
      >
        <div className="whitespace-pre-wrap text-sm leading-relaxed">
          {message.body || "Media message"}
        </div>
        {message.mediaUrls && message.mediaUrls.length > 0 ? (
          <div className="mt-3 grid gap-2">
            {message.mediaUrls.map((mediaUrl) => (
              <a
                key={mediaUrl}
                href={mediaUrl}
                target="_blank"
                rel="noreferrer"
                className="truncate rounded border border-border bg-background px-2 py-1 text-xs text-foreground underline-offset-2 hover:underline"
              >
                {mediaUrl}
              </a>
            ))}
          </div>
        ) : null}
        <div
          className={cn(
            "mt-2 flex flex-wrap items-center gap-2 text-[11px]",
            isOutbound ? "text-primary-foreground/75" : "text-muted-foreground",
          )}
        >
          <span>{getDirectionLabel(message.direction)}</span>
          <span>{formatKindLabel(message.kind)}</span>
          <span>{formatConversationFullTimestamp(message.createdAt)}</span>
          {message.providerStatus ? (
            <span className="inline-flex items-center gap-1">
              {getStatusIcon(message.providerStatus)}
              {message.providerStatus}
            </span>
          ) : null}
          {message.providerMessageId ? (
            <span className="max-w-[12rem] truncate">id: {message.providerMessageId}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function TextsPage() {
  const searchParams = useSearchParams();
  const workspaceScope = useWorkspaceScope();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(
    searchParams.get("eventId"),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState<Id<"smsConversationThreads"> | null>(
    null,
  );
  const [messageDraft, setMessageDraft] = useState("");
  const [isSending, setIsSending] = useState(false);

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

  useEffect(() => {
    if (!selectedEventId && eventsSorted[0]?._id) {
      setSelectedEventId(eventsSorted[0]._id);
    }
  }, [eventsSorted, selectedEventId]);

  const selectedEvent = useMemo(
    () => eventsSorted.find((event) => event._id === selectedEventId) ?? null,
    [eventsSorted, selectedEventId],
  );

  const threads = useQuery(
    api.smsConversations.listThreads,
    selectedEventId && workspaceScope
      ? {
          eventId: selectedEventId as Id<"events">,
          search: searchQuery,
          ...workspaceScope.queryArgs,
        }
      : "skip",
  ) as SmsConversationThread[] | undefined;

  useEffect(() => {
    if (!threads || threads.length === 0) {
      setSelectedThreadId(null);
      return;
    }
    if (!selectedThreadId || !threads.some((thread) => thread._id === selectedThreadId)) {
      setSelectedThreadId(threads[0]._id);
    }
  }, [threads, selectedThreadId]);

  const threadDetail = useQuery(
    api.smsConversations.getThread,
    selectedThreadId && workspaceScope
      ? {
          threadId: selectedThreadId,
          ...workspaceScope.queryArgs,
        }
      : "skip",
  ) as ThreadDetail | undefined;
  const sendManualMessage = useAction(api.smsConversations.sendManualMessage);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadDetail?.messages]);

  const selectedThread = threadDetail?.thread ?? null;
  const requiredMessagePrefix =
    workspaceScope?.siteKey === "club-chlorine" ? "CLUB CHLORINE:" : null;
  const canSendMessage = Boolean(selectedThread?.canSend && messageDraft.trim() && !isSending);

  async function handleSendMessage() {
    if (!selectedThreadId || !workspaceScope || !messageDraft.trim()) return;
    const body = messageDraft.trim();
    setIsSending(true);
    try {
      const result = await sendManualMessage({
        threadId: selectedThreadId,
        body,
        ...workspaceScope.queryArgs,
      });
      if (result.sent) {
        setMessageDraft("");
        toast.success("Message sent");
      } else {
        toast.error(result.failureReason ?? "Message was not sent");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send message");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <DashboardTitleBar
        title="Texts"
        subtitle="Per-event SMS threads with guests, reply actions, and delivery history."
        secondaryAction={
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSearchQuery("");
              setSelectedThreadId(null);
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Reset view
          </Button>
        }
        breadcrumb={[{ label: "Workspace" }]}
      />
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]">
          <div className="shrink-0 space-y-3 border-b border-[var(--border-subtle)] p-3">
            <Select
              value={selectedEventId ?? ""}
              onValueChange={(value) => {
                setSelectedEventId(value || null);
                setSelectedThreadId(null);
              }}
              aria-label="Select event"
            >
              {eventsSorted.length === 0 ? (
                <SelectOption value="">No events</SelectOption>
              ) : (
                eventsSorted.map((event) => (
                  <SelectOption key={event._id} value={event._id}>
                    {formatEventTitleInline(event)}
                  </SelectOption>
                ))
              )}
            </Select>
            <div className="relative">
              <Search className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search conversations"
                className="pl-9"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {!workspaceScope ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Workspace scope is loading.
              </div>
            ) : threads === undefined ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Loading conversations...
              </div>
            ) : threads.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No SMS conversations for this event yet.
              </div>
            ) : (
              threads.map((thread) => {
                const isSelected = thread._id === selectedThreadId;
                return (
                  <button
                    key={thread._id}
                    type="button"
                    onClick={() => setSelectedThreadId(thread._id)}
                    className={cn(
                      "mb-2 w-full rounded-md border p-3 text-left transition-colors",
                      isSelected
                        ? "border-[var(--border-strong)] bg-[var(--surface-3)]"
                        : "border-[var(--border-subtle)] bg-[var(--surface-1)] hover:bg-[var(--surface-3)]",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{thread.participantName}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {thread.phoneObfuscated}
                        </div>
                      </div>
                      <Badge
                        variant={thread.canSend ? "secondary" : "outline"}
                        className="shrink-0"
                      >
                        {thread.canSend ? "Open" : "Read"}
                      </Badge>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                      {getThreadPreview(thread)}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        {thread.inboundCount} in · {thread.outboundCount} out
                      </span>
                      <span>{formatConversationTimestamp(thread.lastMessageAt)}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]">
          {!selectedThreadId || !selectedThread ? (
            <EmptyThreadState />
          ) : (
            <>
              <div className="shrink-0 border-b border-[var(--border-subtle)] px-4 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold">
                      {selectedThread.participantName}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{selectedThread.phoneObfuscated}</span>
                      <span>
                        {selectedEvent ? formatEventTitleInline(selectedEvent) : "Selected event"}
                      </span>
                      <span>{selectedThread.messageCount} messages</span>
                    </div>
                  </div>
                  <Badge variant={selectedThread.canSend ? "success" : "outline"}>
                    {selectedThread.canSend ? "Send enabled" : "Send disabled"}
                  </Badge>
                </div>
                {!selectedThread.canSend && selectedThread.sendDisabledReason ? (
                  <div className="mt-3 flex items-center gap-2 rounded-md border border-[var(--status-pending)]/30 bg-[var(--status-pending-bg)] px-3 py-2 text-xs text-[var(--status-pending)]">
                    <AlertCircle className="h-4 w-4" />
                    {selectedThread.sendDisabledReason}
                  </div>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--surface-1)] px-3 py-4 lg:px-5">
                {threadDetail?.messages.length === 0 ? (
                  <div className="py-16 text-center text-sm text-muted-foreground">
                    No messages recorded in this thread yet.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(threadDetail?.messages ?? []).map((message) => (
                      <MessageBubble key={message._id} message={message} />
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t border-[var(--border-subtle)] p-3">
                <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    Manual Twilio SMS
                    {requiredMessagePrefix
                      ? " · Brand prefix and STOP reminder added automatically"
                      : ""}
                  </span>
                  <span>{messageDraft.trim().length}/1600</span>
                </div>
                <div className="flex gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    {requiredMessagePrefix ? (
                      <div className="w-fit rounded border border-border bg-muted px-2 py-1 font-medium text-xs">
                        {requiredMessagePrefix}
                      </div>
                    ) : null}
                    <Textarea
                      value={messageDraft}
                      onChange={(event) => setMessageDraft(event.target.value.slice(0, 1600))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                          event.preventDefault();
                          void handleSendMessage();
                        }
                      }}
                      disabled={!selectedThread.canSend || isSending}
                      placeholder={
                        selectedThread.canSend
                          ? "Write a direct message..."
                          : "Resolve this thread before sending"
                      }
                      rows={2}
                      className="min-h-12 resize-none"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={handleSendMessage}
                    disabled={!canSendMessage}
                    className="h-auto self-stretch"
                    aria-label="Send message"
                  >
                    <Send className="h-4 w-4" />
                    <span className="hidden sm:inline">{isSending ? "Sending" : "Send"}</span>
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
