import { beforeEach, describe, expect, it, mock } from "bun:test";
import { api } from "@convex/_generated/api";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import type { Event } from "../lib/types";

type ActionCall = {
  actionName: "create" | "update" | "updateAndPublish" | "unknown";
  args: unknown;
};

type ListPayload = {
  listKey: string;
  password?: string;
  generateQR?: boolean;
  sendQrOnApproval?: boolean;
  includeTicketLinkOnApproval?: boolean;
  approvalMessage?: string;
  autoApproveLimit?: number;
  autoApproveDelayMinutes?: number;
};

type CreateEventActionArgs = {
  name: string;
  rsvpConfirmationMessageEnabled?: boolean;
  rsvpConfirmationMessage?: string;
  lists: ListPayload[];
};

type NextNavigationTestGlobal = typeof globalThis & {
  __setNextNavigationTestState?: (nextState: {
    pathname?: string;
    searchParams?: string | URLSearchParams;
    params?: Record<string, string>;
  }) => void;
};

type CredentialQueryResult = Array<{
  _id: string;
  listKey: string;
  password?: string;
  hasPassword?: boolean;
  generateQR?: boolean;
  defersQrDelivery?: boolean;
  sendQrOnApproval?: boolean;
  includeTicketLinkOnApproval?: boolean;
  approvalMessage?: string;
  autoApproveLimit?: number;
  autoApproveDelayMinutes?: number;
  autoApprovedCount?: number;
}>;

