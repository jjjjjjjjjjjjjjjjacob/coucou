import { beforeEach, describe, expect, it, mock } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import type { Event } from "../lib/types";

const GENERIC_APPROVAL_PLACEHOLDER = "You have been approved. We're looking forward to seeing you.";

let credentialQueryResult:
  | Array<{
      _id: string;
      listKey: string;
      generateQR?: boolean;
      approvalMessage?: string;
    }>
  | undefined;

const mockReplace = mock(() => {});
const mockActionHandler = mock(async () => []);
const mockUseAction = mock(() => mockActionHandler);
const mockUseQuery = mock((_query: unknown, args: unknown) => {
  if (args === "skip") {
    return undefined;
  }
  return credentialQueryResult;
});

mock.module("next/navigation", () => ({
  useRouter: mock(() => ({
    replace: mockReplace,
    push: mock(() => {}),
    refresh: mock(() => {}),
  })),
  usePathname: mock(() => "/"),
}));

mock.module("convex/react", () => ({
  useAction: mockUseAction,
  useQuery: mockUseQuery,
}));

mock.module("sonner", () => ({
  toast: {
    success: mock(() => {}),
    error: mock(() => {}),
  },
}));

mock.module("@/components/custom-fields-builder", () => ({
  CustomFieldsEditor: () => <div data-testid="custom-fields-editor" />,
}));

mock.module("@/components/flyer-upload", () => ({
  FlyerUpload: () => <div data-testid="flyer-upload" />,
  StorageImageUpload: () => <div data-testid="storage-image-upload" />,
}));

mock.module("@/components/event-icon-upload", () => ({
  EventIconUpload: () => <div data-testid="event-icon-upload" />,
}));

mock.module("@/components/date-time-picker", () => ({
  DateTimePicker: () => <div data-testid="date-time-picker" />,
}));

mock.module("@/components/ui/checkbox", () => ({
  Checkbox: ({
    checked,
    id,
    onCheckedChange,
  }: {
    checked?: boolean;
    id?: string;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <input
      checked={checked}
      id={id}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      type="checkbox"
    />
  ),
}));

mock.module("@/components/ui/select", () => ({
  Select: ({
    children,
    className,
    onValueChange,
    value,
  }: {
    children: React.ReactNode;
    className?: string;
    onValueChange?: (value: string) => void;
    value?: string;
  }) => (
    <select
      className={className}
      onChange={(event) => onValueChange?.(event.target.value)}
      value={value}
    >
      {children}
    </select>
  ),
  SelectOption: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
}));

mock.module("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className} data-testid="dialog-content">
      {children}
    </div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const { default: NewEventClient } = await import("../app/host/new/client");
const { default: EditEventDialog } = await import("../app/host/events/edit-event-dialog");

describe("event config approval messages", () => {
  beforeEach(() => {
    credentialQueryResult = undefined;
    mockActionHandler.mockClear();
    mockReplace.mockClear();
    mockUseAction.mockClear();
    mockUseQuery.mockClear();
  });

  it("renders one approval textarea per default list on the create-event page and removes the old standalone section", () => {
    render(<NewEventClient />);

    expect(screen.queryByText("SMS APPROVAL MESSAGES")).not.toBeInTheDocument();
    expect(screen.getAllByPlaceholderText(GENERIC_APPROVAL_PLACEHOLDER)).toHaveLength(2);
  });

  it("preloads per-list edit values from the deprecated event-level fallback and keeps the old standalone section removed", async () => {
    credentialQueryResult = [
      {
        _id: "credential_1",
        listKey: "vip",
        generateQR: true,
      },
    ];

    const event = {
      _id: "event_1",
      name: "Spring Gala",
      hosts: ["Host One"],
      location: "Main Room",
      eventDate: Date.now() + 60_000,
      approvalMessage: "Legacy event approval copy.",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as unknown as Event;

    render(<EditEventDialog event={event} open onOpenChange={() => {}} showTrigger={false} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Legacy event approval copy.")).toBeInTheDocument();
    });

    expect(screen.queryByText("SMS APPROVAL MESSAGES")).not.toBeInTheDocument();
    expect(screen.getByTestId("dialog-content").className).toContain("sm:max-w-[1200px]");
  });
});
