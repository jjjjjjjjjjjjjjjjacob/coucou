import { beforeEach, describe, expect, it, mock } from "bun:test";
import { render, screen } from "@testing-library/react";
import { HapticProvider } from "../contexts/haptic-context";

let eventEntriesResponse: unknown;

mock.module("convex/react", () => ({
  useAction: () => async () => undefined,
  useMutation: () => async () => undefined,
  useQuery: () => eventEntriesResponse,
}));

mock.module("@/lib/use-workspace-scope", () => ({
  useWorkspaceOperationPath: (_surface: string, pathname = "") =>
    pathname ? `/host/${pathname}` : "/host",
  useWorkspaceScope: () => ({
    workspaceSlug: "dojo-pomodoro",
    siteKey: "dojo",
    brandName: "Dojo Pomodoro",
    queryArgs: {
      siteKey: "dojo",
      workspaceSlug: "dojo-pomodoro",
    },
  }),
}));

const { default: EventsPage } = await import("../app/workspaces/[workspaceSlug]/host/events/page");

function renderEventsPage() {
  return render(
    <HapticProvider>
      <EventsPage />
    </HapticProvider>,
  );
}

describe("workspace events page", () => {
  beforeEach(() => {
    eventEntriesResponse = undefined;
  });

  it("shows a loading state instead of the empty state while events load", () => {
    renderEventsPage();

    expect(screen.getByRole("status", { name: "Loading events" })).toBeTruthy();
    expect(screen.queryByText("No events yet")).toBeNull();
    expect(screen.queryByText("No events found")).toBeNull();
  });

  it("shows the empty state after events finish loading", () => {
    eventEntriesResponse = [];

    renderEventsPage();

    expect(screen.queryByRole("status", { name: "Loading events" })).toBeNull();
    expect(screen.getByText("No events yet")).toBeTruthy();
  });
});
