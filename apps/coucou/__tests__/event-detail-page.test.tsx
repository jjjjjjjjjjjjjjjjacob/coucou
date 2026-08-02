import { describe, expect, it, mock } from "bun:test";
import { render, screen } from "@testing-library/react";
import type React from "react";
import type { Event } from "../lib/types";

const eventRecord = {
  _id: "event_123",
  name: "Club Chlorine",
  hosts: ["Club Chlorine"],
  location: "LE BAIN",
  eventDate: Date.now() + 86_400_000,
  eventTimezone: "America/New_York",
  lifecycle: "published",
  createdAt: Date.now(),
  updatedAt: Date.now(),
} as Event;

mock.module("convex/react", () => ({
  useAction: () => async () => undefined,
  useMutation: () => async () => undefined,
  useQuery: () => eventRecord,
}));

mock.module("next/navigation", () => ({
  useParams: () => ({ eventId: eventRecord._id }),
  usePathname: () => "/workspaces/club-chlorine/dashboard/events/event_123",
  useRouter: () => ({
    push: () => undefined,
    refresh: () => undefined,
  }),
  useSearchParams: () => new URLSearchParams(),
}));

mock.module("@/lib/use-workspace-scope", () => ({
  useWorkspaceOperationPath: (_surface: string, pathname = "") =>
    pathname ? `/host/${pathname}` : "/host",
  useWorkspaceScope: () => ({
    workspaceSlug: "club-chlorine",
    siteKey: "club-chlorine",
    brandName: "Club Chlorine",
    queryArgs: {
      siteKey: "club-chlorine",
      workspaceSlug: "club-chlorine",
    },
  }),
}));

mock.module("@/components/event-detail-layout", () => ({
  EventDetailLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

mock.module("../app/workspaces/[workspaceSlug]/host/events/edit-event-dialog", () => ({
  default: ({ initialTab }: { initialTab?: string }) => (
    <div data-testid="initial-event-detail-tab">{initialTab}</div>
  ),
}));

const { default: EventDetailPage } = await import(
  "../app/workspaces/[workspaceSlug]/host/events/[eventId]/page"
);

describe("EventDetailPage", () => {
  it("opens on guest RSVPs", () => {
    render(<EventDetailPage />);

    expect(screen.getByTestId("initial-event-detail-tab").textContent).toBe("guests");
  });
});
