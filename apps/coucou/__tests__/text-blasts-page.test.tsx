import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import { render, screen } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import type { TextBlast } from "../lib/types";

let textBlast: TextBlast & { sentByName: string };

mock.module("convex/react", () => ({
  useAction: () => async () => undefined,
  useMutation: () => async () => undefined,
  useQuery: (reference: Parameters<typeof getFunctionName>[0], args: unknown) => {
    if (args === "skip") return undefined;
    if (getFunctionName(reference) === "textBlasts:getBlastsByWorkspaceWithSenderNames") {
      return [textBlast];
    }
    return [];
  },
}));

mock.module("@/lib/use-workspace-scope", () => ({
  useWorkspaceOperationPath: () => "/host",
  useWorkspaceScope: () => ({
    workspaceSlug: "dojo-pomodoro",
    queryArgs: { workspaceSlug: "dojo-pomodoro" },
  }),
}));

mock.module("../app/workspaces/[workspaceSlug]/host/text-blasts/text-blast-dialog", () => ({
  default: () => null,
}));

const { default: TextBlastsPage } = await import(
  "../app/workspaces/[workspaceSlug]/host/text-blasts/page"
);
const { HapticProvider } = await import("../contexts/haptic-context");

beforeEach(() => {
  textBlast = {
    _id: "blast_results" as Id<"textBlasts">,
    eventId: "event_123" as Id<"events">,
    name: "Mixed results blast",
    message: "See you there",
    targetLists: [],
    recipientCount: 804,
    sentCount: 800,
    failedCount: 4,
    sentBy: "host_123",
    sentByName: "Test Host",
    status: "failed",
    createdAt: 1_789_070_400_000,
    updatedAt: 1_789_070_400_000,
  };
});

function renderPage() {
  render(
    <HapticProvider>
      <TextBlastsPage />
    </HapticProvider>,
  );
}

describe("text blast result counts", () => {
  it.each([
    { status: "failed", sentCount: 800, failedCount: 4 },
    { status: "sent", sentCount: 800, failedCount: 4 },
    { status: "sent", sentCount: 804, failedCount: 0 },
    { status: "failed", sentCount: 0, failedCount: 804 },
  ] as const)("shows both recipient outcomes for %j", (outcome) => {
    Object.assign(textBlast, outcome);

    renderPage();

    expect(screen.getByText(`${outcome.sentCount} succeeded`)).toBeTruthy();
    expect(screen.getByText(`${outcome.failedCount} failed`)).toBeTruthy();
    expect(screen.queryByTitle("Failed")).toBeNull();
    expect(screen.queryByTitle("Sent")).toBeNull();
    expect(screen.queryByText(/delivered/)).toBeNull();
  });

  it.each([
    { status: "draft", label: "Draft" },
    { status: "sending", label: "Sending" },
  ] as const)("keeps the %s lifecycle label before completion", ({ status, label }) => {
    Object.assign(textBlast, { status, sentCount: 0, failedCount: 0 });

    renderPage();

    expect(screen.getByTitle(label)).toBeTruthy();
    expect(screen.queryByText(/succeeded/)).toBeNull();
    expect(screen.queryByText("0 failed")).toBeNull();
  });
});
