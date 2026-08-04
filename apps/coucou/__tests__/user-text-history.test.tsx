import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { FunctionReference } from "convex/server";
import { getFunctionName } from "convex/server";
import type {
  SmsConversationMessage,
  SmsConversationThreadDetail,
  UserSmsThreadHistoryEntry,
} from "../lib/types";

type QueryReference = FunctionReference<"query">;

const firstThreadId = "thread_1" as Id<"smsConversationThreads">;
const secondThreadId = "thread_2" as Id<"smsConversationThreads">;
const firstEventId = "event_1" as Id<"events">;
const secondEventId = "event_2" as Id<"events">;
const firstMessageId = "message_1" as Id<"smsConversationMessages">;
const secondMessageId = "message_2" as Id<"smsConversationMessages">;
const thirdMessageId = "message_3" as Id<"smsConversationMessages">;

const workspaceScope = {
  workspaceSlug: "dojo-pomodoro",
  siteKey: "dojo",
  brandName: "Dojo Pomodoro",
  queryArgs: {
    siteKey: "dojo",
    workspaceSlug: "dojo-pomodoro",
  },
};

function buildThread(patch: Partial<UserSmsThreadHistoryEntry> = {}): UserSmsThreadHistoryEntry {
  return {
    _id: firstThreadId,
    eventId: firstEventId,
    eventName: "Dojo Night",
    eventDate: 1_700_000_000_000,
    phoneHash: "phone_hash",
    phoneObfuscated: "***-***-1212",
    participantClerkUserIds: ["user_guest"],
    participantName: "Riley Park",
    lastMessageBody: "Can I bring a friend?",
    lastMessageAt: 1_700_000_000_000,
    lastMessageDirection: "inbound",
    lastMessageKind: "sms",
    messageCount: 2,
    inboundCount: 1,
    outboundCount: 1,
    systemCount: 0,
    canSend: true,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...patch,
  } as UserSmsThreadHistoryEntry;
}

function buildMessage(patch: Partial<SmsConversationMessage> = {}): SmsConversationMessage {
  return {
    _id: firstMessageId,
    threadId: firstThreadId,
    eventId: firstEventId,
    phoneHash: "phone_hash",
    direction: "inbound",
    kind: "sms",
    body: "Can I bring a friend?",
    providerStatus: "received",
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...patch,
  } as SmsConversationMessage;
}

const firstThread = buildThread();
const secondThread = buildThread({
  _id: secondThreadId,
  eventId: secondEventId,
  eventName: "Late Night Session",
  lastMessageBody: "What time are doors?",
});

let threadDetailsById: Record<string, SmsConversationThreadDetail> = {};
const queryCalls: Array<{ functionName: string; args: unknown }> = [];

function mockUseQuery(queryReference: QueryReference, args: unknown) {
  if (args === "skip") return undefined;
  const functionName = getFunctionName(queryReference);
  queryCalls.push({ functionName, args });
  if (functionName === "smsConversations:getThread") {
    const threadId = (args as { threadId: string }).threadId;
    return threadDetailsById[threadId];
  }
  return undefined;
}

mock.module("convex/react", () => ({
  useQuery: mockUseQuery,
}));

mock.module("@/lib/use-workspace-scope", () => ({
  useWorkspaceOperationPath: (_surface: string, pathname = "") =>
    pathname ? `/dashboard/${pathname}` : "/dashboard",
  useWorkspaceScope: () => workspaceScope,
}));

const { UserTextHistory } = await import("../components/users/user-text-history");

describe("UserTextHistory", () => {
  beforeEach(() => {
    queryCalls.length = 0;
    threadDetailsById = {
      thread_1: {
        thread: firstThread,
        event: null,
        messages: [
          buildMessage(),
          buildMessage({
            _id: secondMessageId,
            direction: "outbound",
            kind: "manual",
            body: "Yes, add them at the door.",
            providerStatus: "sent",
          }),
        ],
      },
      thread_2: {
        thread: secondThread,
        event: null,
        messages: [
          buildMessage({
            _id: thirdMessageId,
            threadId: secondThreadId,
            eventId: secondEventId,
            body: "What time are doors?",
          }),
        ],
      },
    };
  });

  it("shows full messages for the selected thread and switches conversations", async () => {
    render(<UserTextHistory threads={[firstThread, secondThread]} />);

    await waitFor(() => {
      expect(screen.getByText("Yes, add them at the door.")).toBeTruthy();
    });
    expect(screen.getAllByText("Can I bring a friend?").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /Late Night Session/ }));

    await waitFor(() => {
      expect(screen.getAllByText("What time are doors?").length).toBeGreaterThan(0);
    });
    expect(queryCalls).toContainEqual({
      functionName: "smsConversations:getThread",
      args: {
        threadId: "thread_2",
        siteKey: "dojo",
        workspaceSlug: "dojo-pomodoro",
      },
    });
  });

  it("shows a clear empty state when no threads exist", () => {
    render(<UserTextHistory threads={[]} />);

    expect(screen.getByText("No text history found.")).toBeTruthy();
  });
});
