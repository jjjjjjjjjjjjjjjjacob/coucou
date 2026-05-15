import { beforeEach, describe, expect, it, mock } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import type { Event } from "../lib/types";

type ActionCall = {
  args: unknown;
};

type ListPayload = {
  listKey: string;
  password?: string;
  generateQR?: boolean;
  sendQrOnApproval?: boolean;
  approvalMessage?: string;
};

type CreateEventActionArgs = {
  name: string;
  lists: ListPayload[];
};

type CredentialQueryResult = Array<{
  _id: string;
  listKey: string;
  hasPassword?: boolean;
  generateQR?: boolean;
  sendQrOnApproval?: boolean;
  approvalMessage?: string;
}>;

const actionCalls: ActionCall[] = [];
let credentialQueryResult: CredentialQueryResult | undefined;
const workspaceQueryResult = {
  slug: "dojo",
  name: "Dojo",
  eventDefaults: {},
  sites: [{ siteKey: "dojo" }],
};
const workspaceScope = {
  workspaceSlug: "dojo",
  siteKey: "dojo",
  brandName: "Dojo",
  queryArgs: {
    siteKey: "dojo",
    workspaceSlug: "dojo",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCreateEventActionArgs(value: unknown): value is CreateEventActionArgs {
  if (!isRecord(value)) return false;
  return value.name === "Spring Gala" && Array.isArray(value.lists);
}

function getCreateEventActionArgs(): CreateEventActionArgs {
  const matchingCall = actionCalls.find((actionCall) => isCreateEventActionArgs(actionCall.args));
  if (!matchingCall || !isCreateEventActionArgs(matchingCall.args)) {
    throw new Error("Create event action was not called");
  }
  return matchingCall.args;
}

const mockUseQuery = mock((_queryReference: unknown, args: unknown) => {
  if (args === "skip") return undefined;
  if (isRecord(args) && "eventId" in args) return credentialQueryResult;
  if (isRecord(args) && "slug" in args) return workspaceQueryResult;
  return undefined;
});

const mockActionHandler = mock(async (args: unknown) => {
  actionCalls.push({ args });
  if (isRecord(args) && "eventId" in args && !("lists" in args) && !("patch" in args)) {
    return [];
  }
  return { ok: true, eventId: "event_created" };
});
const mockUseAction = mock(() => mockActionHandler);

const mockUseMutation = mock(() =>
  mock(async () => ({
    eventId: "draft_event",
  })),
);

mock.module("convex/react", () => ({
  useAction: mockUseAction,
  useMutation: mockUseMutation,
  useQuery: mockUseQuery,
}));

mock.module("@/lib/use-workspace-scope", () => ({
  useWorkspaceOperationPath: (_surface: string, pathname = "") => `/host/${pathname}`,
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

mock.module("@/components/date-time-picker", () => ({
  DateTimePicker: ({
    onDateChange,
    onTimeChange,
    onTimezoneChange,
  }: {
    onDateChange: (value: string) => void;
    onTimeChange: (value: string) => void;
    onTimezoneChange?: (value: string) => void;
  }) => (
    <button
      type="button"
      onClick={() => {
        onDateChange("2030-05-01");
        onTimeChange("22:00");
        onTimezoneChange?.("America/New_York");
      }}
    >
      Set event date
    </button>
  ),
}));

mock.module("@/components/event-acts-editor", () => ({
  EventActsEditor: () => <div data-testid="event-acts-editor" />,
}));

mock.module("@/components/event-icon-upload", () => ({
  EventIconUpload: () => <div data-testid="event-icon-upload" />,
}));

mock.module("@/components/flyer-upload", () => ({
  FlyerUpload: () => <div data-testid="flyer-upload" />,
  StorageImageUpload: () => <div data-testid="storage-image-upload" />,
}));

mock.module("@/components/custom-fields-builder", () => ({
  CustomFieldsEditor: () => <div data-testid="custom-fields-editor" />,
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

mock.module("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsContent: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <section data-testid={`tabs-content-${value}`}>{children}</section>
  ),
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

const { default: EventCreateWizard } = await import("../components/event-create-wizard");
const { default: EditEventDialog } = await import(
  "../app/workspaces/[workspaceSlug]/host/events/edit-event-dialog"
);

async function clickContinue() {
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

describe("event confirmation texts", () => {
  beforeEach(() => {
    actionCalls.length = 0;
    credentialQueryResult = undefined;
    mockActionHandler.mockClear();
    mockUseAction.mockClear();
    mockUseMutation.mockClear();
    mockUseQuery.mockClear();
  });

  it("adds a creation wizard step for per-list confirmation texts and submits them", async () => {
    render(<EventCreateWizard />);

    fireEvent.change(screen.getByPlaceholderText("Pomodoro 14"), {
      target: { value: "Spring Gala" },
    });
    await clickContinue();
    await screen.findByText("Where, when, how many.");

    fireEvent.change(screen.getByPlaceholderText(/Bushwick/), {
      target: { value: "Main Room" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set event date" }));
    await clickContinue();
    await screen.findByText("Pick the colors.");

    await clickContinue();
    await screen.findByText("Drop the flyer.");
    await clickContinue();
    await screen.findByText("Status & ticket details.");
    await clickContinue();
    await screen.findByText("How they get in.");
    await clickContinue();
    await screen.findByText("Write the confirmations.");

    expect(screen.getAllByPlaceholderText(/Use {{firstName}}/)).toHaveLength(2);

    fireEvent.change(screen.getByLabelText("vip"), {
      target: {
        value:
          "Hi {{ firstName }}, approved for {{eventName}} at {{eventLocation}} on {{eventDate}}. Ticket: {{qrCodeUrl}}",
      },
    });
    expect(
      screen.getByText(
        "Hi John, approved for Spring Gala at Main Room on 05.01.2030. Ticket: https://example.com/ticket",
      ),
    ).toBeInTheDocument();

    const attachGeneratedQrCodeCheckboxes = screen.getAllByLabelText("Attach generated QR code");
    fireEvent.click(attachGeneratedQrCodeCheckboxes[0]);
    expect(attachGeneratedQrCodeCheckboxes[0]).toBeChecked();
    expect(
      screen.getByText("Generated QR image will be attached with this approval SMS."),
    ).toBeInTheDocument();

    await clickContinue();
    await screen.findByText("What you want to know.");
    await clickContinue();
    await screen.findByText("Last look.");

    fireEvent.click(screen.getByRole("button", { name: /Publish/ }));

    await waitFor(() => {
      expect(getCreateEventActionArgs().lists).toContainEqual({
        listKey: "vip",
        password: "",
        generateQR: true,
        sendQrOnApproval: true,
        approvalMessage:
          "Hi {{ firstName }}, approved for {{eventName}} at {{eventLocation}} on {{eventDate}}. Ticket: {{qrCodeUrl}}",
      });
    });
  });

  it("adds an edit dialog tab that hydrates per-list and fallback confirmation texts", async () => {
    credentialQueryResult = [
      {
        _id: "credential_vip",
        listKey: "vip",
        hasPassword: true,
        generateQR: true,
        sendQrOnApproval: true,
        approvalMessage: "Hi {{firstName}}, VIP for {{eventName}}.",
      },
      {
        _id: "credential_ga",
        listKey: "ga",
        hasPassword: false,
        generateQR: false,
      },
    ];

    const event = {
      _id: "event_1",
      name: "Spring Gala",
      hosts: ["Host One"],
      location: "Main Room",
      eventDate: Date.now() + 60_000,
      approvalMessage: "Legacy {{eventLocation}} copy.",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as unknown as Event;

    render(<EditEventDialog event={event} open onOpenChange={() => {}} showTrigger={false} />);

    expect(screen.getByRole("button", { name: "Confirmation Texts" })).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByDisplayValue("Hi {{firstName}}, VIP for {{eventName}}."),
      ).toBeInTheDocument();
      expect(screen.getByDisplayValue("Legacy {{eventLocation}} copy.")).toBeInTheDocument();
      expect(screen.getByText("Hi John, VIP for Spring Gala.")).toBeInTheDocument();
      expect(screen.getByText("Legacy Main Room copy.")).toBeInTheDocument();
      expect(screen.getAllByLabelText("Attach generated QR code")[0]).toBeChecked();
    });
  });
});
