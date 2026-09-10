import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import { render, screen, waitFor } from "@testing-library/react";
import { getFunctionName } from "convex/server";

const queryCalls: Array<{ name: string; args: unknown }> = [];
let draftResponse: Record<string, unknown> | null | undefined;

mock.module("convex/react", () => ({
  useMutation: () => async () => "mutation_result",
  useQuery: (reference: Parameters<typeof getFunctionName>[0], args: unknown) => {
    const name = getFunctionName(reference);
    queryCalls.push({ name, args });
    if (args === "skip") return undefined;
    if (name.includes("getBlastById")) return draftResponse;
    if (name.includes("listAll") || name.includes("getReplyActionTargetOptions")) return [];
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

function renderDialog(blastId?: Id<"textBlasts">) {
  return render(
    <HapticProvider>
      <TextBlastDialog isOpen onClose={() => undefined} blastId={blastId} />
    </HapticProvider>,
  );
}

beforeEach(() => {
  queryCalls.length = 0;
  draftResponse = undefined;
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
