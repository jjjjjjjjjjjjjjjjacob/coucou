import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { type FunctionReturnType, getFunctionName } from "convex/server";

const queryCalls: Array<{ name: string; args: unknown }> = [];
const mutationCalls: Array<{ name: string; args: unknown }> = [];
let draftResponse: Record<string, unknown> | null | undefined;
let replyActionTargets:
  | FunctionReturnType<typeof api.textBlasts.getReplyActionTargetOptions>
  | undefined;

const destinationEventId = "event_destination" as Id<"events">;
const otherEventId = "event_other" as Id<"events">;
const draftBlastId = "blast_draft" as Id<"textBlasts">;

mock.module("convex/react", () => ({
  useMutation: (reference: Parameters<typeof getFunctionName>[0]) => async (args: unknown) => {
    mutationCalls.push({ name: getFunctionName(reference), args });
    return "mutation_result";
  },
  useQuery: (reference: Parameters<typeof getFunctionName>[0], args: unknown) => {
    const name = getFunctionName(reference);
    queryCalls.push({ name, args });
    if (args === "skip") return undefined;
    if (name.includes("getBlastById")) return draftResponse;
    if (name.includes("getReplyActionTargetOptions")) return replyActionTargets;
    if (name.includes("listAll")) return [];
    if (name === "contactAudiences:get")
      return { status: "ready", eligibleCount: 1, excludedCount: 0, exclusionCounts: {} };
    return undefined;
  },
}));

mock.module("@/lib/use-workspace-scope", () => ({
  useWorkspaceScope: () => ({
    workspaceSlug: "dojo-pomodoro",
    siteKey: "dojo-pomodoro",
    brandName: "Dojo Pomodoro",
    queryArgs: { workspaceSlug: "dojo-pomodoro", siteKey: "dojo-pomodoro" },
  }),
}));

mock.module("@/components/guests/contact-audience-picker", () => ({
  ContactAudiencePicker: () => <div>Contact audience picker</div>,
}));

mock.module("@/components/guests/contact-audience-preview", () => ({
  ContactAudiencePreview: () => <div>Contact audience preview</div>,
}));

const { default: TextBlastDialog } = await import(
  "../app/workspaces/[workspaceSlug]/host/text-blasts/text-blast-dialog"
);
const { HapticProvider } = await import("../contexts/haptic-context");

function renderDialog(blastId?: Id<"textBlasts">, mode: "full" | "replyActions" = "full") {
  return render(
    <HapticProvider>
      <TextBlastDialog isOpen onClose={() => undefined} blastId={blastId} mode={mode} />
    </HapticProvider>,
  );
}

beforeEach(() => {
  queryCalls.length = 0;
  mutationCalls.length = 0;
  draftResponse = undefined;
  replyActionTargets = [
    {
      eventId: destinationEventId,
      eventName: "Destination party",
      eventDate: 1,
      lists: [
        { listKey: "VIP", password: "VIP2026" },
        { listKey: "Friends", password: "FRIENDS2026" },
        { listKey: "General" },
      ],
    },
    {
      eventId: otherEventId,
      eventName: "Other event",
      eventDate: 2,
      lists: [{ listKey: "VIP", password: "OTHERVIP" }],
    },
  ];
});

