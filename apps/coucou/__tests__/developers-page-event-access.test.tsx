import { beforeEach, describe, expect, it, mock } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AnyFunctionReference } from "convex/server";
import { getFunctionName } from "convex/server";
import { HapticProvider } from "../contexts/haptic-context";

type ConvexFunctionReference = AnyFunctionReference;

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
  location: "Main Room",
  eventDate: 1_753_000_000_000,
  createdAt: 1_752_000_000_000,
  updatedAt: 1_752_000_000_000,
};

const mutationCalls: Array<{ functionName: string; args: Record<string, unknown> }> = [];

interface ApiClientRecord {
  apiClientId: string;
  displayName: string;
  keyPrefix: string;
  scopes: string[];
  defaultRsvpListKey: string | null;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
  eventAccessMode: "all" | "selected";
  allowedEventIds: string[];
  isLegacyAllEventsAccess: boolean;
}

interface WebhookEndpointRecord {
  endpointId: string;
  url: string;
  description: string | null;
  subscribedEventTypes: string[];
  isActive: boolean;
  disabledReason: "manual" | "auto_failure" | null;
  secretGeneration: number;
  consecutiveFailureCount: number;
  createdAt: number;
  updatedAt: number;
  eventAccessMode: "all" | "selected";
  allowedEventIds: string[];
  isLegacyAllEventsAccess: boolean;
}

let apiClientRecords: ApiClientRecord[] = [];
let webhookEndpointRecords: WebhookEndpointRecord[] = [];

function mockUseQuery(queryReference: ConvexFunctionReference, args: unknown) {
  if (args === "skip") return undefined;
  const functionName = getFunctionName(queryReference);
  if (functionName === "events:listAll") return [eventRecord];
  if (functionName === "apiClients:listForWorkspace") return apiClientRecords;
  if (functionName === "webhookEndpoints:listForWorkspace") return webhookEndpointRecords;
  return undefined;
}

function mockUseMutation(mutationReference: ConvexFunctionReference) {
  const functionName = getFunctionName(mutationReference);
  return async (args: Record<string, unknown>) => {
    mutationCalls.push({ functionName, args });
    if (functionName === "apiClients:create") {
      return {
        apiClientId: "api_client_123",
        plaintextKey: "coucou_sk_secret",
        keyPrefix: "coucou_sk_secr",
      };
    }
    if (functionName === "webhookEndpoints:create") {
      return {
        endpointId: "endpoint_123",
        encryptionSecretBase64: "encryption_secret",
        signingSecretBase64: "signing_secret",
        secretGeneration: 1,
      };
    }
    return { ok: true };
  };
}

mock.module("convex/react", () => ({
  useMutation: mockUseMutation,
  useQuery: mockUseQuery,
}));

mock.module("@/lib/use-workspace-scope", () => ({
  useWorkspaceOperationPath: (_surface: string, pathname = "") =>
    pathname ? `/host/${pathname}` : "/host",
  useWorkspaceScope: () => workspaceScope,
}));

const { default: DevelopersPage } = await import(
  "../app/workspaces/[workspaceSlug]/host/developers/page"
);

describe("DevelopersPage event access", () => {
  beforeEach(() => {
    mutationCalls.length = 0;
    apiClientRecords = [];
    webhookEndpointRecords = [];
  });

  it("requires and submits selected-event access for new API keys", async () => {
    render(
      <HapticProvider>
        <DevelopersPage />
      </HapticProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "The Market" },
    });
    const eventLabel = screen.getByText(/Dojo Night/).closest("label");
    const eventCheckbox = eventLabel?.querySelector("button");
    if (!eventCheckbox) throw new Error("Expected selected-event checkbox");
    fireEvent.click(eventCheckbox);
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));

    await waitFor(() => {
      expect(
        mutationCalls.some((mutationCall) => mutationCall.functionName === "apiClients:create"),
      ).toBe(true);
    });
    const createCall = mutationCalls.find(
      (mutationCall) => mutationCall.functionName === "apiClients:create",
    );
    expect(createCall?.args).toMatchObject({
      workspaceSlug: "dojo-pomodoro",
      displayName: "The Market",
      eventAccessMode: "selected",
      allowedEventIds: ["event_123"],
    });
  });

  it("edits an API key grant independently", async () => {
    apiClientRecords = [
      {
        apiClientId: "api_client_existing",
        displayName: "The Market",
        keyPrefix: "coucou_sk_mark",
        scopes: ["events:read", "rsvps:read"],
        defaultRsvpListKey: null,
        createdAt: 1_752_000_000_000,
        lastUsedAt: null,
        revokedAt: null,
        eventAccessMode: "selected",
        allowedEventIds: ["event_123"],
        isLegacyAllEventsAccess: false,
      },
    ];
    render(
      <HapticProvider>
        <DevelopersPage />
      </HapticProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Event access" }));
    const allEventsLabel = screen.getByText("All current and future events").closest("label");
    const allEventsCheckbox = allEventsLabel?.querySelector("button");
    if (!allEventsCheckbox) throw new Error("Expected all-events checkbox");
    fireEvent.click(allEventsCheckbox);
    fireEvent.click(screen.getByRole("button", { name: "Save event access" }));

    await waitFor(() => {
      expect(
        mutationCalls.some(
          (mutationCall) => mutationCall.functionName === "apiClients:updateEventAccess",
        ),
      ).toBe(true);
    });
    const updateCall = mutationCalls.find(
      (mutationCall) => mutationCall.functionName === "apiClients:updateEventAccess",
    );
    expect(updateCall?.args).toEqual({
      workspaceSlug: "dojo-pomodoro",
      apiClientId: "api_client_existing",
      eventAccessMode: "all",
      allowedEventIds: undefined,
    });
  });

  it("edits a webhook endpoint grant independently", async () => {
    webhookEndpointRecords = [
      {
        endpointId: "endpoint_existing",
        url: "https://partner.example.com/coucou",
        description: "Partner production",
        subscribedEventTypes: ["rsvp.created"],
        isActive: true,
        disabledReason: null,
        secretGeneration: 1,
        consecutiveFailureCount: 0,
        createdAt: 1_752_000_000_000,
        updatedAt: 1_752_000_000_000,
        eventAccessMode: "selected",
        allowedEventIds: ["event_123"],
        isLegacyAllEventsAccess: false,
      },
    ];
    render(
      <HapticProvider>
        <DevelopersPage />
      </HapticProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Event access" }));
    const allEventsLabel = screen.getByText("All current and future events").closest("label");
    const allEventsCheckbox = allEventsLabel?.querySelector("button");
    if (!allEventsCheckbox) throw new Error("Expected all-events checkbox");
    fireEvent.click(allEventsCheckbox);
    fireEvent.click(screen.getByRole("button", { name: "Save event access" }));

    await waitFor(() => {
      expect(
        mutationCalls.some(
          (mutationCall) => mutationCall.functionName === "webhookEndpoints:updateEventAccess",
        ),
      ).toBe(true);
    });
    const updateCall = mutationCalls.find(
      (mutationCall) => mutationCall.functionName === "webhookEndpoints:updateEventAccess",
    );
    expect(updateCall?.args).toEqual({
      workspaceSlug: "dojo-pomodoro",
      endpointId: "endpoint_existing",
      eventAccessMode: "all",
      allowedEventIds: undefined,
    });
  });
});
