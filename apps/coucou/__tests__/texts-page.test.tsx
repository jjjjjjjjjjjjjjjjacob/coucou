import { beforeEach, describe, expect, it, mock } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import type { AnyFunctionReference } from "convex/server";
import type React from "react";
import type {
  Event,
  SmsConversationMessage,
  SmsConversationThread,
} from "../lib/types";

type QueryReference = AnyFunctionReference;
type ActionReference = AnyFunctionReference;

type ThreadDetail = {
  thread: SmsConversationThread;
  event: Event | null;
  messages: SmsConversationMessage[];
};

const workspaceScope = {
  workspaceSlug: "dojo-pomodoro",
  siteKey: "dojo",
  brandName: "Dojo Pomodoro",
  queryArgs: {
    siteKey: "dojo",
    workspaceSlug: "dojo-pomodoro",
  },
};

const eventRecord = {
  _id: "event_123",
  name: "Dojo Night",
  hosts: ["Dojo"],
  location: "Main Room",
  eventDate: Date.now() + 60_000,
  createdAt: Date.now(),
  updatedAt: Date.now(),
} as unknown as Event;

function buildThread(patch: Partial<SmsConversationThread> = {}): SmsConversationThread {
  return {
    _id: "thread_1",
    eventId: "event_123",
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
  } as SmsConversationThread;
}

function buildMessage(
  patch: Partial<SmsConversationMessage> = {},
): SmsConversationMessage {
  return {
    _id: "message_1",
    threadId: "thread_1",
    eventId: "event_123",
    phoneHash: "phone_hash",
    direction: "inbound",
    kind: "sms",
    body: "Can I bring a friend?",
    providerMessageId: "SM_inbound",
    providerStatus: "received",
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...patch,
  } as SmsConversationMessage;
}

let currentThreads: SmsConversationThread[] | undefined;
let currentThreadDetail: ThreadDetail | undefined;
let sendResult: { sent: boolean; failureReason?: string } = { sent: true };
const actionCalls: Array<{ actionReference: ActionReference; args: unknown }> = [];

function mockUseQuery(queryReference: QueryReference, args: unknown) {
  if (args === "skip") return undefined;
  const functionName = getFunctionName(queryReference);
  if (functionName === "events:listAll") return [eventRecord];
  if (functionName === "smsConversations:listThreads") return currentThreads;
  if (functionName === "smsConversations:getThread") return currentThreadDetail;
  return undefined;
}

function mockUseAction(actionReference: ActionReference) {
  return async (args: unknown) => {
    actionCalls.push({ actionReference, args });
    return sendResult;
  };
}

mock.module("convex/react", () => ({
  useAction: mockUseAction,
  useMutation: () => async () => undefined,
  useQuery: mockUseQuery,
}));

mock.module("@/lib/use-workspace-scope", () => ({
  useWorkspaceOperationPath: (_surface: string, pathname = "") => `/dashboard/${pathname}`,
  useWorkspaceScope: () => workspaceScope,
}));

mock.module("@/contexts/haptic-context", () => ({
  HapticProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useHapticContext: () => ({
    settings: { enabled: false, intensity: "medium" },
    updateSettings: () => {},
    trigger: () => false,
    isSupported: false,
  }),
}));

const { default: TextsPage } = await import(
  "../app/workspaces/[workspaceSlug]/host/texts/page"
);

describe("TextsPage", () => {
  beforeEach(() => {
    currentThreads = [];
    currentThreadDetail = undefined;
    sendResult = { sent: true };
    actionCalls.length = 0;
  });

  it("shows an empty event inbox state", () => {
    render(<TextsPage />);

    expect(screen.getByText("No SMS conversations for this event yet.")).toBeTruthy();
  });

  it("renders a selected conversation timeline and sends a manual SMS", async () => {
    const thread = buildThread();
    currentThreads = [thread];
    currentThreadDetail = {
      thread,
      event: eventRecord,
      messages: [
        buildMessage(),
        buildMessage({
          _id: "message_2",
          direction: "outbound",
          kind: "manual",
          body: "Yes, just add them at the door.",
          providerStatus: "sent",
          providerMessageId: "SM_outbound",
        }),
      ],
    };

    render(<TextsPage />);

    expect(screen.getAllByText("Riley Park").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Can I bring a friend?").length).toBeGreaterThan(0);
    expect(screen.getByText("Yes, just add them at the door.")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Write a direct message..."), {
      target: { value: "See you tonight." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(actionCalls).toHaveLength(1);
    });
    expect(actionCalls[0]?.args).toMatchObject({
      threadId: "thread_1",
      body: "See you tonight.",
      siteKey: "dojo",
      workspaceSlug: "dojo-pomodoro",
    });
  });

  it("disables the composer when the thread has no sendable phone", () => {
    const thread = buildThread({
      canSend: false,
      sendDisabledReason: "No linked guest phone is available for this thread.",
    });
    currentThreads = [thread];
    currentThreadDetail = {
      thread,
      event: eventRecord,
      messages: [buildMessage()],
    };

    render(<TextsPage />);

    expect(screen.getByText("No linked guest phone is available for this thread.")).toBeTruthy();
    expect(screen.getByPlaceholderText("Resolve this thread before sending")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });
});