describe("text blast draft loading", () => {
  it("skips the draft query entirely when composing a new blast", () => {
    renderDialog();

    expect(screen.getByRole("heading", { name: "New text blast" })).toBeTruthy();
    expect(screen.getByText("Contact audience picker")).toBeTruthy();
    expect(screen.queryByText("Could not load the draft.")).toBeNull();
    expect(
      queryCalls.some(
        (queryCall) => queryCall.name.includes("getBlastById") && queryCall.args === "skip",
      ),
    ).toBe(true);
  });

  it("loads an existing draft through the standard Convex subscription", async () => {
    const blastId = "blast_draft" as Id<"textBlasts">;
    draftResponse = {
      _id: blastId,
      name: "Saved draft",
      message: "Hello {{firstName}}",
      status: "draft",
      audience: { type: "contacts", contactIds: [] },
      eventId: undefined,
      includeQrCodes: false,
      replyActions: [],
      targetEventIds: [],
      targetLists: [],
    };

    renderDialog(blastId);

    await waitFor(() => expect(screen.getByText("Contact audience picker")).toBeTruthy());
    expect(screen.getByRole("heading", { name: "Edit text blast" })).toBeTruthy();
    expect(
      queryCalls.some(
        (queryCall) =>
          queryCall.name.includes("getBlastById") &&
          (queryCall.args as { blastId?: string }).blastId === blastId,
      ),
    ).toBe(true);
  });
});

function loadReplyActionDraft(replyCode: string) {
  draftResponse = {
    _id: draftBlastId,
    name: "Saved draft",
    message: "Hello {{firstName}}",
    status: "draft",
    audience: { type: "contacts", contactIds: [] },
    replyActions: [
      {
        _id: "reply_action",
        replyCode,
        targetEventId: destinationEventId,
        targetListKey: "VIP",
        isEnabled: true,
      },
    ],
  };
}

