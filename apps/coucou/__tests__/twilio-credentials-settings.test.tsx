import { beforeEach, describe, expect, it, mock } from "bun:test";
import { render, screen } from "@testing-library/react";
import { HapticProvider } from "../contexts/haptic-context";

let queryCallIndex = 0;
let credentialConfigurations: unknown;
let eventOptions: unknown;

mock.module("convex/react", () => ({
  useMutation: () => async () => undefined,
  useQuery: () => {
    const response = queryCallIndex % 2 === 0 ? credentialConfigurations : eventOptions;
    queryCallIndex += 1;
    return response;
  },
}));

mock.module("@/lib/use-workspace-scope", () => ({
  useWorkspaceScope: () => ({
    workspaceSlug: "dojo-pomodoro",
    siteKey: "dojo-pomodoro",
    queryArgs: {
      siteKey: "dojo-pomodoro",
      workspaceSlug: "dojo-pomodoro",
    },
  }),
}));

const { TwilioCredentialsSettings } = await import("../components/twilio-credentials-settings");

function renderSettings() {
  return render(
    <HapticProvider>
      <TwilioCredentialsSettings workspaceSlug="dojo-pomodoro" canWrite />
    </HapticProvider>,
  );
}

describe("Twilio credentials settings", () => {
  beforeEach(() => {
    queryCallIndex = 0;
    credentialConfigurations = { workspace: null, events: [] };
    eventOptions = [];
  });

  it("shows Coucou as the fallback when the organizer has no saved account", () => {
    renderSettings();

    expect(screen.getByText("Twilio delivery")).toBeTruthy();
    expect(screen.getByText("Using Coucou’s global account")).toBeTruthy();
    expect(screen.getByLabelText("Account SID")).toBeTruthy();
    expect(screen.getByLabelText("Auth Token").getAttribute("type")).toBe("password");
  });

  it("shows only masked account metadata for configured organizer credentials", () => {
    credentialConfigurations = {
      workspace: {
        eventId: null,
        maskedAccountSid: "AC••••1234",
        fromPhoneNumber: "+15551230001",
        hasAuthToken: true,
        updatedAt: 1,
      },
      events: [],
    };
    renderSettings();

    expect(screen.getByText("Organizer account configured")).toBeTruthy();
    expect(screen.getByText("AC••••1234 · +15551230001")).toBeTruthy();
    expect(screen.queryByText("Auth token configured")).toBeNull();
  });
});
