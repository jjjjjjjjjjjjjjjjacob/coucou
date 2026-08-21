"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useQuery } from "convex/react";
import { AlertCircle, Filter, MessageSquare, QrCode, RefreshCw, Search, Send } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DashboardTitleBar } from "@/components/dashboard-title-bar";
import { SmsConversationMessageBubble } from "@/components/sms-conversation-message-bubble";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Chip, ChipGroup } from "@/components/ui/chip-group";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectOption } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatEventTitleInline } from "@/lib/event-display";
import type {
  Event,
  SmsConversationFilterState,
  SmsConversationThread,
  SmsConversationThreadDetail,
  SmsConversationThreadSummary,
} from "@/lib/types";
import { useWorkspaceScope } from "@/lib/use-workspace-scope";
import { cn } from "@/lib/utils";

const ALL_EVENTS_VALUE = "all";

const CONVERSATION_FILTER_OPTIONS: Array<{
  value: SmsConversationFilterState;
  label: string;
  description: string;
}> = [
  {
    value: "needs_reply",
    label: "Needs reply",
    description: "Latest text is incoming",
  },
  {
    value: "waiting_on_guest",
    label: "Waiting on guest",
    description: "Latest text is outgoing",
  },
  {
    value: "has_incoming",
    label: "Has incoming",
    description: "One or more incoming texts",
  },
  {
    value: "no_incoming",
    label: "No incoming",
    description: "No incoming texts",
  },
];

function getConversationFilterLabel(filterState: SmsConversationFilterState): string {
  return (
    CONVERSATION_FILTER_OPTIONS.find((filterOption) => filterOption.value === filterState)?.label ??
    filterState
  );
}