describe("reply action passwords", () => {
  it("reviews effective passwords, destinations, and enabled state before sending", async () => {
    loadReplyActionDraft("DISCARDED");
    renderDialog(draftBlastId);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Use a different password" }));

    fireEvent.click(screen.getByRole("button", { name: "Add reply action" }));
    fireEvent.change(screen.getAllByRole("combobox", { name: "Destination event" })[1], {
      target: { value: otherEventId },
    });
    fireEvent.change(screen.getAllByRole("combobox", { name: "Destination list" })[1], {
      target: { value: "VIP" },
    });
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Enabled" })[1]);
    fireEvent.click(screen.getByRole("button", { name: "Review audience" }));

    const reviewSection = await screen.findByRole("region", { name: "Reply actions" });
    const reviewedActions = within(reviewSection).getAllByRole("listitem");
    expect(reviewedActions).toHaveLength(2);
    expect(reviewedActions[0]).toHaveTextContent("VIP2026");
    expect(within(reviewedActions[0]).getByText("Destination party")).toBeInTheDocument();
    expect(within(reviewedActions[0]).getByText("VIP")).toBeInTheDocument();
    expect(within(reviewedActions[0]).getByText("Enabled")).toBeInTheDocument();
    expect(reviewedActions[1]).toHaveTextContent("OTHERVIP");
    expect(reviewedActions[1]).toHaveTextContent("Other event");
    expect(within(reviewedActions[1]).getByText("Disabled")).toBeInTheDocument();
    expect(within(reviewSection).queryByText("DISCARDED")).toBeNull();
    expect(screen.getByRole("button", { name: "Send to 1 contacts" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Use a different password" })[0]);
    fireEvent.change(screen.getAllByRole("textbox", { name: "Reply password" })[0], {
      target: { value: "CUSTOM_REVIEW" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review audience" }));

    const updatedReview = await screen.findByRole("region", { name: "Reply actions" });
    expect(within(updatedReview).getByText("CUSTOM_REVIEW")).toBeInTheDocument();
    expect(within(updatedReview).queryByText("VIP2026")).toBeNull();
    expect(mutationCalls.map((call) => call.name)).toEqual([
      "contactAudiences:prepare",
      "contactAudiences:prepare",
    ]);
  });

  it("uses the list password for a new action and saves it when the override is cleared", async () => {
    loadReplyActionDraft("VIP2026");
    draftResponse = { ...draftResponse, replyActions: [] };
    renderDialog(draftBlastId, "replyActions");

    fireEvent.click(screen.getByRole("button", { name: "Add reply action" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Destination event" }), {
      target: { value: destinationEventId },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Destination list" }), {
      target: { value: "VIP" },
    });

    const passwordInput = screen.getByRole("textbox", { name: "Reply password" });
    const overrideCheckbox = screen.getByRole("checkbox", { name: "Use a different password" });
    expect(passwordInput).toHaveValue("VIP2026");
    expect(passwordInput).toBeDisabled();
    expect(overrideCheckbox).not.toBeChecked();

    fireEvent.click(overrideCheckbox);
    expect(passwordInput).toBeEnabled();
    fireEvent.change(passwordInput, { target: { value: "CUSTOM" } });
    fireEvent.click(overrideCheckbox);
    expect(passwordInput).toHaveValue("VIP2026");
    expect(passwordInput).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Save reply actions" }));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: "textBlasts:updateReplyActions",
        args: {
          blastId: draftBlastId,
          workspaceSlug: "dojo-pomodoro",
          siteKey: "dojo-pomodoro",
          replyActions: [
            {
              replyCode: "VIP2026",
              targetEventId: destinationEventId,
              targetListKey: "VIP",
              isEnabled: true,
            },
          ],
        },
      }),
    );
  });

  it("preserves a saved custom password and submits edits", async () => {
    loadReplyActionDraft("CUSTOM");
    renderDialog(draftBlastId, "replyActions");

    const passwordInput = screen.getByRole("textbox", { name: "Reply password" });
    expect(passwordInput).toHaveValue("CUSTOM");
    expect(passwordInput).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "Use a different password" })).toBeChecked();

    fireEvent.change(passwordInput, { target: { value: "UPDATED" } });
    fireEvent.click(screen.getByRole("button", { name: "Save reply actions" }));
    await waitFor(() =>
      expect(mutationCalls[0]?.args).toMatchObject({
        replyActions: [{ replyCode: "UPDATED" }],
      }),
    );
  });

  it("resets the override when changing destinations and allows passwords for unprotected lists", () => {
    loadReplyActionDraft("CUSTOM");
    renderDialog(draftBlastId, "replyActions");

    const passwordInput = screen.getByRole("textbox", { name: "Reply password" });
    const destinationList = screen.getByRole("combobox", { name: "Destination list" });
    fireEvent.change(destinationList, { target: { value: "Friends" } });
    expect(passwordInput).toHaveValue("FRIENDS2026");
    expect(passwordInput).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Use a different password" })).not.toBeChecked();

    fireEvent.change(destinationList, { target: { value: "General" } });
    expect(passwordInput).toHaveValue("");
    expect(passwordInput).toBeEnabled();
    expect(screen.queryByRole("checkbox", { name: "Use a different password" })).toBeNull();
    fireEvent.change(passwordInput, { target: { value: "GENERAL" } });
    expect(passwordInput).toHaveValue("GENERAL");

    fireEvent.change(screen.getByRole("combobox", { name: "Destination event" }), {
      target: { value: otherEventId },
    });
    expect(passwordInput).toHaveValue("");
    expect(destinationList).toHaveValue("");
    fireEvent.change(destinationList, { target: { value: "VIP" } });
    expect(passwordInput).toHaveValue("OTHERVIP");
    expect(passwordInput).toBeDisabled();
  });

  it("waits for list passwords before restoring the override state of a saved draft", () => {
    loadReplyActionDraft("VIP2026");
    const loadedTargets = replyActionTargets;
    replyActionTargets = undefined;
    const dialog = renderDialog(draftBlastId, "replyActions");
    expect(screen.getByRole("status")).toHaveTextContent("Loading draft");

    replyActionTargets = loadedTargets;
    dialog.rerender(
      <HapticProvider>
        <TextBlastDialog
          isOpen
          onClose={() => undefined}
          blastId={draftBlastId}
          mode="replyActions"
        />
      </HapticProvider>,
    );
    expect(screen.getByRole("textbox", { name: "Reply password" })).toHaveValue("VIP2026");
    expect(screen.getByRole("textbox", { name: "Reply password" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Use a different password" })).not.toBeChecked();
  });
});