const actionCalls: ActionCall[] = [];
let credentialQueryResult: CredentialQueryResult | undefined;
let draftEventQueryResult: Event | null | undefined;
let draftEventQueryFallbackIndex = 0;
let actionHookFallbackIndex = 0;
let workspaceQueryResult = {
  slug: "dojo",
  name: "Dojo",
  eventDefaults: {},
  sites: [{ siteKey: "dojo" }],
};
let workspaceScope = {
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

function setNavigationSearchParams(searchParams: URLSearchParams = new URLSearchParams()) {
  (globalThis as NextNavigationTestGlobal).__setNextNavigationTestState?.({
    pathname: `/workspaces/${workspaceScope.workspaceSlug}/host/new`,
    searchParams,
    params: {
      workspaceSlug: workspaceScope.workspaceSlug,
    },
  });
}

const mockUseQuery = mock((queryReference: unknown, args: unknown) => {
  if (args === "skip") return undefined;
  if (isRecord(args) && "slug" in args) return workspaceQueryResult;
  if (isRecord(args) && "eventId" in args && queryReference === api.events.get) {
    return draftEventQueryResult;
  }
  if (
    isRecord(args) &&
    "eventId" in args &&
    queryReference === api.credentials.getHostCredsForEvent
  ) {
    return credentialQueryResult;
  }
  if (isRecord(args) && "eventId" in args) {
    if (draftEventQueryResult !== undefined && credentialQueryResult !== undefined) {
      const fallbackIndex = draftEventQueryFallbackIndex;
      draftEventQueryFallbackIndex += 1;
      return fallbackIndex % 2 === 0 ? draftEventQueryResult : credentialQueryResult;
    }
    return credentialQueryResult ?? draftEventQueryResult;
  }
  return undefined;
});

function recordActionCall(
  actionName: ActionCall["actionName"],
  args: unknown,
): { ok: true; eventId: string } {
  actionCalls.push({ actionName, args });
  return { ok: true, eventId: "event_created" };
}

const mockCreateActionHandler = mock(async (args: unknown) => recordActionCall("create", args));
const mockUpdateActionHandler = mock(async (args: unknown) => recordActionCall("update", args));
const mockUpdateAndPublishActionHandler = mock(async (args: unknown) =>
  recordActionCall("updateAndPublish", args),
);
const mockGetStoredPasswordsActionHandler = mock(async () => []);
const mockUnknownActionHandler = mock(async (args: unknown) => recordActionCall("unknown", args));
let actionHookFallbackHandlers: Array<(args: unknown) => Promise<unknown>> = [
  mockCreateActionHandler,
  mockUpdateActionHandler,
  mockUpdateAndPublishActionHandler,
];
const mockUseAction = mock((actionReference: unknown) => {
  const fallbackIndex = actionHookFallbackIndex;
  actionHookFallbackIndex += 1;
  if (actionReference === api.eventsNode.create) return mockCreateActionHandler;
  if (actionReference === api.eventsNode.update) return mockUpdateActionHandler;
  if (actionReference === api.eventsNode.updateAndPublish) {
    return mockUpdateAndPublishActionHandler;
  }
  return (
    actionHookFallbackHandlers[fallbackIndex % actionHookFallbackHandlers.length] ??
    mockUnknownActionHandler
  );
});

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
  useWorkspaceOperationPath: (_surface: string, pathname = "") =>
    pathname ? `/host/${pathname}` : "/host",
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
    draftEventQueryResult = undefined;
    draftEventQueryFallbackIndex = 0;
    actionHookFallbackIndex = 0;
    workspaceQueryResult = {
      slug: "dojo",
      name: "Dojo",
      eventDefaults: {},
      sites: [{ siteKey: "dojo" }],
    };
    workspaceScope = {
      workspaceSlug: "dojo",
      siteKey: "dojo",
      brandName: "Dojo",
      queryArgs: {
        siteKey: "dojo",
        workspaceSlug: "dojo",
      },
    };
    mockCreateActionHandler.mockClear();
    mockUpdateActionHandler.mockClear();
    mockUpdateAndPublishActionHandler.mockClear();
    mockGetStoredPasswordsActionHandler.mockClear();
    mockUnknownActionHandler.mockClear();
    mockUseAction.mockClear();
    mockUseMutation.mockClear();
    mockUseQuery.mockClear();
    actionHookFallbackHandlers = [
      mockCreateActionHandler,
      mockUpdateActionHandler,
      mockUpdateAndPublishActionHandler,
    ];
    setNavigationSearchParams();
  });

  it("prefills new event colors and lists from workspace defaults", async () => {
    workspaceQueryResult = {
      slug: "club-chlorine",
      name: "Club Chlorine",
      eventDefaults: {
        themeBackgroundColor: "#101820",
        themeTextColor: "#FEE715",
        listKeys: ["pool", "cabana"],
      },
      sites: [{ siteKey: "club-chlorine" }],
    };
    workspaceScope = {
      workspaceSlug: "club-chlorine",
      siteKey: "club-chlorine",
      brandName: "Club Chlorine",
      queryArgs: {
        siteKey: "club-chlorine",
        workspaceSlug: "club-chlorine",
      },
    };

    render(<EventCreateWizard />);

    fireEvent.change(screen.getByPlaceholderText("Pomodoro 14"), {
      target: { value: "Pool Night" },
    });
    await clickContinue();
    await screen.findByRole("heading", { name: "Schedule & capacity" });
    fireEvent.change(screen.getByPlaceholderText(/Bushwick/), {
      target: { value: "Pool Deck" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set event date" }));
    await clickContinue();
    await screen.findByRole("heading", { name: "Branding" });

    expect(screen.getAllByDisplayValue("#101820").length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue("#FEE715").length).toBeGreaterThan(0);

    await clickContinue();
    await screen.findByRole("heading", { name: "Flyer" });
    await clickContinue();
    await screen.findByRole("heading", { name: "Guest page" });
    await clickContinue();
    await screen.findByRole("heading", { name: "Lists & access" });

    expect(screen.getByDisplayValue("pool")).toBeInTheDocument();
    expect(screen.getByDisplayValue("cabana")).toBeInTheDocument();
  });

  it("uses the tenant site preset when workspace event colors are absent", async () => {
    workspaceQueryResult = {
      slug: "club-chlorine",
      name: "Club Chlorine",
      eventDefaults: {},
      sites: [{ siteKey: "club-chlorine" }],
    };
    workspaceScope = {
      workspaceSlug: "club-chlorine",
      siteKey: "club-chlorine",
      brandName: "Club Chlorine",
      queryArgs: {
        siteKey: "club-chlorine",
        workspaceSlug: "club-chlorine",
      },
    };

    render(<EventCreateWizard />);

    fireEvent.change(screen.getByPlaceholderText("Pomodoro 14"), {
      target: { value: "Pool Night" },
    });
    await clickContinue();
    await screen.findByRole("heading", { name: "Schedule & capacity" });
    fireEvent.change(screen.getByPlaceholderText(/Bushwick/), {
      target: { value: "Pool Deck" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set event date" }));
    await clickContinue();
    await screen.findByRole("heading", { name: "Branding" });

    expect(screen.getAllByDisplayValue("#FFFFFF").length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue("#1E3CFF").length).toBeGreaterThan(0);
  });

  it("disables draft save while an existing draft is loading", () => {
    setNavigationSearchParams(new URLSearchParams("draftId=draft_event"));
    credentialQueryResult = undefined;
    draftEventQueryResult = undefined;

    render(<EventCreateWizard />);

    expect(screen.getByRole("button", { name: "Save & finish later" })).toBeDisabled();
  });

  it("hydrates an existing draft before saving so stored event and list values win", async () => {
    setNavigationSearchParams(new URLSearchParams("draftId=draft_event"));
    draftEventQueryResult = {
      _id: "draft_event",
      name: "Stored Draft",
      hosts: ["Stored Host"],
      location: "Stored Room",
      eventDate: Date.UTC(2030, 4, 1, 22, 0),
      eventTimezone: "UTC",
      maxAttendees: 2,
      status: "inactive",
      lifecycle: "draft",
      themeBackgroundColor: "#0A0B0C",
      themeTextColor: "#DDEEFF",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as unknown as Event;
    credentialQueryResult = [
      {
        _id: "credential_press",
        listKey: "press",
        password: "blue-door",
        generateQR: true,
        sendQrOnApproval: true,
        approvalMessage: "Press approved.",
        autoApproveLimit: 25,
        autoApproveDelayMinutes: 0,
      },
    ];

    render(<EventCreateWizard />);

    await screen.findByDisplayValue("Stored Draft");
    await waitFor(() => {
      const saveDraftButton = screen.getByRole("button", {
        name: "Save & finish later",
      }) as HTMLButtonElement;
      expect(saveDraftButton.disabled).toBe(false);
    });
    fireEvent.click(screen.getByRole("button", { name: "Save & finish later" }));

    await waitFor(() => {
      const updateCall = actionCalls.find((actionCall) => actionCall.actionName === "update");
      expect(updateCall).toBeDefined();
      const updateArgs = updateCall?.args as {
        patch: { location: string; themeBackgroundColor: string; themeTextColor: string };
        lists: ListPayload[];
      };
      expect(updateArgs.patch.location).toBe("Stored Room");
      expect(updateArgs.patch.themeBackgroundColor).toBe("#0A0B0C");
      expect(updateArgs.patch.themeTextColor).toBe("#DDEEFF");
      expect(updateArgs.lists).toContainEqual({
        id: "credential_press",
        listKey: "press",
        password: "blue-door",
        generateQR: true,
        sendQrOnApproval: true,
        approvalMessage: "Press approved.",
        autoApproveLimit: 25,
        autoApproveDelayMinutes: 0,
      });
    });
  });

  it("publishes existing drafts through updateAndPublish with the full patch and lists", async () => {
    setNavigationSearchParams(new URLSearchParams("draftId=draft_event"));
    draftEventQueryResult = {
      _id: "draft_event",
      name: "Stored Draft",
      hosts: ["Stored Host"],
      location: "Stored Room",
      eventDate: Date.UTC(2030, 4, 1, 22, 0),
      eventTimezone: "UTC",
      maxAttendees: 2,
      status: "inactive",
      lifecycle: "draft",
      themeBackgroundColor: "#0A0B0C",
      themeTextColor: "#DDEEFF",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as unknown as Event;
    credentialQueryResult = [
      {
        _id: "credential_press",
        listKey: "press",
        password: "blue-door",
        generateQR: true,
        sendQrOnApproval: true,
        approvalMessage: "Press approved.",
        autoApproveLimit: 25,
      },
    ];

    render(<EventCreateWizard />);

    await screen.findByDisplayValue("Stored Draft");
    await waitFor(() => {
      const saveDraftButton = screen.getByRole("button", {
        name: "Save & finish later",
      }) as HTMLButtonElement;
      expect(saveDraftButton.disabled).toBe(false);
    });
    fireEvent.click(screen.getByRole("button", { name: /Review & publish/ }));
    await screen.findByRole("heading", { name: "Review & publish" });
    fireEvent.click(screen.getByRole("button", { name: "Publish event" }));

    await waitFor(() => {
      const publishCall = actionCalls.find(
        (actionCall) => actionCall.actionName === "updateAndPublish",
      );
      expect(publishCall).toBeDefined();
      const publishArgs = publishCall?.args as {
        eventId: string;
        patch: { location: string; themeBackgroundColor: string; themeTextColor: string };
        lists: ListPayload[];
      };
      expect(publishArgs.eventId).toBe("draft_event");
      expect(publishArgs.patch.location).toBe("Stored Room");
      expect(publishArgs.patch.themeBackgroundColor).toBe("#0A0B0C");
      expect(publishArgs.patch.themeTextColor).toBe("#DDEEFF");
      expect(publishArgs.lists).toContainEqual({
        id: "credential_press",
        listKey: "press",
        password: "blue-door",
        generateQR: true,
        sendQrOnApproval: true,
        approvalMessage: "Press approved.",
        autoApproveLimit: 25,
        autoApproveDelayMinutes: 0,
      });
    });
    expect(actionCalls.some((actionCall) => actionCall.actionName === "update")).toBe(false);
  });

  it("adds a creation wizard step for per-list confirmation texts and submits them", async () => {
    render(<EventCreateWizard />);

    fireEvent.change(screen.getByPlaceholderText("Pomodoro 14"), {
      target: { value: "Spring Gala" },
    });
    await clickContinue();
    await screen.findByRole("heading", { name: "Schedule & capacity" });

    fireEvent.change(screen.getByPlaceholderText(/Bushwick/), {
      target: { value: "Main Room" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set event date" }));
    await clickContinue();
    await screen.findByRole("heading", { name: "Branding" });

    await clickContinue();
    await screen.findByRole("heading", { name: "Flyer" });
    await clickContinue();
    await screen.findByRole("heading", { name: "Guest page" });
    await clickContinue();
    await screen.findByRole("heading", { name: "Lists & access" });
    fireEvent.change(screen.getByLabelText("Auto-approve limit for vip"), {
      target: { value: "50" },
    });
    await clickContinue();
    await screen.findByRole("heading", { name: "Messages" });

    expect(screen.getByLabelText("Send initial confirmation text")).toBeChecked();
    fireEvent.change(screen.getByLabelText("Confirmation copy"), {
      target: {
        value:
          "Thanks {{firstName}} — your RSVP for {{eventName}} at {{eventLocation}} is pending.",
      },
    });
    expect(
      screen.getByText("DOJO: Thanks John — your RSVP for Spring Gala at Main Room is pending."),
    ).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText(/Use {{firstName}}/)).toHaveLength(3);

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
    const includeTicketLinkCheckboxes = screen.getAllByLabelText("Include ticket link");
    expect(includeTicketLinkCheckboxes[0]).toBeChecked();
    fireEvent.click(includeTicketLinkCheckboxes[0]);
    expect(includeTicketLinkCheckboxes[0]).not.toBeChecked();

    await clickContinue();
    await screen.findByRole("heading", { name: "RSVP setup" });
    await clickContinue();
    await screen.findByRole("heading", { name: "Review & publish" });

    fireEvent.click(screen.getByRole("button", { name: /Publish/ }));

    await waitFor(() => {
      const createArgs = getCreateEventActionArgs();
      expect(createArgs.rsvpConfirmationMessageEnabled).toBe(true);
      expect(createArgs.rsvpConfirmationMessage).toBe(
        "Thanks {{firstName}} — your RSVP for {{eventName}} at {{eventLocation}} is pending.",
      );
      expect(createArgs.lists).toContainEqual({
        listKey: "vip",
        password: "",
        generateQR: true,
        sendQrOnApproval: true,
        includeTicketLinkOnApproval: false,
        approvalMessage:
          "Hi {{ firstName }}, approved for {{eventName}} at {{eventLocation}} on {{eventDate}}. Ticket: {{qrCodeUrl}}",
        autoApproveLimit: 50,
        autoApproveDelayMinutes: 0,
      });
    });
  });

  it("adds an edit dialog tab that hydrates per-list and fallback confirmation texts", async () => {
    actionHookFallbackHandlers = [mockUpdateActionHandler, mockGetStoredPasswordsActionHandler];
    actionHookFallbackIndex = 0;
    credentialQueryResult = [
      {
        _id: "credential_vip",
        listKey: "vip",
        hasPassword: true,
        generateQR: true,
        sendQrOnApproval: true,
        includeTicketLinkOnApproval: false,
        approvalMessage: "Hi {{firstName}}, VIP for {{eventName}}.",
        autoApproveLimit: 40,
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
      smsOptInConfirmationMessage: "Welcome to {{eventName}} texts, {{firstName}}.",
      smsOptOutConfirmationMessage: "{{firstName}}, texts are off for {{eventName}}.",
      rsvpConfirmationMessageEnabled: false,
      rsvpConfirmationMessage: "Submitted for {{eventName}}.",
      approvalMessage: "Legacy {{eventLocation}} copy.",
      qrDeliveryMessage: "Ticket for {{eventName}}: {{qrCodeUrl}}",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as unknown as Event;

    render(<EditEventDialog event={event} open onOpenChange={() => {}} showTrigger={false} />);

    expect(screen.getByRole("button", { name: "Messages" })).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByDisplayValue("Hi {{firstName}}, VIP for {{eventName}}."),
      ).toBeInTheDocument();
      expect(
        screen.getByDisplayValue("Welcome to {{eventName}} texts, {{firstName}}."),
      ).toBeInTheDocument();
      expect(screen.getByText("DOJO: Welcome to Spring Gala texts, John.")).toBeInTheDocument();
      expect(
        screen.getByDisplayValue("{{firstName}}, texts are off for {{eventName}}."),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Send initial confirmation text")).not.toBeChecked();
      expect(screen.getByDisplayValue("Submitted for {{eventName}}.")).toBeInTheDocument();
      expect(screen.getByText("No initial confirmation text will send.")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Legacy {{eventLocation}} copy.")).toBeInTheDocument();
      expect(screen.getByText("Hi John, VIP for Spring Gala.")).toBeInTheDocument();
      expect(screen.getByText(/Legacy Main Room copy\./)).toBeInTheDocument();
      expect(screen.getAllByLabelText("Attach generated QR code")[0]).toBeChecked();
      expect(screen.getAllByLabelText("Include ticket link")[0]).not.toBeChecked();
      expect(screen.getByDisplayValue("40")).toBeInTheDocument();
      expect(
        screen.getByDisplayValue("Ticket for {{eventName}}: {{qrCodeUrl}}"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Ticket for Spring Gala: https://example.com/ticket"),
      ).toBeInTheDocument();
    });
  });

  it("saves subscription and ticket-delivery templates from the event Messages tab", async () => {
    actionHookFallbackHandlers = [mockUpdateActionHandler, mockGetStoredPasswordsActionHandler];
    actionHookFallbackIndex = 0;
    credentialQueryResult = [
      {
        _id: "credential_vip",
        listKey: "vip",
        hasPassword: false,
        generateQR: true,
      },
    ];

    const event = {
      _id: "event_1",
      name: "Spring Gala",
      hosts: ["Host One"],
      location: "Main Room",
      eventDate: Date.now() + 60_000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as unknown as Event;

    render(
      <EditEventDialog
        event={event}
        open
        initialTab="confirmations"
        onOpenChange={() => {}}
        showTrigger={false}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Subscribed copy")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText("Subscribed copy"), {
      target: { value: "Welcome {{firstName}} to {{eventName}} texts." },
    });
    fireEvent.change(screen.getByLabelText("Unsubscribed copy"), {
      target: { value: "Texts are off for {{eventName}}. Reply START anytime." },
    });
    fireEvent.change(screen.getByLabelText("Ticket copy"), {
      target: { value: "Your {{eventName}} ticket: {{qrCodeUrl}}" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Messages" }));

    await waitFor(() => {
      const updateCall = actionCalls.find((actionCall) => actionCall.actionName === "update");
      expect(updateCall).toBeDefined();
      const updateArgs = updateCall?.args as {
        patch: {
          smsOptInConfirmationMessage?: string;
          smsOptOutConfirmationMessage?: string;
          qrDeliveryMessage?: string;
        };
      };
      expect(updateArgs.patch).toMatchObject({
        smsOptInConfirmationMessage: "Welcome {{firstName}} to {{eventName}} texts.",
        smsOptOutConfirmationMessage: "Texts are off for {{eventName}}. Reply START anytime.",
        qrDeliveryMessage: "Your {{eventName}} ticket: {{qrCodeUrl}}",
      });
    });
  });

  it("saves an updated per-list auto-approve limit and delay", async () => {
    actionHookFallbackHandlers = [mockUpdateActionHandler, mockGetStoredPasswordsActionHandler];
    actionHookFallbackIndex = 0;
    credentialQueryResult = [
      {
        _id: "credential_vip",
        listKey: "vip",
        hasPassword: false,
        generateQR: false,
        autoApproveLimit: 10,
        autoApproveDelayMinutes: 120,
      },
    ];
    const event = {
      _id: "event_1",
      name: "Spring Gala",
      hosts: ["Host One"],
      location: "Main Room",
      eventDate: Date.now() + 60_000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as unknown as Event;

    render(
      <EditEventDialog
        event={event}
        open
        initialTab="lists"
        onOpenChange={() => {}}
        showTrigger={false}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Auto-approve first")).toHaveValue(10);
      expect(screen.getByLabelText("Approval timing")).toHaveValue(2);
      expect(screen.getByLabelText("Auto-approve delay unit for vip")).toHaveValue("hours");
    });
    fireEvent.change(screen.getByLabelText("Auto-approve first"), {
      target: { value: "50" },
    });
    fireEvent.change(screen.getByLabelText("Approval timing"), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Lists & Access" }));

    await waitFor(() => {
      const updateCall = actionCalls.find((actionCall) => actionCall.actionName === "update");
      expect(updateCall).toBeDefined();
      const updateArgs = updateCall?.args as { lists: ListPayload[] };
      expect(updateArgs.lists).toContainEqual(
        expect.objectContaining({
          id: "credential_vip",
          listKey: "vip",
          autoApproveLimit: 50,
          autoApproveDelayMinutes: 180,
        }),
      );
    });
  });

  it("submits edit dialog changes when the initial confirmation text is disabled", async () => {
    actionHookFallbackHandlers = [mockUpdateActionHandler, mockGetStoredPasswordsActionHandler];
    actionHookFallbackIndex = 0;
    credentialQueryResult = [
      {
        _id: "credential_vip",
        listKey: "vip",
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
      rsvpConfirmationMessageEnabled: true,
      rsvpConfirmationMessage: "We got your RSVP for {{eventName}}.",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as unknown as Event;

    render(
      <EditEventDialog
        event={event}
        open
        initialTab="confirmations"
        onOpenChange={() => {}}
        showTrigger={false}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Send initial confirmation text")).toBeChecked();
    });
    fireEvent.click(screen.getByLabelText("Send initial confirmation text"));
    fireEvent.click(screen.getByRole("button", { name: "Save Messages" }));

    await waitFor(() => {
      const updateCall = actionCalls.find((actionCall) => actionCall.actionName === "update");
      expect(updateCall).toBeDefined();
      const updateArgs = updateCall?.args as {
        patch: { rsvpConfirmationMessageEnabled?: boolean };
      };
      expect(updateArgs.patch.rsvpConfirmationMessageEnabled).toBe(false);
    });
  });
});
