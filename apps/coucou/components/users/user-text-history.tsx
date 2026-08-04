"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { MessageSquareText } from "lucide-react";
import React from "react";
import {
  formatConversationFullTimestamp,
  SmsConversationMessageBubble,
} from "@/components/sms-conversation-message-bubble";
import { StatusBadge } from "@/components/ui/status-badge";
import type { SmsConversationThreadDetail, UserSmsThreadHistoryEntry } from "@/lib/types";
import { useWorkspaceScope } from "@/lib/use-workspace-scope";
import { cn } from "@/lib/utils";

function ThreadDetailSkeleton() {
  return (
    <div className="space-y-4 p-4" aria-label="Loading conversation">
      <div className="h-14 w-3/4 animate-pulse rounded-lg bg-[var(--surface-3)]" />
      <div className="ml-auto h-20 w-4/5 animate-pulse rounded-lg bg-[var(--surface-3)]" />
      <div className="h-16 w-2/3 animate-pulse rounded-lg bg-[var(--surface-3)]" />
    </div>
  );
}

function formatThreadTimestamp(timestamp: number | undefined): string {
  if (!timestamp) return "No messages yet";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function getThreadPreview(thread: UserSmsThreadHistoryEntry): string {
  const lastMessageBody = thread.lastMessageBody?.trim();
  if (lastMessageBody) return lastMessageBody;
  return `${thread.messageCount} message${thread.messageCount === 1 ? "" : "s"}`;
}

export function UserTextHistory({ threads }: { threads: UserSmsThreadHistoryEntry[] | undefined }) {
  const workspaceScope = useWorkspaceScope();
  const [selectedThreadId, setSelectedThreadId] =
    React.useState<Id<"smsConversationThreads"> | null>(null);

  React.useEffect(() => {
    if (!threads || threads.length === 0) {
      setSelectedThreadId(null);
      return;
    }
    if (!selectedThreadId || !threads.some((thread) => thread._id === selectedThreadId)) {
      setSelectedThreadId(threads[0]._id);
    }
  }, [selectedThreadId, threads]);

  const threadDetail = useQuery(
    api.smsConversations.getThread,
    selectedThreadId && workspaceScope
      ? { threadId: selectedThreadId, ...workspaceScope.queryArgs }
      : "skip",
  ) as SmsConversationThreadDetail | undefined;

  if (threads === undefined) {
    return <ThreadDetailSkeleton />;
  }

  if (threads.length === 0) {
    return <p className="text-sm text-[var(--text-secondary)]">No text history found.</p>;
  }

  const selectedThread = threads.find((thread) => thread._id === selectedThreadId) ?? threads[0];

  return (
    <div className="space-y-4">
      <nav aria-label="Text conversation threads">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {threads.map((thread) => {
            const isSelected = thread._id === selectedThread._id;
            return (
              <button
                key={thread._id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelectedThreadId(thread._id)}
                className={cn(
                  "min-w-56 max-w-72 flex-1 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isSelected
                    ? "border-[var(--border-strong)] bg-[var(--surface-3)]"
                    : "border-[var(--border-subtle)] bg-[var(--surface-1)] hover:bg-[var(--surface-3)]",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-[var(--text-primary)]">
                      {thread.eventName}
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
                      {thread.phoneObfuscated}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
                    {thread.messageCount}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs text-[var(--text-secondary)]">
                  {getThreadPreview(thread)}
                </p>
                <div className="mt-2 text-[11px] text-[var(--text-tertiary)]">
                  {formatThreadTimestamp(thread.lastMessageAt)}
                </div>
              </button>
            );
          })}
        </div>
      </nav>

      <section
        className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]"
        aria-label={`${selectedThread.eventName} text conversation`}
      >
        <div className="flex flex-col gap-2 border-b border-[var(--border-subtle)] bg-[var(--surface-2)] px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <MessageSquareText className="h-4 w-4 text-[var(--text-secondary)]" />
              <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">
                {selectedThread.eventName}
              </h3>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-secondary)]">
              <span>{selectedThread.phoneObfuscated}</span>
              <span>
                {selectedThread.inboundCount} in · {selectedThread.outboundCount} out
              </span>
              {selectedThread.lastMessageAt ? (
                <span>Updated {formatConversationFullTimestamp(selectedThread.lastMessageAt)}</span>
              ) : null}
            </div>
          </div>
          <StatusBadge
            variant={selectedThread.canSend ? "approved" : "default"}
            label={selectedThread.canSend ? "Send enabled" : "Read-only"}
            showDot={false}
          />
        </div>

        {threadDetail === undefined ? (
          <ThreadDetailSkeleton />
        ) : threadDetail.messages.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-[var(--text-secondary)]">
            No messages recorded in this thread yet.
          </div>
        ) : (
          <div className="max-h-[32rem] overflow-y-auto bg-[var(--surface-1)] px-3 py-4 sm:px-5">
            <div className="space-y-4">
              {threadDetail.messages.map((message) => (
                <SmsConversationMessageBubble key={message._id} message={message} />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