function formatConversationTimestamp(timestamp: number | undefined): string {
  if (!timestamp) return "-";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
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

export default function TextsPage() {
  const searchParams = useSearchParams();
  const workspaceScope = useWorkspaceScope();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string>(
    searchParams.get("eventId") ?? ALL_EVENTS_VALUE,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedConversationStates, setSelectedConversationStates] = useState<
    SmsConversationFilterState[]
  >([]);
  const [conversationFiltersOpen, setConversationFiltersOpen] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<Id<"smsConversationThreads"> | null>(
    null,
  );
  const [messageDraft, setMessageDraft] = useState("");
  const [attachQrCode, setAttachQrCode] = useState(false);
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

  const selectedEventIsValid =
    selectedEventId === ALL_EVENTS_VALUE ||
    eventsSorted.some((event) => event._id === selectedEventId);

  useEffect(() => {
    if (events !== undefined && !selectedEventIsValid) {
      setSelectedEventId(ALL_EVENTS_VALUE);
      setSelectedThreadId(null);
    }
  }, [events, selectedEventIsValid]);

  const threads = useQuery(
    api.smsConversations.listThreads,
    workspaceScope && selectedEventIsValid
      ? {
          ...(selectedEventId === ALL_EVENTS_VALUE
            ? {}
            : { eventId: selectedEventId as Id<"events"> }),
          search: searchQuery,
          conversationStates: selectedConversationStates,
          ...workspaceScope.queryArgs,
        }
      : "skip",
  ) as SmsConversationThreadSummary[] | undefined;

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
  ) as SmsConversationThreadDetail | undefined;
  const sendManualMessage = useAction(api.smsConversations.sendManualMessage);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadDetail?.messages]);

  useEffect(() => {
    setAttachQrCode(false);
    setMessageDraft("");
  }, [selectedThreadId]);

  const selectedThread = threadDetail?.thread ?? null;
  const requiredMessagePrefix =
    workspaceScope?.siteKey === "club-chlorine" ? "CLUB CHLORINE:" : null;
  const canSendMessage = Boolean(
    selectedThread?.canSend && (messageDraft.trim() || attachQrCode) && !isSending,
  );
  const hasConversationFilters =
    searchQuery.trim().length > 0 || selectedConversationStates.length > 0;

  function updateConversationState(filterState: SmsConversationFilterState, selected: boolean) {
    setSelectedConversationStates((currentFilterStates) => {
      if (selected) {
        return currentFilterStates.includes(filterState)
          ? currentFilterStates
          : [...currentFilterStates, filterState];
      }
      return currentFilterStates.filter((currentFilterState) => currentFilterState !== filterState);
    });
    setSelectedThreadId(null);
  }

  async function handleSendMessage() {
    if (!selectedThreadId || !workspaceScope || (!messageDraft.trim() && !attachQrCode)) return;
    const body = messageDraft.trim();
    setIsSending(true);
    try {
      const result = await sendManualMessage({
        threadId: selectedThreadId,
        body,
        includeQrCode: attachQrCode,
        ...workspaceScope.queryArgs,
      });
      if (result.sent) {
        setMessageDraft("");
        setAttachQrCode(false);
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
        subtitle="Workspace SMS threads with guests, reply actions, and delivery history."
        secondaryAction={
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSelectedEventId(ALL_EVENTS_VALUE);
              setSearchQuery("");
              setSelectedConversationStates([]);
              setConversationFiltersOpen(false);
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
              value={selectedEventId}
              onValueChange={(value) => {
                setSelectedEventId(value);
                setSelectedThreadId(null);
              }}
              aria-label="Select event"
            >
              <SelectOption value={ALL_EVENTS_VALUE}>All events</SelectOption>
              {eventsSorted.map((event) => (
                <SelectOption key={event._id} value={event._id}>
                  {formatEventTitleInline(event)}
                </SelectOption>
              ))}
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
            <Popover open={conversationFiltersOpen} onOpenChange={setConversationFiltersOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start border-[var(--border-subtle)] font-normal"
                >
                  <Filter className="h-4 w-4" />
                  <span className="flex-1 text-left">Conversation state</span>
                  {selectedConversationStates.length > 0 ? (
                    <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                      {selectedConversationStates.length}
                    </Badge>
                  ) : null}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-2">
                <div className="space-y-1">
                  {CONVERSATION_FILTER_OPTIONS.map((filterOption) => {
                    const checkboxId = `conversation-state-${filterOption.value}`;
                    return (
                      <label
                        key={filterOption.value}
                        htmlFor={checkboxId}
                        className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-2 hover:bg-[var(--surface-3)]"
                      >
                        <Checkbox
                          id={checkboxId}
                          checked={selectedConversationStates.includes(filterOption.value)}
                          onCheckedChange={(checked) =>
                            updateConversationState(filterOption.value, checked === true)
                          }
                          className="mt-0.5"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{filterOption.label}</span>
                          <span className="block text-xs text-muted-foreground">
                            {filterOption.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
            {hasConversationFilters ? (
              <ChipGroup aria-label="Active conversation filters">
                {searchQuery.trim() ? (
                  <Chip
                    label={`Search: “${searchQuery.trim()}”`}
                    onRemove={() => setSearchQuery("")}
                    removeLabel="Clear conversation search"
                  />
                ) : null}
                {selectedConversationStates.map((filterState) => (
                  <Chip
                    key={filterState}
                    label={getConversationFilterLabel(filterState)}
                    onRemove={() => updateConversationState(filterState, false)}
                    removeLabel={`Remove ${getConversationFilterLabel(filterState)} filter`}
                  />
                ))}
              </ChipGroup>
            ) : null}
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
                {hasConversationFilters
                  ? "No conversations match these filters."
                  : selectedEventId === ALL_EVENTS_VALUE
                    ? "No SMS conversations in this workspace yet."
                    : "No SMS conversations for this event yet."}
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
                        {selectedEventId === ALL_EVENTS_VALUE ? (
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">
                            {thread.eventName}
                          </div>
                        ) : null}
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
                        {threadDetail?.event
                          ? formatEventTitleInline(threadDetail.event)
                          : "Unknown event"}
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
                      <SmsConversationMessageBubble key={message._id} message={message} />
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t border-[var(--border-subtle)] p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    Manual Twilio SMS
                    {requiredMessagePrefix
                      ? " · Brand prefix and STOP reminder added automatically"
                      : ""}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant={attachQrCode ? "secondary" : "outline"}
                      size="sm"
                      className="h-9 active:scale-[0.96] transition-transform"
                      disabled={!selectedThread.canAttachQr || isSending}
                      title={selectedThread.qrAttachmentDisabledReason}
                      onClick={() => setAttachQrCode((isAttached) => !isAttached)}
                    >
                      <QrCode className="h-4 w-4" />
                      {attachQrCode
                        ? "QR attached"
                        : selectedThread.qrDeliveredAt
                          ? "Attach QR again"
                          : "Attach QR"}
                    </Button>
                    <span className="tabular-nums">{messageDraft.trim().length}/1600</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    {requiredMessagePrefix ? (
                      <div className="w-fit rounded border border-border bg-muted px-2 py-1 font-medium text-xs">
                        {requiredMessagePrefix}
                      </div>
                    ) : null}
                    {attachQrCode ? (
                      <div className="flex items-center gap-2 rounded-md bg-[var(--surface-3)] px-3 py-2 text-xs text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-subtle)]">
                        <QrCode className="h-4 w-4 shrink-0 text-[var(--text-primary)]" />
                        The guest&apos;s generated event QR will be attached as an image.
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
                          ? attachQrCode
                            ? "Add an optional message for the QR..."
                            : "Write a direct message..."
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
