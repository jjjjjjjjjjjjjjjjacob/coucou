import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { FunctionReference } from "convex/server";
import { getFunctionName } from "convex/server";
import type React from "react";
import type {
  Event,
  SmsConversationMessage,
  SmsConversationThread,
  SmsConversationThreadSummary,
} from "../lib/types";

type QueryReference = FunctionReference<"query">;
type ActionReference = FunctionReference<"action">;

type ThreadDetail = {
  thread: SmsConversationThread;
  event: Event | null;
  messages: SmsConversationMessage[];
};

type NextNavigationTestGlobal = typeof globalThis & {
  __setNextNavigationTestState?: (nextState: {
    pathname?: string;
    searchParams?: string | URLSearchParams;
    params?: Record<string, string>;
  }) => void;
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

function buildThread(
  patch: Partial<SmsConversationThreadSummary> = {},
): SmsConversationThreadSummary {
  return {
    _id: "thread_1",
    eventId: "event_123",
    phoneHash: "phone_hash",
    phoneObfuscated: "***-***-1212",
    participantClerkUserIds: ["user_guest"],
    participantName: "Riley Park",
    eventName: "Dojo Night",
    eventDate: eventRecord.eventDate,
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
  } as SmsConversationThreadSummary;
}

function buildMessage(patch: Partial<SmsConversationMessage> = {}): SmsConversationMessage {
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

let currentThreads: SmsConversationThreadSummary[] | undefined;
let currentThreadDetail: ThreadDetail | undefined;
let sendResult: { sent: boolean; failureReason?: string } = { sent: true };
const actionCalls: Array<{ actionReference: ActionReference; args: unknown }> = [];
const queryCalls: Array<{ functionName: string; args: unknown }> = [];

function mockUseQuery(queryReference: QueryReference, args: unknown) {
  if (args === "skip") return undefined;
  const functionName = getFunctionName(queryReference);
  queryCalls.push({ functionName, args });
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
  useWorkspaceOperationPath: (_surface: string, pathname = "") =>
    pathname ? `/dashboard/${pathname}` : "/dashboard",
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

const { default: TextsPage } = await import("../app/workspaces/[workspaceSlug]/host/texts/page");

describe("TextsPage", () => {
  beforeEach(() => {
    (globalThis as NextNavigationTestGlobal).__setNextNavigationTestState?.({
      searchParams: "",
    });
    currentThreads = [];
    currentThreadDetail = undefined;
    sendResult = { sent: true };
    actionCalls.length = 0;
    queryCalls.length = 0;
  });

  it("defaults to the all-events workspace inbox", () => {
    render(<TextsPage />);

    expect(screen.getByRole("combobox", { name: "Select event" })).toHaveValue("all");
    expect(screen.getByText("No SMS conversations in this workspace yet.")).toBeTruthy();
    const latestListThreadsCall = queryCalls
      .filter((queryCall) => queryCall.functionName === "smsConversations:listThreads")
      .at(-1);
    expect(latestListThreadsCall?.args).toMatchObject({
      conversationStates: [],
      search: "",
      siteKey: "dojo",
      workspaceSlug: "dojo-pomodoro",
    });
    expect(latestListThreadsCall?.args).not.toHaveProperty("eventId");
  });

  it("honors a valid eventId deep link", () => {
    (globalThis as NextNavigationTestGlobal).__setNextNavigationTestState?.({
      searchParams: "eventId=event_123",
    });

    render(<TextsPage />);

    expect(screen.getByRole("combobox", { name: "Select event" })).toHaveValue("event_123");
    const latestListThreadsCall = queryCalls
      .filter((queryCall) => queryCall.functionName === "smsConversations:listThreads")
      .at(-1);
    expect(latestListThreadsCall?.args).toMatchObject({ eventId: "event_123" });
  });

  it("falls back to all events for an invalid eventId deep link", async () => {
    (globalThis as NextNavigationTestGlobal).__setNextNavigationTestState?.({
      searchParams: "eventId=event_missing",
    });

    render(<TextsPage />);

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Select event" })).toHaveValue("all");
    });
    const latestListThreadsCall = queryCalls
      .filter((queryCall) => queryCall.functionName === "smsConversations:listThreads")
      .at(-1);
    expect(latestListThreadsCall?.args).not.toHaveProperty("eventId");
  });

  it("combines conversation states with OR-style multi-select query arguments", async () => {
    currentThreads = [buildThread()];

    render(<TextsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Conversation state" }));
    fireEvent.click(screen.getByLabelText(/Needs reply/));
    fireEvent.click(screen.getByLabelText(/Has incoming/));

    await waitFor(() => {
      const latestListThreadsCall = queryCalls
        .filter((queryCall) => queryCall.functionName === "smsConversations:listThreads")
        .at(-1);
      expect(latestListThreadsCall?.args).toMatchObject({
        conversationStates: ["needs_reply", "has_incoming"],
      });
    });
    expect(screen.getAllByText("Needs reply").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Has incoming").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Reset view" }));
    await waitFor(() => {
      expect(screen.queryByLabelText(/Needs reply/)).toBeNull();
    });

    const resetListThreadsCall = queryCalls
      .filter((queryCall) => queryCall.functionName === "smsConversations:listThreads")
      .at(-1);
    expect(resetListThreadsCall?.args).toMatchObject({
      conversationStates: [],
      search: "",
    });
    expect(screen.getByRole("combobox", { name: "Select event" })).toHaveValue("all");
  });

  it("distinguishes a filtered empty result from an empty workspace", () => {
    render(<TextsPage />);

    fireEvent.change(screen.getByPlaceholderText("Search conversations"), {
      target: { value: "missing person" },
    });

    expect(screen.getByText("No conversations match these filters.")).toBeTruthy();
    expect(screen.getByText("Search: “missing person”")).toBeTruthy();
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
          _id: "message_2" as Id<"smsConversationMessages">,
          direction: "outbound",
          kind: "manual",
          body: "Yes, just add them at the door.",
          providerStatus: "sent",
          providerMessageId: "SM_outbound",
          qrCodeSent: true,
        }),
      ],
    };

    render(<TextsPage />);

    expect(screen.getAllByText("Riley Park").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Dojo Night").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Can I bring a friend?").length).toBeGreaterThan(0);
    expect(screen.getByText("Yes, just add them at the door.")).toBeTruthy();
    expect(screen.getByText("QR sent")).toBeTruthy();

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
